import { type ReactNode, useId } from 'react';
import './Breakdown.css';

export interface BreakdownRow {
  key: string;
  label: ReactNode;
  count: number;
  color: string;
  detail?: string;
}

interface BreakdownProps {
  title: string;
  rows: readonly BreakdownRow[];
  emptyLabel: string;
}

/**
 * Horizontal bars sized against the largest row — a Five Hat Racks "category" axis (ux-design), used for the
 * status, channel and contract-type breakdowns (EF-TDB-05, 06, 09). Never colour alone: label and count are text.
 */
export function Breakdown({ title, rows, emptyLabel }: BreakdownProps) {
  const titleId = useId();
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    // A named region: the status label repeats in the follow-up list, so each section needs its own scope
    // (WCAG landmarks; also lets tests target this list without relying on incidental page position).
    <section className="breakdown" aria-labelledby={titleId}>
      <h2 id={titleId} className="breakdown__title">
        {title}
      </h2>
      {total === 0 ? (
        <p className="breakdown__empty">{emptyLabel}</p>
      ) : (
        <ul className="breakdown__list">
          {rows.map((row) => (
            <li key={row.key} className="breakdown__row">
              <div className="breakdown__row-header">
                <span className="breakdown__label">{row.label}</span>
                <span className="breakdown__count">
                  {row.count}
                  {row.detail && <span className="breakdown__detail"> · {row.detail}</span>}
                </span>
              </div>
              <span className="breakdown__track">
                <span
                  className="breakdown__fill"
                  style={{ width: `${(row.count / max) * 100}%`, background: row.color }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
