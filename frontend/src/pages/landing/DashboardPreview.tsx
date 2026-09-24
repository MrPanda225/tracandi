import { TiltedCard } from '../../components/reactbits/TiltedCard';

// Example figures only (EF-AUT-09): the page asks nothing of the API and never shows anyone's data.
const WEEKS = [
  { label: '24 août', sent: 3, interviews: 0, rejected: 1 },
  { label: '31 août', sent: 6, interviews: 1, rejected: 1 },
  { label: '7 sept.', sent: 9, interviews: 1, rejected: 3 },
  { label: '14 sept.', sent: 7, interviews: 2, rejected: 2 },
  { label: 'en cours', sent: 4, interviews: 1, rejected: 1 },
];
const TALLEST = Math.max(...WEEKS.map((week) => week.sent));

const FOLLOW_UPS = [
  { company: 'Atelier Nova', job: 'Data Analyst', since: 'il y a 12 jours', status: 'Accusé reçu' },
  { company: 'Studio Ardent', job: 'Chef de projet digital', since: 'il y a 15 jours', status: 'Envoyée' },
];

const barHeight = (value: number) => `${Math.max(6, (value / TALLEST) * 100)}%`;

/**
 * A miniature of the dashboard, tilting in 3D under the pointer: what the candidate gets, shown rather than
 * described. One image for assistive technologies, named as an example.
 */
export function DashboardPreview() {
  return (
    <TiltedCard className="preview-tilt" rotateAmplitude={8}>
      <div className="preview" role="img" aria-label="Aperçu du tableau de bord, données d’exemple">
        <div className="preview__bar">
          <span className="preview__dot" />
          <span className="preview__dot" />
          <span className="preview__dot" />
          <span className="preview__title">Tableau de bord</span>
        </div>
        <div className="preview__kpis">
          <div className="preview__kpi">
            <span className="preview__kpi-label">Candidatures</span>
            <span className="preview__kpi-value">42</span>
          </div>
          <div className="preview__kpi">
            <span className="preview__kpi-label">Entretiens</span>
            <span className="preview__kpi-value">6</span>
          </div>
          <div className="preview__kpi preview__kpi--hero">
            <span className="preview__kpi-label">Taux de réponse</span>
            <span className="preview__kpi-value">38 %</span>
          </div>
        </div>
        <div className="preview__chart">
          {WEEKS.map((week) => (
            <div key={week.label} className="preview__week">
              <div className="preview__bars">
                <span className="preview__col preview__col--sent" style={{ height: barHeight(week.sent) }} />
                <span className="preview__col preview__col--interview" style={{ height: barHeight(week.interviews) }} />
                <span className="preview__col preview__col--rejected" style={{ height: barHeight(week.rejected) }} />
              </div>
              <span className="preview__week-label">{week.label}</span>
            </div>
          ))}
        </div>
        <ul className="preview__follow-ups">
          {FOLLOW_UPS.map((item) => (
            <li key={item.company} className="preview__follow-up">
              <span>
                <strong>{item.company}</strong>
                <small>{item.job}</small>
              </span>
              <span className="preview__pill">{item.status}</span>
              <span className="preview__since">{item.since}</span>
            </li>
          ))}
        </ul>
        {/* Floats above the card, higher in 3D: the moment the product saves the candidate a task. */}
        <div className="preview__toast">
          <span className="preview__toast-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>
            Brouillon de relance prêt
            <small>Atelier Nova · dans Gmail</small>
          </span>
        </div>
      </div>
    </TiltedCard>
  );
}
