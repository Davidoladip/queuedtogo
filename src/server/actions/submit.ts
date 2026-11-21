"use server";

import { createHmac, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { formFromPublished } from "@/lib/design/fromDb";
import { UPLOAD_TYPES, checkSubmission, sniffMatches } from "@/lib/submission";
import { formIsPaid, money, quoteLines } from "@/lib/pricing";
import { HOLD_MINUTES } from "@/lib/payments";
import { loadPaymentsStatus } from "@/lib/payments-data";
import { stripeClient } from "@/server/billing";
import { createSquareCheckout, createStripeCheckout, type CheckoutResult } from "@/server/payments/checkout";
import { applyPayment, loadOrder, removeOrderFiles } from "@/server/payments/settle";
import { logSecurityEvent } from "@/server/security-log";
import { siteUrl } from "@/lib/urls";
import type { Json } from "@/types/database";
import { dispatchQueued } from "@/server/messaging";
import { BOT_MESSAGE, clientIp, passesBotCheck } from "@/server/abuse";
import { rsvpTextsApproved } from "@/lib/rsvp-texts";
import { eventTimes, googleCalendarUrl, type RsvpStatus } from "@/lib/rsvp";
import type { RsvpDone } from "@/components/form/FormRenderer";

export type SubmitResult =
  | { ok: true; number: number; trackingUrl: string; rsvp?: undefined; redirect?: undefined }
  | { ok: true; redirect: string; rsvp?: undefined }
  | { ok: true; rsvp: RsvpDone; redirect?: undefined }
  | { ok: false; message: string; errors?: Record<string, string> };

const SLUG = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;
const OFF = "Online ordering isn't switched on for this form yet. Please check back soon.";
const MAX_TOTAL = 25 * 1024 * 1024;
const PAY_OFF = "This business isn't taking payments right now. Please try again later.";
const PAY_FAILED = "We couldn't start the secure payment. Nothing was charged. Please try again in a moment.";

/** Receives a public form submission: checks it against the published form, stores files, creates the order. */
export async function submitOrder(orgSlug: string, formSlug: string, fd: FormData): Promise<SubmitResult> {
  if (!SLUG.test(orgSlug) || !SLUG.test(formSlug)) return { ok: false, message: "We couldn't find this form." };
  const admin = adminClient();
  if (!admin) return { ok: false, message: OFF };

  const { data: org } = await admin.from("organizations").select("id, timezone").eq("slug", orgSlug).maybeSingle();
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
  const ip = await clientIp();
  if (!(await passesBotCheck(fd, ip))) return { ok: false, message: BOT_MESSAGE };
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
      await logSecurityEvent("upload.rejected", { ip, orgId: form.org_id, detail: `content did not match ${u.file.type}` });
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

  // Forms with prices or tickets go through checkout: never saved as unpaid orders.
  if (formIsPaid(model)) {
    const pay = await loadPaymentsStatus(form.org_id);
    if (!pay.ready) { await removeFiles(admin, stored); return { ok: false, message: PAY_OFF }; }
    // Priced again here from the published form; nothing the browser sent about prices or totals is used.
    const quote = quoteLines(checked.lines, pay.rate, model.settings.pay.feePayer);
    const orderId = randomUUID();
    const { data: started, error: sErr } = await admin.rpc("start_checkout", {
      p_order: orderId,
      p_form: form.id,
      p_version: form.published_version,
      p_answers: answers as unknown as Json,
      p_customer: checked.customer as unknown as Json,
      p_consent: checked.consent,
      p_title: checked.title,
      p_summary: `Paid ${money(quote.total, true)}${checked.summary ? ` · ${checked.summary}` : ""}`.slice(0, 500),
      p_files: stored as unknown as Json,
      p_ip_hash: ipHash as string,
      p_user_agent: (h.get("user-agent") ?? "").slice(0, 400),
      p_client_key: /^[A-Za-z0-9_-]{16,80}$/.test(clientKey) ? clientKey : (null as unknown as string),
      p_lines: quote.lines as unknown as Json,
      p_subtotal: quote.subtotal,
      p_fee: quote.fee,
      p_total: quote.total,
      p_fee_payer: quote.feePayer,
      // A minute longer than the 30 minutes shown, because Stripe's checkout can't expire sooner than 30 minutes.
      p_hold_minutes: HOLD_MINUTES + 1,
    });
    if (sErr) {
      await removeFiles(admin, stored);
      const shown = ["QTG01", "QTG02", "QTG03", "QTG30", "QTG31"].includes(sErr.code ?? "");
      if (!shown) console.error("start_checkout", sErr.code, sErr.message);
      return { ok: false, message: shown ? (sErr.code === "QTG01" ? "This form isn't taking orders right now." : sErr.message) : PAY_FAILED };
    }
    const st = started as { order_id: string; status: string; checkout_url: string | null; repeat: boolean; provider?: string; account_id?: string; location_id?: string | null; hold_expires_at?: string };
    const site = await siteUrl();
    const returnUrl = `${site}/pay/${st.order_id}`;
    if (st.repeat) {
      // A double tap: send the buyer to the checkout that's already open (or to their finished order).
      if (stored.length) await removeFiles(admin, stored);
      if (st.status === "paid" || !st.checkout_url) return { ok: true, redirect: returnUrl };
      return { ok: true, redirect: st.checkout_url };
    }
    const order = await loadOrder(admin, st.order_id);
    if (!order) return { ok: false, message: PAY_FAILED };
    // Free tickets: nothing to pay, so the order is confirmed straight away (tickets still counted against the limits).
    if (st.provider === "none") {
      const done = await applyPayment(admin, order, { amount: 0, currency: "usd", account: order.account_id, paymentRef: null });
      return done.status === "paid" ? { ok: true, number: done.number, trackingUrl: `${site}/t/${done.trackingToken}` } : { ok: false, message: PAY_FAILED };
    }
    const co = {
      id: order.id, orgId: form.org_id, accountId: st.account_id!, locationId: st.location_id ?? null, lines: quote.lines,
      feeCents: quote.fee, feePayer: quote.feePayer, totalCents: quote.total, holdExpiresAt: st.hold_expires_at!,
      email: checked.customer.email, title: model.title,
    };
    let res: CheckoutResult;
    try {
      if (st.provider === "stripe") {
        const stripe = stripeClient();
        if (!stripe) throw new Error("Stripe isn't connected");
        res = await createStripeCheckout(stripe, co, { success: returnUrl, cancel: `${returnUrl}/cancel` });
      } else {
        res = await createSquareCheckout(admin, co, returnUrl);
      }
    } catch (e) {
      console.error("checkout", st.provider, e instanceof Error ? e.message : e);
      // Release the hold at once so the tickets go back on sale.
      await admin.from("paid_orders").update({ status: "canceled" }).eq("id", order.id).eq("status", "pending");
      await removeOrderFiles(admin, order);
      return { ok: false, message: PAY_FAILED };
    }
    await admin.from("paid_orders").update({ checkout_id: res.checkoutId, checkout_url: res.url, payment_ref: res.paymentRef }).eq("id", order.id);
    return { ok: true, redirect: res.url };
  }

  if (model.settings.mode === "rsvp" && checked.rsvp) {
    const { data, error } = await admin.rpc("submit_rsvp", {
      p_submission: submissionId,
      p_form: form.id,
      p_version: form.published_version,
      p_answers: answers as unknown as Json,
      // Texting permission is recorded only while RSVP texts are approved for QueuedToGo.
      p_customer: { ...checked.customer, sms_consent: checked.consent && rsvpTextsApproved() } as unknown as Json,
      p_status: checked.rsvp.status,
      p_party: checked.rsvp.party,
      p_files: stored as unknown as Json,
      p_ip_hash: ipHash as string,
      p_user_agent: (h.get("user-agent") ?? "").slice(0, 400),
      p_client_key: /^[A-Za-z0-9_-]{16,80}$/.test(clientKey) ? clientKey : (null as unknown as string),
    });
    if (error) {
      await removeFiles(admin, stored);
      const known: Record<string, string> = {
        QTG01: "This form isn't taking RSVPs right now.",
        QTG02: "This form was just updated. Reload the page, check your answers and send it again.",
      };
      const shown = ["QTG03", "QTG08", "QTG09", "QTG10", "QTG20"].includes(error.code ?? "") ? error.message : null;
      return { ok: false, message: known[error.code ?? ""] ?? shown ?? "We couldn't save your RSVP. Please try again." };
    }
    const r = data as { token: string; status: RsvpStatus; waitlisted: boolean; party: number; repeat: boolean };
    if (r.repeat) await removeFiles(admin, stored);
    else after(() => dispatchQueued({ orgId: form.org_id }));
    const base = `${await siteUrl()}/r/${r.token}`;
    const times = eventTimes(model.eventDate, model.settings.rsvp, org.timezone);
    return {
      ok: true,
      rsvp: {
        status: r.status, waitlisted: r.waitlisted, party: r.party, name: checked.customer.name,
        manageUrl: model.settings.rsvp.allowChange ? base : null,
        icsUrl: times ? `${base}/calendar.ics` : null,
        googleUrl: times ? googleCalendarUrl({ uid: r.token.slice(0, 24), title: model.title, location: model.venue, description: `Your RSVP: ${base}`, url: base, times }) : null,
      },
    };
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
      QTG20: error.message,
    };
    return { ok: false, message: known[error.code ?? ""] ?? "We couldn't save your order. Please try again." };
  }
  const r = data as { number: number; tracking_token: string; repeat: boolean };
  if (r.repeat) await removeFiles(admin, stored);
  // The order confirmation text (if the business has texting on) goes out after the reply.
  else after(() => dispatchQueued({ orgId: form.org_id }));
  return { ok: true, number: r.number, trackingUrl: `${await siteUrl()}/t/${r.tracking_token}` };
}

async function removeFiles(admin: NonNullable<ReturnType<typeof adminClient>>, files: { path: string }[]) {
  if (files.length) await admin.storage.from("submission-uploads").remove(files.map((f) => f.path));
}
