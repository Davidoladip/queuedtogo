"use server";

import { createHmac, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { adminClient } from "@/lib/supabase/admin";
import { formFromPublished } from "@/lib/design/fromDb";
import { UPLOAD_TYPES, checkSubmission, sniffMatches } from "@/lib/submission";
import { siteUrl } from "@/lib/urls";
import type { Json } from "@/types/database";

export type SubmitResult =
  | { ok: true; number: number; trackingUrl: string }
  | { ok: false; message: string; errors?: Record<string, string> };

const SLUG = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;
const OFF = "Online ordering isn't switched on for this form yet. Please check back soon.";
const MAX_TOTAL = 25 * 1024 * 1024;

/** Receives a public form submission: checks it against the published form, stores files, creates the order. */
export async function submitOrder(orgSlug: string, formSlug: string, fd: FormData): Promise<SubmitResult> {
  if (!SLUG.test(orgSlug) || !SLUG.test(formSlug)) return { ok: false, message: "We couldn't find this form." };
  const admin = adminClient();
  if (!admin) return { ok: false, message: OFF };

  const { data: org } = await admin.from("organizations").select("id").eq("slug", orgSlug).maybeSingle();
  if (!org) return { ok: false, message: "We couldn't find this form." };
  const { data: form, error: fErr } = await admin
    .from("forms")
    .select("id, org_id, slug, status, published_config, published_version")
    .eq("org_id", org.id)
    .eq("slug", formSlug)
    .maybeSingle();
  if (fErr) return { ok: false, message: "We couldn't reach the order system. Try again in a moment." };
  if (!form || form.status !== "live" || !form.published_config) return { ok: false, message: "This form isn't taking orders right now." };
  if (Number(fd.get("__v")) !== form.published_version) {
    return { ok: false, message: "This form was just updated. Reload the page, check your answers and send it again." };
  }

  const model = formFromPublished(form.id, form.slug, form.published_config as Record<string, unknown>);
  const checked = checkSubmission(model, fd);
  if (!checked.ok) return { ok: false, message: checked.message, errors: checked.errors };
  const total = checked.uploads.reduce((n, u) => n + u.file.size, 0);
  if (total > MAX_TOTAL) return { ok: false, message: "Your files add up to more than 25 MB. Use smaller files." };

  // Visitor identity for rate limiting: a keyed hash of the IP address, never the address itself.
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim();
  const pepper = process.env.SUBMISSION_IP_SALT || process.env.SUPABASE_SECRET_KEY!;
  const ipHash = ip ? createHmac("sha256", pepper).update(`${ip}|${form.org_id}`).digest("hex") : null;
  const clientKey = String(fd.get("__k") ?? "");
  const submissionId = randomUUID();

  // Customer uploads go to the private bucket under the business's folder, then are recorded with the order.
  const stored: { path: string; mime: string; size: number; name: string }[] = [];
  const answers = checked.answers;
  for (const u of checked.uploads) {
    const buf = new Uint8Array(await u.file.arrayBuffer());
    if (!sniffMatches(u.file.type, buf.subarray(0, 16))) {
      await removeFiles(admin, stored);
      return { ok: false, message: "Check the highlighted answers.", errors: { [u.fieldId]: "That file doesn't look like a real PNG, JPG, WebP or PDF." } };
    }
    const path = `${form.org_id}/${form.id}/${submissionId}/${randomUUID()}.${UPLOAD_TYPES[u.file.type]}`;
    const { error } = await admin.storage.from("submission-uploads").upload(path, buf, { contentType: u.file.type, upsert: false });
    if (error) {
      await removeFiles(admin, stored);
      return { ok: false, message: "Your file didn't upload. Check your connection and try again." };
    }
    stored.push({ path, mime: u.file.type, size: u.file.size, name: u.file.name.slice(0, 200) });
    const a = answers[u.fieldId];
    const v = a?.value;
    if (a && v && typeof v === "object" && !Array.isArray(v) && "file" in v) a.value = { file: String(v.file), size: Number(v.size), type: String(v.type), path };
  }

  const { data, error } = await admin.rpc("submit_form", {
    p_submission: submissionId,
    p_form: form.id,
    p_version: form.published_version,
    p_answers: answers as unknown as Json,
    p_customer: checked.customer as unknown as Json,
    p_consent: checked.consent,
    p_title: checked.title,
    p_summary: checked.summary,
    p_files: stored as unknown as Json,
    p_ip_hash: ipHash as string,
    p_user_agent: (h.get("user-agent") ?? "").slice(0, 400),
    p_client_key: /^[A-Za-z0-9_-]{16,80}$/.test(clientKey) ? clientKey : (null as unknown as string),
  });
  if (error) {
    await removeFiles(admin, stored);
    const known: Record<string, string> = {
      QTG01: "This form isn't taking orders right now.",
      QTG02: "This form was just updated. Reload the page, check your answers and send it again.",
      QTG03: error.message,
    };
    return { ok: false, message: known[error.code ?? ""] ?? "We couldn't save your order. Please try again." };
  }
  const r = data as { number: number; tracking_token: string; repeat: boolean };
  if (r.repeat) await removeFiles(admin, stored);
  return { ok: true, number: r.number, trackingUrl: `${await siteUrl()}/t/${r.tracking_token}` };
}

async function removeFiles(admin: NonNullable<ReturnType<typeof adminClient>>, files: { path: string }[]) {
  if (files.length) await admin.storage.from("submission-uploads").remove(files.map((f) => f.path));
}
