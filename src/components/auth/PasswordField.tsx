"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  name: string;
  error?: string;
  /** New passwords: show a live "8 or more characters" check. */
  rule?: boolean;
};

/** Password input with a show/hide button and, for new passwords, a live length check. */
export function PasswordField({ label, name, error, rule, id, ...input }: Props) {
  const inputId = id ?? `f-${name}`;
  const [shown, setShown] = useState(false);
  const [len, setLen] = useState(0);
  const ruleId = useId();
  const ok = len >= 8;
  const describedBy = [rule ? ruleId : null, error ? `${inputId}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="au-pw">
        <input id={inputId} name={name} type={shown ? "text" : "password"} aria-invalid={error ? true : undefined} aria-describedby={describedBy}
          onInput={(e) => setLen(e.currentTarget.value.length)} {...input} />
        <button type="button" className="au-pw-btn" aria-pressed={shown} aria-controls={inputId} onClick={() => setShown((s) => !s)}>
          {shown ? "Hide" : "Show"}<span className="sr-only"> password</span>
        </button>
      </div>
      {rule && <small id={ruleId} className={`au-rule${ok ? " ok" : ""}`}>{ok ? "✓ " : ""}At least 8 characters</small>}
      {error && <span className="err" id={`${inputId}-err`}>{error}</span>}
    </div>
  );
}
