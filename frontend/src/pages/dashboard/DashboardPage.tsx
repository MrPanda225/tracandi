import { lazy, Suspense, useState } from 'react';
import type { Dashboard } from '../../api/stats';
import { Flash } from '../../components/Flash';
import { PageHeader } from '../../components/PageHeader';
import { STATUS_LABELS, CONTRACT_LABELS, formatToday } from '../../lib/format';
import { statusColorVar } from '../../components/StatusTag';
import { Breakdown, type BreakdownRow } from './Breakdown';
import { DashboardSkeleton } from './DashboardSkeleton';
import { FollowUpList } from './FollowUpList';
import { KpiCards } from './KpiCards';
import { useDashboard } from './useDashboard';

// ENF-PERF-01: the chart library is the heaviest part of the screen; the figures, the follow-ups and the breakdowns
// show without waiting for it, the chart arriving in a box that already holds its place.
const WeeklyChart = lazy(async () => ({ default: (await import('./WeeklyChart')).WeeklyChart }));
import './DashboardPage.css';

// Neutral bars for channel and contract type: no status meaning to convey there (ui-design: colour only when
// it carries information, WCAG 1.4.1 already satisfied through the visible label and count).
const NEUTRAL_COLOR = 'var(--color-mauve)';
const ACCENT_COLOR = 'var(--color-accent)';

const statusRows = (byStatus: Dashboard['byStatus']): BreakdownRow[] =>
  byStatus.map((row) => ({
    key: row.status,
    label: STATUS_LABELS[row.status],
    count: row.count,
    color: statusColorVar(row.status),
  }));

const contractRows = (byContractType: Dashboard['byContractType']): BreakdownRow[] =>
  byContractType
    .filter((row) => row.count > 0)
    .map((row) => ({
      key: row.contractType,
      label: CONTRACT_LABELS[row.contractType],
      count: row.count,
      color: ACCENT_COLOR,
      detail: `${row.responseRate}% de réponse`,
    }));

const channelRows = (byChannel: Dashboard['byChannel']): BreakdownRow[] =>
  [
    { key: 'direct', label: 'Envoi direct', count: byChannel.direct, color: ACCENT_COLOR },
    { key: 'platform', label: 'Via une plateforme', count: byChannel.platform, color: NEUTRAL_COLOR },
  ].filter((row) => row.count > 0);

interface DashboardFiguresProps {
  dashboard: Dashboard;
  isRefreshing: boolean;
  /** The bars grow on the first visit and when new figures arrive on their own (EF-TDB-11). */
  isChartAnimated: boolean;
}

function DashboardFigures({ dashboard, isRefreshing, isChartAnimated }: DashboardFiguresProps) {
  return (
    <div className="dashboard" aria-busy={isRefreshing}>
      <KpiCards totals={dashboard.totals} offers={dashboard.offers} />

      {/* EF-TDB-12: the week before the to-do list. The figures tell where the search stands; the follow-ups,
          up to twenty rows long, used to push them a screen and a half down and no one scrolled that far. */}
      <div className="dashboard__panel">
        {/* Replaying the drawing on every return would make known figures look like they are loading. */}
        <Suspense fallback={<div className="dashboard__chart-placeholder" aria-hidden="true" />}>
          <WeeklyChart weekly={dashboard.weekly} isAnimated={isChartAnimated} />
        </Suspense>
      </div>

      <div className="dashboard__panel">
        <FollowUpList
          total={dashboard.followUps.total}
          items={dashboard.followUps.items}
          followUpDays={dashboard.followUpDays}
        />
      </div>

      {/* Grouped together (Five Hat Racks: same "category" axis) so this trio only ever splits into
          1 or 3 columns — never 2, which would stray an odd panel onto its own half-empty row. */}
      <div className="dashboard__breakdowns">
        <div className="dashboard__panel">
          <Breakdown
            title="Par statut"
            rows={statusRows(dashboard.byStatus)}
            emptyLabel="Aucune candidature pour l’instant."
          />
        </div>

        <div className="dashboard__panel">
          <Breakdown
            title="Par type de contrat"
            rows={contractRows(dashboard.byContractType)}
            emptyLabel="Aucune candidature pour l’instant."
          />
        </div>

        <div className="dashboard__panel">
          <Breakdown
            title="Par canal"
            rows={channelRows(dashboard.byChannel)}
            emptyLabel="Aucune candidature pour l’instant."
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Dashboard screen (T-602): every figure from `GET /api/stats/dashboard` (EF-TDB-01 to 10), the user's own
 * data only (EF-AUT-06 on the API side), refreshed on its own when a synchronisation ends (EF-TDB-11). The first visit shows the shape of the page while it loads; later visits
 * show the last figures at once and refresh them (ENF-UTI-03).
 */
export function DashboardPage() {
  const { dashboard, error, isRefreshing, isUpdatedLive } = useDashboard();
  const [isFirstVisit] = useState(() => dashboard === null);
  const today = formatToday(new Date());

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        eyebrow={dashboard && isRefreshing ? `${today} · actualisation…` : today}
      >
        <p>Vue d’ensemble de votre recherche : ce qui avance, ce qui attend une relance.</p>
      </PageHeader>

      {isUpdatedLive && (
        <p className="dashboard__live" role="status">
          Tableau de bord mis à jour après la synchronisation.
        </p>
      )}

      {error && <Flash>{dashboard ? `Chiffres de votre dernière visite. ${error}` : error}</Flash>}

      {dashboard ? (
        <DashboardFigures
          dashboard={dashboard}
          isRefreshing={isRefreshing}
          isChartAnimated={isFirstVisit || isUpdatedLive}
        />
      ) : (
        !error && <DashboardSkeleton />
      )}
    </>
  );
}
