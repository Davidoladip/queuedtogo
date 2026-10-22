// Checks a customer's answers against the published form, on the server. The browser runs the same
// checks for quick feedback, but only this result is trusted. Anything not on the form is ignored.

import { isInput, LOCKABLE, type FormField, type FormModel } from "./design/engine";
import type { SwatchSettings } from "./design/media";

export type AnswerValue = string | string[] | Record<string, number> | { file: string; size: number; type: string; path?: string } | null;
export type Answer = { label: string; type: string; value: AnswerValue; colour?: string; optionColours?: Record<string, string> };
export type Customer = { name: string | null; email: string | null; phone: string | null; channel: string };
export type UploadIn = { fieldId: string; file: File };

export type Checked =
  | { ok: true; answers: Record<string, Answer>; customer: Customer; consent: boolean; title: string; summary: string; uploads: UploadIn[] }
  | { ok: false; errors: Record<string, string>; message: string };

/** Minimal FormData-like interface so this works with FormData and in tests. */
export type Fields = { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] };

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMIT: Partial<Record<FormField["type"], number>> = { short: 500, long: 5000, email: 254, phone: 40, number: 30, date: 10 };

/** US numbers become +1XXXXXXXXXX; international numbers must already start with +. Returns null if not a phone number. */
export function toE164(raw: string): string | null {
  const d = raw.replace(/[\s().-]/g, "");
  if (/^\d{10}$/.test(d)) return `+1${d}`;
  if (/^1\d{10}$/.test(d)) return `+${d}`;
  if (/^\+1\d{10}$/.test(d)) return d;
  if (/^\+[2-9]\d{7,14}$/.test(d)) return d;
  return null;
}
const swatchValue = (c: { color: string; label: string }) => (c.label ? `${c.label} (${c.color})` : c.color);
const pickColour = (sw: SwatchSettings, v: string) => sw.items.map(swatchValue).find((x) => x === v) ?? null;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export function checkSubmission(form: FormModel, fd: Fields): Checked {
  const errors: Record<string, string> = {};
  const answers: Record<string, Answer> = {};
  const uploads: UploadIn[] = [];

  if (text(fd.get("__hp"))) return { ok: false, errors: {}, message: "We couldn't send your order. Reload the page and try again." };

  for (const f of form.fields) {
    if (!isInput(f.type)) continue;
    const label = f.label || "Question";
    const options = f.options.map((o) => o.trim()).filter(Boolean);
    let value: AnswerValue = null;
    let filled = false;

    if (LOCKABLE.has(f.type) && f.config.locked) {
      // Locked answers always come from the form, never from the browser.
      value = String(f.config.value ?? "");
      answers[f.id] = { label, type: f.type, value };
      continue;
    }

    switch (f.type) {
      case "short": case "long": case "email": case "phone": case "number": case "date": {
        const v = text(fd.get(f.id));
        if (v.length > (LIMIT[f.type] ?? 500)) { errors[f.id] = `Keep this under ${LIMIT[f.type]} characters.`; break; }
        filled = v !== "";
        if (!filled) break;
        if (f.type === "email" && !EMAIL.test(v)) { errors[f.id] = "Enter a valid email address."; break; }
        if (f.type === "phone") { const p = toE164(v); if (!p) { errors[f.id] = "Enter a valid mobile number, like (555) 123-4567."; break; } value = p; break; }
        if (f.type === "number" && !(Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 1e9)) { errors[f.id] = "Enter a number."; break; }
        if (f.type === "date" && !(/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)))) { errors[f.id] = "Enter a valid date."; break; }
        value = f.type === "email" ? v.toLowerCase() : v;
        break;
      }
      case "dropdown": case "choice": {
        const v = text(fd.get(f.id));
        filled = v !== "";
        if (filled && !options.includes(v)) { errors[f.id] = "Choose one of the options."; break; }
        if (filled) value = v;
        break;
      }
      case "multi": {
        const vs = [...new Set(fd.getAll(f.id).map(text).filter(Boolean))];
        filled = vs.length > 0;
        if (vs.some((v) => !options.includes(v))) { errors[f.id] = "Choose from the options shown."; break; }
        if (filled) value = vs;
        break;
      }
      case "sizes": {
        const raw = fd.getAll(f.id).map(text);
        const q: Record<string, number> = {};
        let bad = false;
        options.forEach((o, i) => {
          const v = raw[i] ?? "";
          if (v === "") return;
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0 || n > 9999) { bad = true; return; }
          if (n > 0) q[o] = n;
        });
        if (bad) { errors[f.id] = "Enter whole numbers for each size."; break; }
        filled = Object.keys(q).length > 0;
        if (filled) value = q;
        break;
      }
      case "upload": {
        const files = fd.getAll(f.id).filter((x): x is File => typeof x !== "string" && x.size > 0);
        filled = files.length > 0;
        if (files.length > 1) { errors[f.id] = "Upload one file here."; break; }
        const file = files[0];
        if (!file) break;
        if (!UPLOAD_TYPES[file.type]) { errors[f.id] = "Upload a PNG, JPG, WebP or PDF file."; break; }
        if (file.size > MAX_UPLOAD_BYTES) { errors[f.id] = "Files can be up to 10 MB."; break; }
        uploads.push({ fieldId: f.id, file });
        value = { file: file.name.slice(0, 200), size: file.size, type: file.type };
        break;
      }
    }
    if (errors[f.id]) continue;
    if (f.required && !filled) { errors[f.id] = f.type === "sizes" ? "Enter a quantity for at least one size." : "This is required."; continue; }

    const answer: Answer = { label, type: f.type, value };
    // Colour chosen for the whole question.
    const sw = f.config.swatches;
    if (sw?.selectable) {
      const v = text(fd.get(`${f.id}__color`));
      if (v) { const c = pickColour(sw, v); if (!c) { errors[f.id] = "Choose one of the colours shown."; continue; } answer.colour = c; }
      else if (sw.required) { errors[f.id] = "Choose a colour."; continue; }
    }
    // Colours chosen for picked options.
    if ((f.type === "choice" || f.type === "multi") && value) {
      const picked = new Set(Array.isArray(value) ? value : [value as string]);
      const oc: Record<string, string> = {};
      for (const [i, o] of f.options.entries()) {
        const osw = f.config.optMeta?.[i]?.swatches;
        if (!osw?.selectable || !picked.has(o.trim())) continue;
        const v = text(fd.get(`${f.id}__o${i}__color`));
        if (v) { const c = pickColour(osw, v); if (!c) { errors[f.id] = "Choose one of the colours shown."; break; } oc[o.trim()] = c; }
        else if (osw.required) { errors[f.id] = `Choose a colour for ${o.trim()}.`; break; }
      }
      if (errors[f.id]) continue;
      if (Object.keys(oc).length) answer.optionColours = oc;
    }
    answers[f.id] = answer;
  }

  if (Object.keys(errors).length) return { ok: false, errors, message: "Check the highlighted answers." };

  const list = form.fields.filter((f) => answers[f.id]);
  const firstOf = (t: string) => list.find((f) => f.type === t && answers[f.id].value);
  const nameField = list.find((f) => f.type === "short" && /name/i.test(f.label) && answers[f.id].value) ?? firstOf("short");
  const customer: Customer = {
    name: nameField ? String(answers[nameField.id].value).slice(0, 120) : null,
    email: firstOf("email") ? String(answers[firstOf("email")!.id].value) : null,
    phone: firstOf("phone") ? String(answers[firstOf("phone")!.id].value) : null,
    channel: form.settings.notify.channel,
  };
  const consent = form.settings.notify.consent && fd.get("__consent") === "on";
  const who = customer.name || customer.email || customer.phone || "Order";
  const summary = list
    .filter((f) => ["choice", "multi", "dropdown", "sizes"].includes(f.type) && answers[f.id].value)
    .map((f) => `${answers[f.id].label}: ${formatAnswer(answers[f.id])}`)
    .join(" · ")
    .slice(0, 500);
  return { ok: true, answers, customer, consent, title: `${form.title} · ${who}`.slice(0, 200), summary, uploads };
}

/** Human-readable answer, used in job summaries and on the Submissions page. */
export function formatAnswer(a: Answer): string {
  const v = a.value;
  let s: string;
  if (v == null) s = "—";
  else if (typeof v === "string") s = v;
  else if (Array.isArray(v)) s = v.map((x) => (a.optionColours?.[x] ? `${x} (${a.optionColours[x]})` : x)).join(", ");
  else if ("file" in v) s = `File: ${v.file}`;
  else s = Object.entries(v).map(([k, n]) => `${k} × ${n}`).join(", ");
  if (typeof v === "string" && a.optionColours?.[v]) s = `${v} · ${a.optionColours[v]}`;
  if (a.colour) s += ` · colour ${a.colour}`;
  return s;
}

/** Checks a file's first bytes match its declared type (browsers report type from the file name). */
export function sniffMatches(type: string, head: Uint8Array): boolean {
  const b = (...xs: number[]) => xs.every((x, i) => head[i] === x);
  switch (type) {
    case "image/png": return b(0x89, 0x50, 0x4e, 0x47);
    case "image/jpeg": return b(0xff, 0xd8, 0xff);
    case "image/webp": return b(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
    case "application/pdf": return b(0x25, 0x50, 0x44, 0x46);
  }
  return false;
}
