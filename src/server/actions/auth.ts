"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage, isNetworkError } from "@/lib/errors";
import { safeNext, siteUrl } from "@/lib/urls";
import { forgotSchema, resetSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/form-state";
import { BOT_MESSAGE, SLOW_DOWN, clientIp, passesBotCheck, takeRateLimit } from "@/server/abuse";
import { env } from "@/lib/env";
import { logSecurityEvent } from "@/server/security-log";

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd, ["email"]);
  const parsed = signInSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const ip = await clientIp();
  if (!(await takeRateLimit("signin-ip", ip, 30, 600)) || !(await takeRateLimit("signin-email", parsed.data.email, 10, 600))) {
    return { error: SLOW_DOWN, values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    await logSecurityEvent("auth.signin_failed", { ip, email: parsed.data.email, detail: error.code ?? "error" });
    return { error: authErrorMessage(error), values };
  }

  redirect(safeNext(fd.get("next")));
}

export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd, ["fullName", "email"]);
  const parsed = signUpSchema.safeParse({ fullName: fd.get("fullName"), email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const ip = await clientIp();
  if (!(await passesBotCheck(fd, ip))) return { error: BOT_MESSAGE, values };
  if (!(await takeRateLimit("signup-ip", ip, 6, 3600))) return { error: SLOW_DOWN, values };

  const next = safeNext(fd.get("next"), "/onboarding");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: authErrorMessage(error), values };

  // Email confirmation turned off: the user is signed in straight away.
  if (data.session) redirect(next);

  return {
    message: `We sent a confirmation link to ${parsed.data.email}. Open it to finish creating your account.`,
    values: { email: parsed.data.email, next },
  };
}

/**
 * Sends the sign-up confirmation email again. Never says whether the address has an account;
 * Supabase limits how often emails can be sent.
 */
export async function resendConfirmation(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse({ email: fd.get("email") });
  if (!parsed.success) return { error: "Enter a valid email address." };
  const ip = await clientIp();
  if (!(await takeRateLimit("resend-ip", ip, 6, 3600)) || !(await takeRateLimit("resend-email", parsed.data.email, 3, 3600))) {
    return { error: SLOW_DOWN };
  }
  const next = safeNext(fd.get("next"), "/onboarding");
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error && (isNetworkError(error) || error.code?.startsWith("over_"))) return { error: authErrorMessage(error) };
  return { message: `If ${parsed.data.email} is waiting to be confirmed, a new link is on its way.` };
}

export async function requestPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd, ["email"]);
  const parsed = forgotSchema.safeParse({ email: fd.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const ip = await clientIp();
  if (!(await passesBotCheck(fd, ip))) return { error: BOT_MESSAGE, values };
  if (!(await takeRateLimit("reset-ip", ip, 6, 3600)) || !(await takeRateLimit("reset-email", parsed.data.email, 3, 3600))) {
    return { error: SLOW_DOWN, values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/reset-password`,
  });
  // Only report problems we can act on; never reveal whether the email has an account.
  if (error && (isNetworkError(error) || error.code?.startsWith("over_"))) {
    return { error: authErrorMessage(error), values };
  }
  return { message: `If ${parsed.data.email} has an account, a reset link is on its way. It works for 1 hour.` };
}

export async function updatePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { error: "Your reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: authErrorMessage(error) };
  redirect("/?password=updated");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?signed_out=1");
}

/**
 * "Continue with Google" (Google Identity Services): the browser hands over Google's signed ID token and the raw
 * nonce; the server signs in with them, so the session cookie is set by the server and stays out of reach of
 * page scripts (httpOnly).
 */
export async function googleSignIn(credential: string, rawNonce: string, next: string): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  const failed = "Google sign-in didn't finish. Try again, or use your email below.";
  if (typeof credential !== "string" || credential.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credential)) return { ok: false, error: failed };
  if (typeof rawNonce !== "string" || !/^[0-9a-f]{32,128}$/.test(rawNonce)) return { ok: false, error: failed };
  const ip = await clientIp();
  if (!(await takeRateLimit("google-ip", ip, 30, 600))) return { ok: false, error: SLOW_DOWN };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: credential, nonce: rawNonce });
  if (error) {
    await logSecurityEvent("auth.google_failed", { ip, detail: error.message.slice(0, 120) });
    return { ok: false, error: failed };
  }
  return { ok: true, next: safeNext(next) };
}

/** Google's redirect flow (used when Google Identity Services isn't configured): the server starts it and keeps the PKCE verifier in an httpOnly cookie. */
export async function googleRedirectStart(next: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ip = await clientIp();
  if (!(await takeRateLimit("google-ip", ip, 30, 600))) return { ok: false, error: SLOW_DOWN };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteUrl()}/auth/confirm?next=${encodeURIComponent(safeNext(next))}`, queryParams: { prompt: "select_account" }, skipBrowserRedirect: true },
  });
  if (error || !data?.url || !data.url.startsWith(env.supabaseUrl.replace(/\/$/, "") + "/")) return { ok: false, error: "We couldn't reach Google. Try again, or use your email below." };
  return { ok: true, url: data.url };
}
