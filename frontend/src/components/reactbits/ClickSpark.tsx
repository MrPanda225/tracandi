/*
 * Adapted from React Bits — ClickSpark (https://reactbits.dev), © David Haz, MIT + Commons Clause (see LICENSE.md).
 * Changes: the animation frame loop only runs while sparks are alive (the original loops forever), options object,
 * no effect when the user prefers reduced motion.
 */
import { type MouseEvent, type ReactNode, useCallback, useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

interface ClickSparkProps {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  children?: ReactNode;
}

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

const easeOut = (t: number) => t * (2 - t);

/** Draws short radial sparks where the user clicks, on a canvas laid over its children. */
export function ClickSpark({
  sparkColor = '#9b4e35',
  sparkSize = 10,
  sparkRadius = 18,
  sparkCount = 8,
  duration = 420,
  children,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const resize = () => {
      const { width, height } = parent.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const drawSpark = useCallback(
    (context: CanvasRenderingContext2D, spark: Spark, eased: number) => {
      const distance = eased * sparkRadius;
      const length = sparkSize * (1 - eased);
      context.strokeStyle = sparkColor;
      context.lineWidth = 2;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(spark.x + distance * Math.cos(spark.angle), spark.y + distance * Math.sin(spark.angle));
      context.lineTo(
        spark.x + (distance + length) * Math.cos(spark.angle),
        spark.y + (distance + length) * Math.sin(spark.angle),
      );
      context.stroke();
    },
    [sparkColor, sparkRadius, sparkSize],
  );

  const draw = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= duration) return false;
        drawSpark(context, spark, easeOut(elapsed / duration));
        return true;
      });
      frameRef.current = sparksRef.current.length > 0 ? requestAnimationFrame(draw) : null;
    },
    [drawSpark, duration],
  );

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion()) return;
    const rect = canvas.getBoundingClientRect();
    const now = performance.now();
    const sparks = Array.from({ length: sparkCount }, (_, index) => ({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      angle: (2 * Math.PI * index) / sparkCount,
      startTime: now,
    }));
    sparksRef.current.push(...sparks);
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(draw);
  };

  return (
    <div style={{ position: 'relative' }} onClick={handleClick}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
      {children}
    </div>
  );
}
