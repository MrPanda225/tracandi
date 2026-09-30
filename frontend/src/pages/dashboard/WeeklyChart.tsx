import { useId, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  type XAxisTickContentProps,
  YAxis,
} from 'recharts';
import type { Dashboard } from '../../api/stats';
import { formatDayShortMonth, formatInteger, formatWeekRange } from '../../lib/format';
import { prefersReducedMotion } from '../../lib/motion';
import './WeeklyChart.css';

interface WeeklyChartProps {
  weekly: Dashboard['weekly'];
  /** Grows the bars; ignored when the user asked the system to reduce motion. */
  isAnimated: boolean;
}

type SeriesKey = 'sent' | 'interviews' | 'rejected';

/*
 * bi-dashboard-design: the volume sent is context, drawn in the neutral ink; the interviews are the one accent
 * (Von Restorff), the refusals keep their status colour. Same colours as the status tags (consistency).
 */
const SERIES: readonly { key: SeriesKey; label: string; color: string }[] = [
  { key: 'sent', label: 'Envoyées', color: 'var(--color-mauve)' },
  { key: 'interviews', label: 'Entretiens', color: 'var(--status-interview)' },
  { key: 'rejected', label: 'Refusées', color: 'var(--status-rejected)' },
];

const CURRENT_WEEK = 'Cette semaine';
// The current week is not over: its bars are drawn lighter, so that a low figure does not read as a drop.
const CURRENT_WEEK_OPACITY = 0.55;
const ANIMATION_MS = 600;
const SERIES_STAGGER_MS = 120;

interface WeekDatum {
  weekStart: string;
  sent: number;
  interviews: number;
  rejected: number;
  isCurrent: boolean;
  /** Axis label: the Monday of the week (« 7 sept. »). */
  tick: string;
  /** « 7 – 13 sept. » */
  range: string;
}

const toData = (weekly: Dashboard['weekly']): WeekDatum[] =>
  weekly.map((week, index) => {
    const isCurrent = index === weekly.length - 1;
    return {
      ...week,
      isCurrent,
      tick: formatDayShortMonth(week.weekStart),
      range: formatWeekRange(week.weekStart),
    };
  });

/** EF-TDB-10: the gap to the previous week, in words for the accessible name, as a sign for the eye. */
const describeGap = (gap: number): { words: string; sign: string } => {
  if (gap > 0) return { words: `${formatInteger(gap)} de plus que la semaine dernière`, sign: `▲ ${gap}` };
  if (gap < 0) return { words: `${formatInteger(-gap)} de moins que la semaine dernière`, sign: `▼ ${-gap}` };
  return { words: 'autant que la semaine dernière', sign: '=' };
};

/**
 * EF-TDB-10: this week's three figures, each with its gap to the previous week. They are the legend of the chart
 * too, and hide or show their series (Hick: no separate filter to learn).
 */
