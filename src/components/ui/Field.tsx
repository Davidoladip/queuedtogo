import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  prefix?: string;
};

/** Labelled input with hint and error text wired up for screen readers. */
export function Field({ label, name, error, hint, prefix, id, ...input }: Props) {
  const inputId = id ?? `f-${name}`;
  const describedBy = [hint ? `${inputId}-hint` : null, error ? `${inputId}-err` : null].filter(Boolean).join(" ") || undefined;
  const control = (
    <input id={inputId} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
  );
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {prefix ? <div className="prefix"><span>{prefix}</span>{control}</div> : control}
      {hint && <small id={`${inputId}-hint`}>{hint}</small>}
      {error && <span className="err" id={`${inputId}-err`}>{error}</span>}
    </div>
  );
}
