import type { Dashboard } from '../../api/stats';
import { SpotlightCard } from '../../components/reactbits/SpotlightCard';
import { formatInteger, plural } from '../../lib/format';
import './KpiCards.css';

interface KpiCardsProps {
  totals: Dashboard['totals'];
  offers: Dashboard['offers'];
}

/**
 * EF-TDB-01, 02, 03, 08: the headline numbers, the offers one only when the watch runs (ENF-MAI-07).
 * The response rate is the hero metric (Peak-End rule, ux-design): it is the figure most likely to be remembered, so it gets the spotlight treatment.
 */
export function KpiCards({ totals, offers }: KpiCardsProps) {
  return (
    <div
      className={offers ? 'kpi-cards' : 'kpi-cards kpi-cards--three'}
      role="group"
      aria-label="Indicateurs clés"
    >
      <div className="kpi-card">
        <p className="kpi-card__label">Candidatures suivies</p>
        <p className="kpi-card__value">{formatInteger(totals.applications)}</p>
        <p className="kpi-card__caption">Toutes candidatures confondues</p>
      </div>

      <div className="kpi-card">
        <p className="kpi-card__label">Ont atteint un entretien</p>
        <p className="kpi-card__value">{formatInteger(totals.reachedInterview)}</p>
        <p className="kpi-card__caption">Depuis le début du suivi</p>
      </div>

      <SpotlightCard className="kpi-card kpi-card--hero">
        <p className="kpi-card__label">Taux de réponse</p>
        <p className="kpi-card__value kpi-card__value--hero">{totals.responseRate}%</p>
        <p className="kpi-card__caption">Entretien, proposition ou refus</p>
      </SpotlightCard>

      {offers && (
        <div className="kpi-card">
          <p className="kpi-card__label">Offres à regarder</p>
          <p className="kpi-card__value">{formatInteger(offers.newAboveThreshold)}</p>
          <p className="kpi-card__caption">Score ≥ {plural(offers.threshold, 'point')}</p>
        </div>
      )}
    </div>
  );
}
