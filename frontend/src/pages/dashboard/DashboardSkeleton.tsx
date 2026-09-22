import type { ReactNode } from 'react';
import { Skeleton } from '../../components/Skeleton';
import './DashboardPage.css';
import './DashboardSkeleton.css';
import './KpiCards.css';

const KPI_CARDS = 4;
const BREAKDOWN_PANELS = 3;
const LIST_ROWS = 3;
// Height of the weekly chart (WeeklyChart.tsx), so the page does not jump when the figures arrive.
const CHART_HEIGHT = '260px';

const range = (length: number) => Array.from({ length }, (_, index) => index);

function PanelSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard__panel" aria-hidden="true">
      <div className="dashboard-skeleton__stack">
        <Skeleton width="40%" height="1.1rem" />
        {children}
      </div>
    </div>
  );
}

/**
 * Shape of the dashboard while its first figures load (ENF-UTI-03): same grid, cards and panels as the real
 * screen. The shapes are decorative; the text of the status is what assistive technologies announce.
 */
export function DashboardSkeleton() {
  return (
    <div className="dashboard" role="status" aria-live="polite">
      <span className="visually-hidden">Chargement du tableau de bord…</span>

      <div className="kpi-cards" aria-hidden="true">
        {range(KPI_CARDS).map((index) => (
          <div key={index} className="kpi-card">
            <Skeleton width="65%" height="0.875rem" />
            <Skeleton width="35%" height="2.4rem" />
            <span className="kpi-card__caption">
              <Skeleton width="80%" height="0.8rem" />
            </span>
          </div>
        ))}
      </div>

      <PanelSkeleton>
        <Skeleton width="100%" height={CHART_HEIGHT} />
      </PanelSkeleton>

      <PanelSkeleton>
        {range(LIST_ROWS).map((index) => (
          <Skeleton key={index} width="100%" height="2.75rem" />
        ))}
      </PanelSkeleton>

      <div className="dashboard__breakdowns">
        {range(BREAKDOWN_PANELS).map((panel) => (
          <PanelSkeleton key={panel}>
            {range(LIST_ROWS).map((row) => (
              <Skeleton key={row} width={`${90 - row * 20}%`} height="0.6rem" />
            ))}
          </PanelSkeleton>
        ))}
      </div>
    </div>
  );
}
