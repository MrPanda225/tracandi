import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Dashboard } from '../../api/stats';
import { formatDayMonth, formatShortMonth } from '../../lib/format';
import { prefersReducedMotion } from '../../lib/motion';
import './WeeklyChart.css';

interface WeeklyChartProps {
  weekly: Dashboard['weekly'];
  /** Draws the curves progressively; ignored when the user asked the system to reduce motion. */
  isAnimated: boolean;
}

const SERIES = [
  { key: 'sent' as const, label: 'Envoyées', color: 'var(--status-waiting)' },
  { key: 'interviews' as const, label: 'Entretiens', color: 'var(--status-interview)' },
  { key: 'rejected' as const, label: 'Refusées', color: 'var(--status-rejected)' },
];

// Every other week, so the axis stays readable on narrow screens (ENF-UTI-02).
const isTickWeek = (_value: string, index: number) => index % 2 === 0;

/** EF-TDB-04: sent, interviewed and rejected applications for each of the last 16 weeks. */
export function WeeklyChart({ weekly, isAnimated }: WeeklyChartProps) {
  const titleId = useId();
  const shouldAnimate = isAnimated && !prefersReducedMotion();
  const data = weekly.map((week) => ({ ...week, label: formatShortMonth(week.weekStart) }));
  const hasActivity = weekly.some((week) => week.sent > 0 || week.interviews > 0 || week.rejected > 0);

  return (
    <section className="weekly-chart" aria-labelledby={titleId}>
      <h2 id={titleId} className="weekly-chart__title">
        Activité des 16 dernières semaines
      </h2>
      {hasActivity ? (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              {SERIES.map((series) => (
                <linearGradient key={series.key} id={`fill-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={series.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={series.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-mauve-deep)', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-line)' }}
              interval="preserveStartEnd"
              tickFormatter={(value: string, index: number) => (isTickWeek(value, index) ? value : '')}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--color-mauve-deep)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              labelFormatter={(_label, payload) => {
                const weekStart = (payload[0]?.payload as { weekStart?: string } | undefined)?.weekStart;
                return weekStart ? `Semaine du ${formatDayMonth(weekStart)}` : '';
              }}
              contentStyle={{
                background: 'var(--color-canvas-raised)',
                border: '1px solid var(--color-line)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
              }}
            />
            <Legend
              iconType="circle"
              formatter={(value: string) => <span className="weekly-chart__legend">{value}</span>}
            />
            {SERIES.map((series) => (
              <Area
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={series.color}
                fill={`url(#fill-${series.key})`}
                strokeWidth={2}
                activeDot={{ r: 4 }}
                isAnimationActive={shouldAnimate}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="weekly-chart__empty">Aucune activité sur cette période pour l’instant.</p>
      )}
    </section>
  );
}
