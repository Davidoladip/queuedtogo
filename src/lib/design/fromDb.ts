import { normalizeDesign, normalizeFields, normalizeSettings, type FormModel } from "./engine";

type FormRow = {
  id: string;
  title: string;
  slug: string;
  event_date: string | null;
  venue: string | null;
  intro: string | null;
  thanks: string | null;
  submit_label: string;
  settings: unknown;
  design: unknown;
};
type FieldRow = { id: string; type: string; label: string; help: string; placeholder: string; required: boolean; options: unknown; config: unknown };

/** Builder model from the saved draft. */
export function formFromRows(row: FormRow, fields: FieldRow[]): FormModel {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    eventDate: row.event_date,
    venue: row.venue ?? "",
    intro: row.intro ?? "",
    thanks: row.thanks ?? "",
    submitLabel: row.submit_label,
    settings: normalizeSettings(row.settings),
    design: normalizeDesign(row.design),
    fields: normalizeFields(fields),
  };
}

/** Public model from the published snapshot (see publish_form). */
export function formFromPublished(formId: string, slug: string, config: Record<string, unknown>): FormModel {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id: formId,
    title: s(config.title) || "Order form",
    slug,
    eventDate: s(config.event_date) || null,
    venue: s(config.venue),
    intro: s(config.intro),
    thanks: s(config.thanks),
    submitLabel: s(config.submit_label) || "Submit",
    settings: normalizeSettings(config.settings),
    design: normalizeDesign(config.design),
    fields: normalizeFields(config.fields),
  };
}
