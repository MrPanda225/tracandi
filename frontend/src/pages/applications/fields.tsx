import type { ReactNode } from 'react';

interface FieldFrameProps {
  id: string;
  label: string;
  error: string | undefined;
  hint?: string;
  className?: string;
  children: ReactNode;
}

/** Label, control, optional hint and error message, linked for assistive technologies. */
function FieldFrame({ id, label, error, hint, className, children }: FieldFrameProps) {
  return (
    <div className={className ? `form-field ${className}` : 'form-field'}>
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error && (
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

const describedBy = (id: string, error: string | undefined, hint: string | undefined) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  error: string | undefined;
  onChange: (value: string) => void;
}

export function TextField({ id, label, value, maxLength, error, onChange }: TextFieldProps) {
  return (
    <FieldFrame id={id} label={label} error={error}>
      <input
        id={id}
        className="control"
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, undefined)}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldFrame>
  );
}

interface DateFieldProps {
  id: string;
  label: string;
  /** `YYYY-MM-DD` */
  value: string;
  min: string;
  max: string;
  error: string | undefined;
  onChange: (value: string) => void;
}

export function DateField({ id, label, value, min, max, error, onChange }: DateFieldProps) {
  return (
    <FieldFrame id={id} label={label} error={error}>
      <input
        id={id}
        type="date"
        className="control"
        value={value}
        min={min}
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, undefined)}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldFrame>
  );
}

interface TextAreaFieldProps {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  hint: string;
  error: string | undefined;
  className?: string;
  onChange: (value: string) => void;
}

export function TextAreaField({
  id,
  label,
  value,
  maxLength,
  hint,
  error,
  className,
  onChange,
}: TextAreaFieldProps) {
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} className={className}>
      <textarea
        id={id}
        className="control"
        value={value}
        maxLength={maxLength}
        rows={6}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldFrame>
  );
}
