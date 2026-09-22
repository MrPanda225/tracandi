import { useEffect, useState } from 'react';
import { type Dashboard, fetchDashboard } from '../../api/stats';
import { ApiError } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { STATUS_LABELS, CONTRACT_LABELS, formatToday } from '../../lib/format';
import { statusColorVar } from '../../components/StatusTag';
import { Breakdown, type BreakdownRow } from './Breakdown';
import { FollowUpList } from './FollowUpList';
import { KpiCards } from './KpiCards';
import { WeeklyChart } from './WeeklyChart';
import './DashboardPage.css';

// Neutral bars for channel and contract type: no status meaning to convey there (ui-design: colour only when
// it carries information, WCAG 1.4.1 already satisfied through the visible label and count).
const NEUTRAL_COLOR = 'var(--color-mauve)';
const ACCENT_COLOR = 'var(--color-accent)';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; dashboard: Dashboard };

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

/**
 * Dashboard screen (T-602): every figure from `GET /api/stats/dashboard` (EF-TDB-01 to 09), the user's own
 * data only (EF-AUT-06 on the API side). Loads once on mount; a long request shows a waiting state (ENF-UTI-03).
 */
export function DashboardPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchDashboard(controller.signal)
      .then((dashboard) => setState({ status: 'ready', dashboard }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        const message = error instanceof ApiError ? error.message : 'Une erreur inattendue est survenue.';
        setState({ status: 'error', message });
      });
    return () => controller.abort();
  }, []);

  return (
    <>
      <PageHeader title="Tableau de bord" eyebrow={formatToday(new Date())}>
        <p>Vue d’ensemble de votre recherche : ce qui avance, ce qui attend une relance.</p>
      </PageHeader>

      {state.status === 'loading' && (
        <p role="status" aria-live="polite" className="dashboard__status">
          Chargement du tableau de bord…
        </p>
      )}

      {state.status === 'error' && (
        <p role="alert" className="dashboard__status dashboard__status--error">
          {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <div className="dashboard">
          <KpiCards totals={state.dashboard.totals} offers={state.dashboard.offers} />

          <div className="dashboard__panel">
            <WeeklyChart weekly={state.dashboard.weekly} />
          </div>

          <div className="dashboard__panel">
            <FollowUpList
              total={state.dashboard.followUps.total}
              items={state.dashboard.followUps.items}
              followUpDays={state.dashboard.followUpDays}
            />
          </div>

          {/* Grouped together (Five Hat Racks: same "category" axis) so this trio only ever splits into
              1 or 3 columns — never 2, which would stray an odd panel onto its own half-empty row. */}
          <div className="dashboard__breakdowns">
            <div className="dashboard__panel">
              <Breakdown
                title="Par statut"
                rows={statusRows(state.dashboard.byStatus)}
                emptyLabel="Aucune candidature pour l’instant."
              />
            </div>

            <div className="dashboard__panel">
              <Breakdown
                title="Par type de contrat"
                rows={contractRows(state.dashboard.byContractType)}
                emptyLabel="Aucune candidature pour l’instant."
              />
            </div>

            <div className="dashboard__panel">
              <Breakdown
                title="Par canal"
                rows={channelRows(state.dashboard.byChannel)}
                emptyLabel="Aucune candidature pour l’instant."
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
