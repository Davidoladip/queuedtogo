import { z } from "zod";
import { FIELD_TYPES, normalizeDesign, normalizeSettings, type FormModel } from "@/lib/design/engine";

const jsonSize = (v: unknown) => JSON.stringify(v ?? null).length;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/, "Use 2 to 60 lowercase letters, numbers and dashes, not starting or ending with a dash.");

export const fieldSchema = z.object({
  id: z.uuid(),
  type: z.enum(FIELD_TYPES as [string, ...string[]]),
  label: z.string().max(500, "Labels can be up to 500 characters."),
  help: z.string().max(500, "Help text can be up to 500 characters."),
  placeholder: z.string().max(200, "Placeholders can be up to 200 characters."),
  required: z.boolean(),
  options: z.array(z.string().max(200, "Options can be up to 200 characters.")).max(100, "A block can have up to 100 options."),
  config: z.record(z.string(), z.unknown()).refine((c) => jsonSize(c) < 8000, "This block's settings are too large."),
});

export const draftSchema = z.object({
  formId: z.uuid(),
  title: z.string().trim().min(1, "Give the form a title.").max(140, "Titles can be up to 140 characters."),
  slug: slugSchema,
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  venue: z.string().trim().max(140, "Venues can be up to 140 characters."),
  intro: z.string().max(2000, "The intro can be up to 2,000 characters."),
  thanks: z.string().max(2000, "The thank-you message can be up to 2,000 characters."),
  submitLabel: z.string().trim().min(1, "The submit button needs a label.").max(60, "Button labels can be up to 60 characters."),
  settings: z.unknown(),
  design: z.unknown().refine((d) => jsonSize(d) < 200_000, "The design is too large to save."),
  fields: z
    .array(fieldSchema)
    .max(200, "A form can have up to 200 blocks.")
    .refine((fs) => fs.filter((f) => f.type === "submit").length === 1, "A form needs exactly one submit button.")
    .refine((fs) => new Set(fs.map((f) => f.id)).size === fs.length, "Two blocks share an id."),
});

export type DraftInput = z.input<typeof draftSchema>;

/** Converts the builder's model into the validated payload for save_form_draft. */
export function toDraftInput(form: FormModel): DraftInput {
  return {
    formId: form.id,
    title: form.title,
    slug: form.slug,
    eventDate: form.eventDate || null,
    venue: form.venue,
    intro: form.intro,
    thanks: form.thanks,
    submitLabel: form.submitLabel,
    settings: form.settings,
    design: form.design,
    fields: form.fields,
  };
}

export function parseDraft(input: unknown) {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Some of the form's settings aren't valid." };
  const d = parsed.data;
  return {
    ok: true as const,
    formId: d.formId,
    data: {
      title: d.title,
      slug: d.slug,
      event_date: d.eventDate ?? "",
      venue: d.venue,
      intro: d.intro,
      thanks: d.thanks,
      submit_label: d.submitLabel,
      // Re-normalised on the server, so only known, checked keys are stored.
      settings: normalizeSettings(d.settings),
      design: normalizeDesign(d.design),
    },
    fields: d.fields,
  };
}

export const newFormSchema = z.object({
  orgId: z.uuid(),
  title: z.string().trim().min(1, "Give the form a title.").max(140, "Titles can be up to 140 characters."),
});