function ThisWeek({
  current,
  previous,
  hidden,
  onToggle,
}: {
  current: WeekDatum;
  previous: WeekDatum | undefined;
  hidden: ReadonlySet<SeriesKey>;
  onToggle: (key: SeriesKey) => void;
}) {
  return (
    <div className="weekly-chart__this-week" role="group" aria-label={CURRENT_WEEK}>
      {SERIES.map((series) => {
        const value = current[series.key];
        const gap = describeGap(value - (previous?.[series.key] ?? 0));
        const isShown = !hidden.has(series.key);
        return (
          <button
            key={series.key}
            type="button"
            className="weekly-chart__figure"
            aria-pressed={isShown}
            aria-label={`${series.label} : ${formatInteger(value)} cette semaine, ${gap.words}`}
            title={isShown ? 'Masquer du graphique' : 'Afficher dans le graphique'}
            onClick={() => onToggle(series.key)}
          >
            <span className="weekly-chart__swatch" style={{ background: series.color }} aria-hidden="true" />
            <span className="weekly-chart__figure-label">{series.label}</span>
            <span className="weekly-chart__figure-value">{formatInteger(value)}</span>
            <span className="weekly-chart__figure-gap">
              {gap.sign} <span className="weekly-chart__figure-gap-note">vs sem. dernière</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const TICK_LINE_HEIGHT = 14;

/**
 * Axis label of a week: its Monday, and « en cours » under the current one — two short lines hold on a phone
 * where « Cette semaine » would overflow the last column (ENF-UTI-02).
 */
function WeekTick({ x, y, week }: { x: number; y: number; week: WeekDatum | undefined }) {
  if (!week) return null;
  return (
    <text x={x} y={y} textAnchor="middle" fill="var(--color-mauve-deep)" fontSize={12}>
      <tspan x={x} dy={TICK_LINE_HEIGHT - 2}>
        {week.tick}
      </tspan>
      {week.isCurrent && (
        <tspan x={x} dy={TICK_LINE_HEIGHT} fontWeight={600} fill="var(--color-ink)">
          en cours
        </tspan>
      )}
    </text>
  );
}

/** Hovered week: its days and the figure of each series shown. */
function WeekTooltip({ week, hidden }: { week: WeekDatum | undefined; hidden: ReadonlySet<SeriesKey> }) {
  if (!week) return null;
  return (
    <div className="weekly-chart__tooltip">
      <p className="weekly-chart__tooltip-title">
        {week.isCurrent
          ? `Cette semaine, en cours (${week.range})`
          : `Semaine du ${week.range.replace(' – ', ' au ')}`}
      </p>
      <dl>
        {SERIES.filter((series) => !hidden.has(series.key)).map((series) => (
          <div key={series.key} className="weekly-chart__tooltip-row">
            <dt>
              <span
                className="weekly-chart__swatch"
                style={{ background: series.color }}
                aria-hidden="true"
              />
              {series.label}
            </dt>
            <dd>{formatInteger(week[series.key])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The same figures as the chart, for screen readers (WCAG 1.1.1: a chart alone says nothing to them). */
function WeeksTable({ data, captionId }: { data: readonly WeekDatum[]; captionId: string }) {
  return (
    <table className="visually-hidden" aria-labelledby={captionId}>
      <thead>
        <tr>
          <th scope="col">Semaine</th>
          {SERIES.map((series) => (
            <th key={series.key} scope="col">
              {series.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((week) => (
          <tr key={week.weekStart}>
            <th scope="row">{week.isCurrent ? CURRENT_WEEK : week.range}</th>
            {SERIES.map((series) => (
              <td key={series.key}>{week[series.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * EF-TDB-04, EF-TDB-10: sent, interviewed and rejected applications for each of the last 5 weeks, as grouped
 * bars with their value written on them (bi-dashboard-design: 5 discrete points compare, they do not trend; no
 * axis to read), the current week lighter and named, and this week compared with the previous one above.
 */
export function WeeklyChart({ weekly, isAnimated }: WeeklyChartProps) {
  const titleId = useId();
  const [hidden, setHidden] = useState<ReadonlySet<SeriesKey>>(new Set());
  const shouldAnimate = isAnimated && !prefersReducedMotion();
  const data = toData(weekly);
  const current = data.at(-1);
  const hasActivity = weekly.some((week) => week.sent > 0 || week.interviews > 0 || week.rejected > 0);

  const toggle = (key: SeriesKey) =>
    setHidden((shown) => {
      const next = new Set(shown);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <section className="weekly-chart" aria-labelledby={titleId}>
      <h2 id={titleId} className="weekly-chart__title">
        Suivi des {weekly.length} dernières semaines
      </h2>
      {hasActivity && current ? (
        <>
          <p className="weekly-chart__lede">Cette semaine, comparée à la précédente</p>
          <ThisWeek current={current} previous={data.at(-2)} hidden={hidden} onToggle={toggle} />
          <div className="weekly-chart__plot" aria-hidden="true">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                // Hidden from screen readers, which read the table below: no keyboard stop inside it either.
                accessibilityLayer={false}
                data={data}
                barGap={3}
                barCategoryGap="24%"
                // Room for the date of the first and last weeks, centred on their bar: on a phone they overflowed.
                margin={{ top: 22, right: 18, bottom: 0, left: 18 }}
              >
                <XAxis
                  dataKey="tick"
                  interval={0}
                  height={40}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-line)' }}
                  tick={(props: XAxisTickContentProps) => (
                    <WeekTick x={Number(props.x)} y={Number(props.y)} week={data[props.index]} />
                  )}
                />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'var(--color-line)', radius: 8 }}
                  content={({ active, payload }) =>
                    active ? (
                      <WeekTooltip week={payload[0]?.payload as WeekDatum | undefined} hidden={hidden} />
                    ) : null
                  }
                />
                {SERIES.map((series, index) => (
                  <Bar
                    key={series.key}
                    dataKey={series.key}
                    name={series.label}
                    fill={series.color}
                    radius={[4, 4, 0, 0]}
                    hide={hidden.has(series.key)}
                    isAnimationActive={shouldAnimate}
                    animationBegin={index * SERIES_STAGGER_MS}
                    animationDuration={ANIMATION_MS}
                  >
                    {data.map((week) => (
                      <Cell key={week.weekStart} fillOpacity={week.isCurrent ? CURRENT_WEEK_OPACITY : 1} />
                    ))}
                    <LabelList
                      dataKey={series.key}
                      position="top"
                      fill="var(--color-ink)"
                      fontSize={12}
                      formatter={(value: unknown) => (typeof value === 'number' && value > 0 ? value : '')}
                    />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <WeeksTable data={data} captionId={titleId} />
        </>
      ) : (
        <p className="weekly-chart__empty">Aucune activité sur cette période pour l’instant.</p>
      )}
    </section>
  );
}
