"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage } from "@/lib/errors";
import { DEFAULT_THEME, normalizeDesign, normalizeSettings, slugify, starterFields } from "@/lib/design/engine";
import { newFormSchema, parseDraft } from "@/lib/validation/form";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/form-state";
import type { Json } from "@/types/database";

export type ActionResult = { ok: true; at?: string; version?: number } | { ok: false; error: string };

const SLUG_TAKEN = "Another form in this business already uses that address. Choose a different one.";

/** Creates a draft form with starter questions, then opens it in the builder. */
export async function createForm(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd, ["title"]);
  const parsed = newFormSchema.safeParse({ orgId: fd.get("orgId"), title: fd.get("title") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const supabase = await createClient();

  const { data: org } = await supabase.from("organizations").select("slug").eq("id", parsed.data.orgId).maybeSingle();
  if (!org) return { error: "We couldn't find that business.", values };

  const base = slugify(parsed.data.title).slice(0, 52).replace(/-$/, "") || "form";
  let formId: string | null = null;
  for (let i = 1; i <= 20 && !formId; i++) {
    const slug = i === 1 ? (base.length < 2 ? `${base}-form` : base) : `${base}-${i}`;
    const { data, error } = await supabase
      .from("forms")
      .insert({
        org_id: parsed.data.orgId,
        title: parsed.data.title,
        slug,
        submit_label: "Place my order",
        thanks: "Thanks! We've got your order and will send you updates as it moves along.",
        settings: normalizeSettings({}) as unknown as NonNullable<Json>,
        design: normalizeDesign({ theme: DEFAULT_THEME }) as unknown as NonNullable<Json>,
      })
      .select("id")
      .single();
    if (error && error.code !== "23505") return { error: dbErrorMessage(error, "We couldn't create the form. Try again."), values };
    if (data) formId = data.id;
  }
  if (!formId) return { error: "Choose a more distinctive title. Lots of forms already use this one.", values };

  const fields = starterFields().map((f, position) => ({
    id: f.id, org_id: parsed.data.orgId, form_id: formId, position, type: f.type, label: f.label, help: f.help,
    placeholder: f.placeholder, required: f.required, options: f.options as unknown as NonNullable<Json>, config: f.config as unknown as NonNullable<Json>,
  }));
  const { error: fErr } = await supabase.from("form_fields").insert(fields);
  if (fErr) return { error: dbErrorMessage(fErr, "The form was created, but its starter questions weren't saved. Open it to add questions."), values };

  revalidatePath(`/w/${org.slug}/forms`);
  redirect(`/w/${org.slug}/forms/${formId}`);
}

/** Saves the builder's draft in one transaction. The public form doesn't change until it is published. */
export async function saveDraft(input: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = parseDraft(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_form_draft", {
    p_form: parsed.formId,
    p_data: parsed.data as unknown as NonNullable<Json>,
    p_fields: parsed.fields as unknown as NonNullable<Json>,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: SLUG_TAKEN };
    if (error.code === "P0002") return { ok: false, error: "This form no longer exists, or you no longer have access to it." };
    if (error.code === "PGRST202") return { ok: false, error: "Saving isn't set up on the database yet (save_form_draft is missing)." };
    return { ok: false, error: dbErrorMessage(error, "We couldn't save your changes. Check your connection and try again.") };
  }
  return { ok: true, at: data };
}

const idSchema = z.uuid();

/** Snapshots the saved draft as the public version and makes the form live. */
export async function publishForm(formId: string, orgSlug: string): Promise<ActionResult> {
  await requireUser();
  if (!idSchema.safeParse(formId).success) return { ok: false, error: "That form id isn't valid." };
  const supabase = await createClient();
  const { data: version, error } = await supabase.rpc("publish_form", { p_form: formId });
  if (error) return { ok: false, error: dbErrorMessage(error, "We couldn't publish the form. Try again.") };
  const { error: sErr } = await supabase.from("forms").update({ status: "live" }).eq("id", formId);
  if (sErr) return { ok: false, error: dbErrorMessage(sErr, "The form was published but couldn't be set to live. Try again.") };
  revalidatePath(`/w/${orgSlug}/forms`);
  return { ok: true, version };
}

/** Closes a live form (customers see a "closed" message) or moves it back to draft. */
export async function setFormStatus(formId: string, orgSlug: string, status: "draft" | "closed" | "live"): Promise<ActionResult> {
  await requireUser();
  if (!idSchema.safeParse(formId).success || !["draft", "closed", "live"].includes(status)) return { ok: false, error: "That change isn't valid." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("forms").update({ status }).eq("id", formId).select("id").maybeSingle();
  if (error) {
    if (error.code === "23514") return { ok: false, error: "Publish the form before setting it to live." };
    return { ok: false, error: dbErrorMessage(error, "We couldn't change the form's status.") };
  }
  if (!data) return { ok: false, error: "This form no longer exists, or you no longer have access to it." };
  revalidatePath(`/w/${orgSlug}/forms`);
  return { ok: true };
}

export async function deleteForm(fd: FormData): Promise<void> {
  await requireUser();
  const formId = String(fd.get("formId") ?? "");
  const orgSlug = String(fd.get("orgSlug") ?? "");
  if (!idSchema.safeParse(formId).success || !/^[a-z0-9-]{2,60}$/.test(orgSlug)) redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.from("forms").delete().eq("id", formId).select("id");
  revalidatePath(`/w/${orgSlug}/forms`);
  redirect(`/w/${orgSlug}/forms?${data?.length ? "deleted=1" : "notdeleted=1"}`);
}
