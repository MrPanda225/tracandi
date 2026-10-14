import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { activateAccount } from '../../api/auth';
import { ApiError } from '../../api/client';
import { LOGIN_PATH } from '../../auth/guards';
import { usePageMeta } from '../../lib/pageMeta';
import './ActivationPage.css';

type ActivationResult = 'loading' | 'success' | 'expired' | 'already_used' | 'error';

const RESULT_COPY: Record<Exclude<ActivationResult, 'loading'>, { title: string; body: string }> = {
  success: {
    title: 'Compte activé',
    body: 'Votre compte est activé. Vous pouvez maintenant vous connecter.',
  },
  expired: {
    title: 'Lien expiré',
    body: 'Ce lien d’activation a expiré. Connectez-vous pour en demander un nouveau.',
  },
  already_used: {
    title: 'Lien déjà utilisé',
    body: 'Ce lien d’activation a déjà servi. Si votre compte n’est pas encore activé, demandez-en un nouveau depuis la page de connexion.',
  },
  error: {
    title: 'Activation impossible',
    body: 'Ce lien d’activation est invalide. Demandez-en un nouveau depuis la page de connexion.',
  },
};

/** The `code` of an ApiError, read without widening its type to something not every failure carries. */
const codeOf = (error: unknown): string | undefined => (error instanceof ApiError ? error.code : undefined);

const resultOf = (error: unknown): Exclude<ActivationResult, 'loading' | 'success'> => {
  const code = codeOf(error);
  if (code === 'activation_code_expired') return 'expired';
  if (code === 'activation_code_already_used') return 'already_used';
  return 'error';
};

/**
 * Consumes the activation link's code on mount and shows the outcome (EF-AUT-14): success, expired, already used,
 * or invalid — each with its own French message, before linking to the login page. French (ENF-UTI-01), usable
 * from 360 px (ENF-UTI-02).
 */
export function ActivationPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  // A missing code never needs the API: the result is known before any effect would run.
  const [result, setResult] = useState<ActivationResult>(() => (code ? 'loading' : 'error'));
  usePageMeta({ title: 'Activation du compte — Tracandi' });

  useEffect(() => {
    if (!code) return;
    const controller = new AbortController();
    activateAccount(code)
      .then(() => {
        if (!controller.signal.aborted) setResult('success');
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult(resultOf(error));
      });
    return () => controller.abort();
  }, [code]);

  return (
    <main className="activation-page">
      <div className="activation-card">
        {result === 'loading' ? (
          <p role="status" aria-live="polite" className="activation-card__status">
            Activation de votre compte…
          </p>
        ) : (
          <>
            <h1 className="activation-card__title">{RESULT_COPY[result].title}</h1>
            <p role={result === 'success' ? 'status' : 'alert'} className="activation-card__body">
              {RESULT_COPY[result].body}
            </p>
            <Link to={LOGIN_PATH} className="button-primary activation-card__link">
              Aller à la connexion
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
