import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { useFeature } from '../../features/FeaturesContext';
import { GmailSettings, type Notice } from './GmailSettings';
import { LegalLinks } from '../../components/LegalLinks';
import { MyDataCard } from './MyDataCard';
import './SettingsPage.css';

// ENF-MAI-07: the section of the watch is fetched only when the feature runs, so that a deployment without it neither
// loads nor calls any of it (ENF-PERF-01: it does not weigh on the first load either).
const WatchSettings = lazy(async () => ({
  default: (await import('./watch/WatchSettings')).WatchSettings,
}));

/** Outcome of the return from Google, set by the API in `?gmail=` (EF-GML-01). */
const GMAIL_OUTCOMES: Readonly<Record<string, Notice>> = {
  connected: { tone: 'success', text: 'Gmail est connecté : vos candidatures pourront être suivies depuis votre boîte.' },
  refused: { tone: 'error', text: 'Connexion annulée : l’accès à Gmail n’a pas été accordé sur la page de Google.' },
  expired: { tone: 'error', text: 'Le lien de connexion a expiré ou a déjà servi. Relancez la connexion.' },
  failed: { tone: 'error', text: 'Google n’a pas pu finaliser la connexion. Réessayez dans quelques minutes.' },
};

/** Waiting state shaped like the section, so that the card below does not jump when it arrives (ENF-PERF-07). */
function WatchSettingsLoading() {
  return (
    <section className="settings-card" aria-busy="true">
      <div role="status" aria-live="polite">
        <span className="visually-hidden">Chargement de la veille automatique…</span>
      </div>
      <Skeleton width="45%" height="1.5rem" />
      <Skeleton width="100%" height="10rem" />
    </section>
  );
}

/**
 * « Veille automatique » (EF-CFG-06), after the Gmail card and its preferences and before the candidate's data. Absent
 * while the `watch` feature is off, and until the server has said whether it is on (ENF-MAI-07).
 */
function WatchSection() {
  if (useFeature('watch') !== true) return null;
  return (
    <Suspense fallback={<WatchSettingsLoading />}>
      <WatchSettings />
    </Suspense>
  );
}

/**
 * Settings screen: what the candidate acts on — the Gmail connection, its synchronisation and preferences
 * (EF-CFG-01, EF-CFG-05) — the watch that runs by itself when the server offers it (EF-CFG-06), and their data: export
 * and deletion of the account (EF-AUT-11, EF-AUT-12). The AI providers are no longer shown (EF-CFG-02, v1.23).
 */
export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [gmailOutcome] = useState(() => GMAIL_OUTCOMES[searchParams.get('gmail') ?? ''] ?? null);

  // Shown once: a reload or a shared address must not repeat the message.
  useEffect(() => {
    if (!searchParams.has('gmail')) return;
    setSearchParams(
      (current) => {
        current.delete('gmail');
        return current;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  return (
    <>
      <PageHeader title="Réglages">
        <p>Votre boîte Gmail : d’où viennent les candidatures que Tracandi suit pour vous.</p>
      </PageHeader>
      <div className="settings-page">
        <GmailSettings initialNotice={gmailOutcome} />
        <WatchSection />
        <MyDataCard />
        {/* EF-LEG-01: reachable on a phone too, where the side panel is gone. */}
        <LegalLinks />
      </div>
    </>
  );
}
