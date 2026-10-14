import { animate, stagger } from 'animejs';
import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resendActivation, resendLoginCode } from '../../api/auth';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ClickSpark } from '../../components/reactbits/ClickSpark';
import { Magnet } from '../../components/reactbits/Magnet';
import { prefersReducedMotion } from '../../lib/motion';

// EF-AUT-10: « Créer un compte » of the presentation page opens the form on that tab.
const REGISTER_MODE_PARAM = 'inscription';

// EF-AUT-02: same bounds as the API.
export const PASSWORD_MIN_LENGTH = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// EF-AUT-14: the API itself never says whether the address exists; the interface echoes that same wording.
const ACTIVATION_NOT_ACTIVATED_CODE = 'account_not_activated';
const RESEND_SENT_MESSAGE =
  'Si cette adresse a un compte en attente d’activation, un nouvel e-mail vient d’être envoyé.';

type AuthMode = 'login' | 'register';

// EF-AUT-16: six digits, as sent by the API.
const CODE_LENGTH = 6;
const CODE_PATTERN = /^\d{6}$/;
const CODE_INVALID = 'login_code_invalid';
const CODE_RESENT_MESSAGE = 'Un nouveau code vient d’être envoyé à votre adresse.';

const COPY: Record<AuthMode, { title: string; subtitle: string; submit: string; pending: string }> = {
  login: {
    title: 'Bon retour.',
    subtitle: 'Reprenez le fil de vos candidatures.',
    submit: 'Se connecter',
    pending: 'Connexion…',
  },
  register: {
    title: 'Commençons.',
    subtitle: 'Créez votre espace en moins d’une minute.',
    submit: 'Créer mon compte',
    pending: 'Création du compte…',
  },
};

interface FieldErrors {
  email?: string;
  password?: string;
}

const validate = (mode: AuthMode, email: string, password: string): FieldErrors => ({
  ...(EMAIL_PATTERN.test(email.trim()) ? {} : { email: 'Saisissez une adresse e-mail valide.' }),
  ...(mode === 'register' && password.length < PASSWORD_MIN_LENGTH
    ? { password: `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.` }
    : {}),
  ...(mode === 'login' && password.length === 0 ? { password: 'Saisissez votre mot de passe.' } : {}),
});

const messageOf = (error: unknown): string =>
  error instanceof ApiError ? error.message : 'Une erreur inattendue est survenue. Réessayez.';

/**
 * EF-AUT-15: button that asks the API for a fresh activation e-mail. Shows a waiting state while the request is in
 * flight (ENF-UTI-03) and the same confirmation whatever the address turns out to be (RG: never reveals which).
 */
