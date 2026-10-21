"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage, isNetworkError } from "@/lib/errors";
import { safeNext, siteUrl } from "@/lib/urls";
import { forgotSchema, resetSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/form-state";

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd, ["email"]);
  const parsed = signInSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authErrorMessage(error), values };

  redirect(safeNext(fd.get("next")));
}

export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd, ["fullName", "email"]);
  const parsed = signUpSchema.safeParse({ fullName: fd.get("fullName"), email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

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
  };
}

export async function requestPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd, ["email"]);
  const parsed = forgotSchema.safeParse({ email: fd.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

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
