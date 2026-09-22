import { useEffect, useId, useState } from 'react';
import { isAbortError, messageOf } from '../../api/client';
import { type AiAssignments, type AiTask, fetchAiAssignments, type ProviderName } from '../../api/settings';
import { Flash } from '../../components/Flash';
import { Skeleton } from '../../components/Skeleton';

const PROVIDER_LABELS: Readonly<Record<ProviderName, string>> = {
  groq_llama: 'Groq · Llama',
  groq_qwen: 'Groq · Qwen',
  groq_kimi: 'Groq · Kimi',
  gemini: 'Gemini',
  claude: 'Claude',
};

const TASK_LABELS: Readonly<Record<AiTask, string>> = {
  classify_emails: 'Classement des e-mails',
  score_offers: 'Notation des offres',
  extract_offers: 'Lecture des pages carrières',
  tailor_cv: 'CV adapté',
  write_motivation: 'Réponse de motivation',
};

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; ai: AiAssignments };

function TaskRow({ task, providers }: AiAssignments['tasks'][number]) {
  const [primary, ...fallbacks] = providers.map((name) => PROVIDER_LABELS[name]);
  return (
    <tr>
      <th scope="row">{TASK_LABELS[task]}</th>
      <td>
        <span className="ai-settings__primary">{primary ?? '—'}</span>{' '}
        <span className="ai-settings__fallback">
          {fallbacks.length > 0 ? `secours : ${fallbacks.join(', ')}` : 'sans secours'}
        </span>
      </td>
    </tr>
  );
}

/** EF-CFG-02: the configured AI providers, their model, and the provider of each task with its fallback (RG-13). */
export function AiSettings() {
  const titleId = useId();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchAiAssignments(controller.signal)
      .then((ai) => setState({ status: 'ready', ai }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setState({ status: 'error', message: messageOf(error) });
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="settings-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="settings-card__title">
        Fournisseurs d’IA
      </h2>
      <p className="settings-card__lede">
        Chaque tâche est confiée à un fournisseur ; s’il ne répond pas, le fournisseur de secours prend le relais.
      </p>
      {state.status === 'loading' && (
        <div className="gmail-settings__loading" role="status" aria-live="polite">
          <span className="visually-hidden">Chargement des fournisseurs d’IA…</span>
          <Skeleton width="40%" height="1rem" />
          <Skeleton width="70%" height="0.8rem" />
        </div>
      )}
      {state.status === 'error' && <Flash>{state.message}</Flash>}
      {state.status === 'ready' && (
        <>
          <ul className="ai-settings__providers">
            {state.ai.providers.map((provider) => (
              <li key={provider.name}>
                <span className="ai-settings__provider">{PROVIDER_LABELS[provider.name]}</span>{' '}
                <span className="ai-settings__model">{provider.model}</span>
              </li>
            ))}
          </ul>
          <table className="ai-settings__tasks">
            <thead>
              <tr>
                <th scope="col">Tâche</th>
                <th scope="col">Confiée à</th>
              </tr>
            </thead>
            <tbody>
              {state.ai.tasks.map((task) => (
                <TaskRow key={task.task} {...task} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