function ResendActivationButton({ email }: { email: string }) {
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'sent' | 'error'; message: string } | null>(null);

  const handleResend = async () => {
    setIsSending(true);
    setFeedback(null);
    try {
      await resendActivation(email);
      setFeedback({ kind: 'sent', message: RESEND_SENT_MESSAGE });
    } catch (error) {
      // EF-AUT-15: a rate limit (429) is the one case the API does answer distinctly; shown as-is.
      setFeedback({ kind: 'error', message: messageOf(error) });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="auth-form__resend">
      <button
        type="button"
        className="button-secondary"
        onClick={() => void handleResend()}
        disabled={isSending}
        aria-busy={isSending}
      >
        {isSending ? 'Envoi…' : 'Renvoyer l’e-mail d’activation'}
      </button>
      {feedback && (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`auth-form__resend-${feedback.kind}`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}

/**
 * Shown after a successful registration (EF-AUT-14): the account is created but inactive, and no session was
 * opened — the activation e-mail is the only way in, with a way to ask for a new one (EF-AUT-15).
 */
function PendingActivation({ email }: { email: string }) {
  return (
    <div className="auth-form__panel auth-form__pending" data-reveal>
      <header className="auth-form__header">
        <h2 className="auth-form__title">Vérifiez votre boîte mail</h2>
        <p className="auth-form__subtitle">
          Nous avons envoyé un lien d’activation à <strong>{email}</strong>. Ouvrez-le pour activer votre
          compte.
        </p>
      </header>
      <ResendActivationButton email={email} />
    </div>
  );
}

/**
 * EF-AUT-16, EF-AUT-17: second step of the login. The password was right and a code was e-mailed; the session opens
 * only once it is confirmed. A wrong code with attempts left stays here; a locked or expired one sends the user back
 * to the password step with the reason (`onBack`).
 */
function LoginCodeStep({
  email,
  challenge,
  onBack,
}: {
  email: string;
  challenge: string;
  onBack: (message?: string) => void;
}) {
  const { confirmLoginCode } = useAuth();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ids = { code: useId(), error: useId() };
  const isBusy = isSubmitting || isResending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    if (!CODE_PATTERN.test(code)) {
      setError(`Saisissez les ${CODE_LENGTH} chiffres du code reçu par e-mail.`);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await confirmLoginCode(challenge, code);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === CODE_INVALID) {
        setError(failure.message);
        setCode('');
        setIsSubmitting(false);
        return;
      }
      // Locked, expired, or anything else: the challenge cannot be reused — start again from the password.
      onBack(messageOf(failure));
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setError(null);
    setNotice(null);
    try {
      await resendLoginCode(challenge);
      setCode('');
      setNotice(CODE_RESENT_MESSAGE);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <form
      className="auth-form__panel auth-form__code"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <header className="auth-form__header">
        <h2 className="auth-form__title">Entrez votre code</h2>
        <p className="auth-form__subtitle">
          Nous avons envoyé un code à {CODE_LENGTH} chiffres à <strong>{email}</strong>. Il est valable 10
          minutes.
        </p>
      </header>

      <div className={`field ${error ? 'field--invalid' : ''}`}>
        <input
          id={ids.code}
          type="text"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          placeholder=" "
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? ids.error : undefined}
          disabled={isBusy}
        />
        <label htmlFor={ids.code}>Code de connexion</label>
      </div>

      {error && (
        <p id={ids.error} role="alert" className="auth-form__error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="auth-form__resend-sent">
          {notice}
        </p>
      )}

      <button type="submit" className="button-primary" disabled={isBusy} aria-busy={isSubmitting}>
        {isSubmitting && <span className="button-primary__spinner" aria-hidden="true" />}
        <span>{isSubmitting ? 'Vérification…' : 'Valider'}</span>
      </button>
      <button
        type="button"
        className="button-secondary"
        onClick={() => void handleResend()}
        disabled={isBusy}
        aria-busy={isResending}
      >
        {isResending ? 'Envoi…' : 'Renvoyer le code'}
      </button>
      <button type="button" className="auth-form__back" onClick={() => onBack()} disabled={isBusy}>
        Retour à la connexion
      </button>
    </form>
  );
}

/**
 * Login and account creation form (EF-AUT-01, EF-AUT-02, EF-AUT-03, EF-AUT-14, EF-AUT-16). A correct password hands off to `LoginCodeStep`. Validates locally with the API's
 * rules, shows a waiting state during the request (ENF-UTI-03) and any failure as a readable message. Registering
 * no longer opens a session: it hands off to `PendingActivation` until the e-mail is confirmed.
 */
export function AuthForm() {
  const { register, requestLoginCode } = useAuth();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>(() =>
    searchParams.get('mode') === REGISTER_MODE_PARAM ? 'register' : 'login',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // EF-AUT-14: set once registration succeeds; swaps the form for PendingActivation until the tab changes again.
  const [pendingActivationEmail, setPendingActivationEmail] = useState<string | null>(null);
  // EF-AUT-14: the login attempt that found an inactive account — offers a resend right where it was refused.
  const [notActivatedEmail, setNotActivatedEmail] = useState<string | null>(null);
  // EF-AUT-16: set once the password is right; swaps the form for the code step.
  const [loginChallenge, setLoginChallenge] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const ids = { email: useId(), password: useId(), hint: useId(), error: useId() };
  const copy = COPY[mode];

  // Slides the tab indicator under the active mode.
  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const active = tabs?.querySelector<HTMLElement>('[aria-selected="true"]');
    const indicator = tabs?.querySelector<HTMLElement>('.auth-tabs__indicator');
    if (!active || !indicator) return;
    const target = { translateX: active.offsetLeft, width: active.offsetWidth };
    if (prefersReducedMotion())
      Object.assign(indicator.style, {
        transform: `translateX(${target.translateX}px)`,
        width: `${target.width}px`,
      });
    else animate(indicator, { ...target, duration: 520, ease: 'outExpo' });
  }, [mode, loginChallenge]);

  // Re-enters the form content when the mode changes.
  useEffect(() => {
    if (prefersReducedMotion() || !formRef.current) return;
    const animation = animate(formRef.current.querySelectorAll('[data-reveal]'), {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 560,
      delay: stagger(45),
      ease: 'outQuart',
    });
    return () => {
      animation.pause();
    };
  }, [mode]);

  const shake = () => {
    if (prefersReducedMotion() || !formRef.current) return;
    animate(formRef.current, { translateX: [0, -8, 7, -4, 2, 0], duration: 460, ease: 'inOutSine' });
  };

  const switchMode = (next: AuthMode) => {
    if (next === mode || isSubmitting) return;
    setMode(next);
    setFieldErrors({});
    setFormError(null);
    setPendingActivationEmail(null);
    setNotActivatedEmail(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validate(mode, email, password);
    setFieldErrors(errors);
    setFormError(null);
    setNotActivatedEmail(null);
    if (errors.email || errors.password) {
      shake();
      return;
    }
    setIsSubmitting(true);
    const trimmedEmail = email.trim();
    try {
      if (mode === 'register') {
        await register({ email: trimmedEmail, password });
        setPendingActivationEmail(trimmedEmail);
      } else {
        setLoginChallenge(await requestLoginCode({ email: trimmedEmail, password }));
        setPassword('');
        setIsSubmitting(false);
      }
    } catch (error) {
      setFormError(messageOf(error));
      if (error instanceof ApiError && error.code === ACTIVATION_NOT_ACTIVATED_CODE) {
        setNotActivatedEmail(trimmedEmail);
      }
      setIsSubmitting(false);
      shake();
    }
  };

  if (pendingActivationEmail) return <PendingActivation email={pendingActivationEmail} />;
  if (loginChallenge) {
    return (
      <LoginCodeStep
        email={email.trim()}
        challenge={loginChallenge}
        onBack={(message) => {
          setLoginChallenge(null);
          setFormError(message ?? null);
        }}
      />
    );
  }

  const passwordProgress = Math.min(password.length / PASSWORD_MIN_LENGTH, 1);

  return (
    <div className="auth-form">
      <div ref={tabsRef} className="auth-tabs" role="tablist" aria-label="Mode d’accès">
        <span className="auth-tabs__indicator" aria-hidden="true" />
        {(['login', 'register'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`auth-tab-${tab}`}
            aria-selected={mode === tab}
            aria-controls="auth-panel"
            className="auth-tabs__tab"
            onClick={() => switchMode(tab)}
          >
            {tab === 'login' ? 'Connexion' : 'Créer un compte'}
          </button>
        ))}
      </div>

      {/* The panel wraps the form: a form keeps its own role, which assistive technologies and agents rely on. */}
      <div id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${mode}`}>
        <form
          ref={formRef}
          className="auth-form__panel"
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
        >
          <header className="auth-form__header" data-reveal>
            <h2 className="auth-form__title">{copy.title}</h2>
            <p className="auth-form__subtitle">{copy.subtitle}</p>
          </header>

          <div className={`field ${fieldErrors.email ? 'field--invalid' : ''}`} data-reveal>
            <input
              id={ids.email}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder=" "
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? `${ids.email}-error` : undefined}
              disabled={isSubmitting}
            />
            <label htmlFor={ids.email}>Adresse e-mail</label>
            {fieldErrors.email && (
              <p id={`${ids.email}-error`} className="field__error">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div
            className={`field field--password ${fieldErrors.password ? 'field--invalid' : ''}`}
            data-reveal
          >
            <input
              id={ids.password}
              type={isPasswordVisible ? 'text' : 'password'}
              name="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder=" "
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                [mode === 'register' ? ids.hint : '', fieldErrors.password ? `${ids.password}-error` : '']
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              disabled={isSubmitting}
            />
            <label htmlFor={ids.password}>Mot de passe</label>
            <button
              type="button"
              className="field__toggle"
              aria-pressed={isPasswordVisible}
              aria-label={isPasswordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              onClick={() => setIsPasswordVisible((visible) => !visible)}
            >
              {isPasswordVisible ? 'Masquer' : 'Afficher'}
            </button>
            {fieldErrors.password && (
              <p id={`${ids.password}-error`} className="field__error">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {mode === 'register' && (
            <div className="password-meter" data-reveal>
              <span className="password-meter__track" aria-hidden="true">
                <span className="password-meter__fill" style={{ transform: `scaleX(${passwordProgress})` }} />
              </span>
              <span id={ids.hint} className="password-meter__label" aria-live="polite">
                {password.length >= PASSWORD_MIN_LENGTH
                  ? 'Longueur suffisante'
                  : `${PASSWORD_MIN_LENGTH} caractères minimum — ${password.length}/${PASSWORD_MIN_LENGTH}`}
              </span>
            </div>
          )}

          {formError && (
            <p id={ids.error} role="alert" className="auth-form__error">
              {formError}
            </p>
          )}

          {notActivatedEmail && <ResendActivationButton email={notActivatedEmail} />}

          <div data-reveal>
            <Magnet className="auth-submit-magnet" disabled={isSubmitting}>
              <ClickSpark>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                >
                  {isSubmitting && <span className="button-primary__spinner" aria-hidden="true" />}
                  <span>{isSubmitting ? copy.pending : copy.submit}</span>
                </button>
              </ClickSpark>
            </Magnet>
          </div>

          <p className="auth-form__footnote" data-reveal>
            Votre mot de passe n’est jamais stocké en clair et vos données ne sont partagées avec personne.
          </p>
        </form>
      </div>
    </div>
  );
}
