/*
 * Adapted from React Bits — Noise (https://reactbits.dev), © David Haz, MIT + Commons Clause (see LICENSE.md).
 * Changes: fills its positioned parent instead of the viewport, 256 px tile stretched (the original redraws
 * 1024 × 1024 px every 2 frames), refresh throttled to ~12 fps, static grain when the user prefers reduced motion.
 */
import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

interface NoiseProps {
  /** Grain opacity, 0–255. */
  patternAlpha?: number;
  /** Milliseconds between two grain redraws. */
  refreshIntervalMs?: number;
}

const TILE_SIZE = 256;
const CHANNELS = 4;
const MAX_BYTE = 255;

/** Animated film grain laid over its positioned parent, for texture. */
export function Noise({ patternAlpha = 14, refreshIntervalMs = 80 }: NoiseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;

    const drawGrain = () => {
      const image = context.createImageData(TILE_SIZE, TILE_SIZE);
      for (let index = 0; index < image.data.length; index += CHANNELS) {
        const value = Math.random() * MAX_BYTE;
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = patternAlpha;
      }
      context.putImageData(image, 0, 0);
    };

    drawGrain();
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(drawGrain, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [patternAlpha, refreshIntervalMs]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        imageRendering: 'pixelated',
        mixBlendMode: 'overlay',
      }}
    />
  );
}
