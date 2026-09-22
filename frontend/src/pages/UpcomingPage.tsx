import { PageHeader } from '../components/PageHeader';
import './UpcomingPage.css';

interface UpcomingPageProps {
  title: string;
  promise: string;
}

/** Screen whose content is not built yet (T-003 shell): says what it will offer instead of an empty page. */
export function UpcomingPage({ title, promise }: UpcomingPageProps) {
  return (
    <>
      <PageHeader title={title} eyebrow="En préparation">
        <p>{promise}</p>
      </PageHeader>
      <div className="upcoming" role="note">
        <span className="upcoming__mark" aria-hidden="true" />
        <p>Cet écran arrive dans une prochaine étape. Le tableau de bord reste votre point de départ.</p>
      </div>
    </>
  );
}
