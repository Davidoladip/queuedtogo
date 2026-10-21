"use client";

import { useId, useState, type ReactNode } from "react";
import { cc } from "@/lib/design/color";

/** Colour swatch plus hex text box. Invalid text is shown but never saved. */
export function ColorInput({ label, value, onChange, allowEmpty }: { label: string; value: string | null | undefined; onChange: (v: string) => void; allowEmpty?: boolean }) {
  const id = useId();
  const [text, setText] = useState(value ?? "");
  const [shown, setShown] = useState(value);
  if (value !== shown) { setShown(value); if (cc(text) !== cc(value)) setText(value ?? ""); }
  const valid = cc(text);
  return (
    <div className="b-color">
      <label htmlFor={id}>{label}</label>
      <div className="b-color-row">
        <input type="color" aria-label={`${label} picker`} value={(cc(value) || "#000000").slice(0, 7)} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <input
          id={id}
          type="text"
          className="mono"
          value={text}
          spellCheck={false}
          aria-invalid={text && !valid ? true : undefined}
          placeholder={allowEmpty ? "Default" : "#RRGGBB"}
          onChange={(e) => {
            setText(e.target.value);
            const c = cc(e.target.value);
            if (c) onChange(c);
            else if (allowEmpty && !e.target.value.trim()) onChange("");
          }}
        />
      </div>
    </div>
  );
}

export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="b-field">
      <span className="b-label">{label}</span>
      <div className="b-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="b-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{hint && <small>{hint}</small>}</span>
    </label>
  );
}

export function TextInput({ label, value, onChange, multiline, maxLength, placeholder, hint, prefix, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; maxLength?: number; placeholder?: string; hint?: ReactNode; prefix?: string; type?: string;
}) {
  const id = useId();
  const control = multiline ? (
    <textarea id={id} rows={3} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input id={id} type={type} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {prefix ? <div className="prefix"><span>{prefix}</span>{control}</div> : control}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function NumberInput({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  const id = useId();
  return (
    <div className="field b-num">
      <label htmlFor={id}>{label}</label>
      <div className="b-num-row">
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        <span className="mono">{value}{suffix}</span>
      </div>
    </div>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
