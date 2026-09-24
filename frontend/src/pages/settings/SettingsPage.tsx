import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { GmailSettings, type Notice } from './GmailSettings';
import './SettingsPage.css';

/** Outcome of the return from Google, set by the API in `?gmail=` (EF-GML-01). */
const GMAIL_OUTCOMES: Readonly<Record<string, Notice>> = {
  connected: { tone: 'success', text: 'Gmail est connecté : vos candidatures pourront être suivies depuis votre boîte.' },
  refused: { tone: 'error', text: 'Connexion annulée : l’accès à Gmail n’a pas été accordé sur la page de Google.' },
  expired: { tone: 'error', text: 'Le lien de connexion a expiré ou a déjà servi. Relancez la connexion.' },
  failed: { tone: 'error', text: 'Google n’a pas pu finaliser la connexion. Réessayez dans quelques minutes.' },
};

/**
 * Settings screen: what the candidate acts on — the Gmail connection, its synchronisation and preferences
 * (EF-CFG-01, EF-CFG-05). The AI providers are no longer shown (EF-CFG-02, v1.23).
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
      </div>
    </>
  );
}
