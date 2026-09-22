import { animate, stagger } from 'animejs';
import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { type AuthMode, useAuth } from '../../auth/AuthContext';
import { ClickSpark } from '../../components/reactbits/ClickSpark';
import { Magnet } from '../../components/reactbits/Magnet';
import { prefersReducedMotion } from '../../lib/motion';

// EF-AUT-02: same bounds as the API.
export const PASSWORD_MIN_LENGTH = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 * Login and account creation form (EF-AUT-01, EF-AUT-02, EF-AUT-03). Validates locally with the API's rules,
 * shows a waiting state during the request (ENF-UTI-03) and any failure as a readable message.
 */
export function AuthForm() {
  const { authenticate } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
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
  }, [mode]);

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
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validate(mode, email, password);
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) {
      shake();
      return;
    }
    setIsSubmitting(true);
    try {
      await authenticate(mode, { email: email.trim(), password });
    } catch (error) {
      setFormError(messageOf(error));
      setIsSubmitting(false);
      shake();
    }
  };

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

      <form
        ref={formRef}
        id="auth-panel"
        role="tabpanel"
        aria-labelledby={`auth-tab-${mode}`}
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

        <div className={`field field--password ${fieldErrors.password ? 'field--invalid' : ''}`} data-reveal>
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
  );
}
