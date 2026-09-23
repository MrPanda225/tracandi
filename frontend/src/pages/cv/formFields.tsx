import { createContext, useContext, useId, type ReactNode } from 'react';

/**
 * Messages the API refused a field with, under the path it named (`body.cvSource.skills.0.label`). Read by the
 * field itself, so a refusal is shown where it happened instead of only in a list at the top (ENF-UTI-03).
 */
export type FieldErrors = Readonly<Record<string, string>>;

const FieldErrorsContext = createContext<FieldErrors>({});

export const FieldErrorsProvider = FieldErrorsContext.Provider;

/** The message the API refused this field with, or undefined when it said nothing about it. */
export const useFieldError = (path: string | undefined): string | undefined =>
  useContext(FieldErrorsContext)[path ?? ''];

interface FieldShellProps {
  label: string;
  /** Path of the field in the request, to match what the API refused (ENF-SEC-04). */
  path?: string;
  /** EF-CVX-02: the profile does not accept this field empty; marked « * » and announced as required. */
  isRequired?: boolean;
  hint?: string;
  children: (props: {
    id: string;
    describedBy: string | undefined;
    isInvalid: boolean;
    isRequired: boolean;
  }) => ReactNode;
}

/**
 * Label, required mark, hint and refusal of one field, around whatever control shows it. The refusal is written
 * under the control and tied to it, so a screen reader announces it with the field (WCAG 3.3.1).
 * @req EF-CVX-02, ENF-SEC-04, ENF-UTI-03
 */
export function FieldShell({ label, path, isRequired = false, hint, children }: FieldShellProps) {
  const id = useId();
  const error = useFieldError(path);
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-field">
      {/* L'astérisque est hors du `label` : il reste purement visuel, et le nom du champ reste le seul libellé.
          Ce que le lecteur d'écran annonce, c'est `required` porté par le contrôle lui-même. */}
      <div className="form-field__heading">
        <label className="form-field__label" htmlFor={id}>
          {label}
        </label>
        {isRequired && (
          <span className="form-field__required" aria-hidden="true">
            *
          </span>
        )}
      </div>
      {children({ id, describedBy, isInvalid: error !== undefined, isRequired })}
      {hint && (
        <p id={`${id}-hint`} className="form-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="form-field__error">
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  path?: string;
  isRequired?: boolean;
  hint?: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'month';
  min?: number;
  max?: number;
}

/** One line of text, of the given type: `month` opens the date picker of the browser, `number` its stepper. */
export function Field({
  label,
  value,
  onChange,
  path,
  isRequired,
  hint,
  type = 'text',
  min,
  max,
}: TextFieldProps) {
  return (
    <FieldShell label={label} path={path} isRequired={isRequired} hint={hint}>
      {({ id, describedBy, isInvalid, isRequired: required }) => (
        <input
          id={id}
          type={type}
          className="control"
          value={value}
          min={min}
          max={max}
          required={required}
          aria-required={required || undefined}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}

interface LongFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  path?: string;
  isRequired?: boolean;
  hint?: string;
  rows?: number;
}

/** Several lines of text: a paragraph, or a list entered one value per line. */
export function LongField({ label, value, onChange, path, isRequired, hint, rows = 4 }: LongFieldProps) {
  return (
    <FieldShell label={label} path={path} isRequired={isRequired} hint={hint}>
      {({ id, describedBy, isInvalid, isRequired: required }) => (
        <textarea
          id={id}
          className="control"
          rows={rows}
          value={value}
          required={required}
          aria-required={required || undefined}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldShell>
  );
}
