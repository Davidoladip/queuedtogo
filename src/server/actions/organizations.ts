"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage } from "@/lib/errors";
import { siteUrl } from "@/lib/urls";
import {
  changeRoleSchema,
  createOrgSchema,
  inviteSchema,
  memberSchema,
  updateOrgSchema,
} from "@/lib/validation/org";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/form-state";
import { z } from "zod";

export async function createOrganization(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("/onboarding");
  const values = formValues(fd, ["name", "slug"]);
  const parsed = createOrgSchema.safeParse({ name: fd.get("name"), slug: fd.get("slug") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", { p_name: parsed.data.name, p_slug: parsed.data.slug });
  if (error) {
    if (error.code === "23505") return { fieldErrors: { slug: "That address is taken. Try another." }, values };
    return { error: dbErrorMessage(error, "We couldn't create the business. Try again."), values };
  }
  redirect(`/w/${data.slug}`);
}

export async function updateOrganization(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd, ["name", "slug", "timezone"]);
  const parsed = updateOrgSchema.safeParse({
    orgId: fd.get("orgId"),
    name: fd.get("name"),
    slug: fd.get("slug"),
    timezone: fd.get("timezone"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name, slug: parsed.data.slug, timezone: parsed.data.timezone })
    .eq("id", parsed.data.orgId)
    .select("slug")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { fieldErrors: { slug: "That address is taken. Try another." }, values };
    return { error: dbErrorMessage(error, "We couldn't save the changes."), values };
  }
  if (!data) return { error: "Only owners and admins can change business settings.", values };
  revalidatePath("/w", "layout");
  redirect(`/w/${data.slug}/settings?saved=business`);
}

export async function createInvitation(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd, ["email", "role"]);
  const parsed = inviteSchema.safeParse({ orgId: fd.get("orgId"), email: fd.get("email"), role: fd.get("role") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invitation", {
    p_org: parsed.data.orgId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error || !token) return { error: dbErrorMessage(error, "We couldn't create the invitation."), values };

  revalidatePath("/w", "layout");
  return {
    message: `Invitation created for ${parsed.data.email}. Send them this link. It works once, for 7 days, and only for that email address.`,
    data: { link: `${await siteUrl()}/invite/${token}` },
  };
}

export async function cancelInvitation(fd: FormData): Promise<void> {
  await requireUser();
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("organization_invitations").delete().eq("id", id.data);
  revalidatePath("/w", "layout");
}

export async function changeRole(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const parsed = changeRoleSchema.safeParse({ orgId: fd.get("orgId"), userId: fd.get("userId"), role: fd.get("role") });
  if (!parsed.success) return { error: "Choose a valid role." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .update({ role: parsed.data.role })
    .eq("org_id", parsed.data.orgId)
    .eq("user_id", parsed.data.userId)
    .select("role");
  if (error) return { error: dbErrorMessage(error, "We couldn't change that role.") };
  if (!data?.length) return { error: "Only owners and admins can change roles." };
  revalidatePath("/w", "layout");
  return { message: "Role updated." };
}

export async function removeMember(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = memberSchema.safeParse({ orgId: fd.get("orgId"), userId: fd.get("userId") });
  if (!parsed.success) return { error: "That person could not be found." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .delete()
    .eq("org_id", parsed.data.orgId)
    .eq("user_id", parsed.data.userId)
    .select("user_id");
  if (error) return { error: dbErrorMessage(error, "We couldn't remove that person.") };
  if (!data?.length) return { error: "Only owners and admins can remove people." };

  revalidatePath("/w", "layout");
  if (parsed.data.userId === user.id) redirect("/?left=1");
  return { message: "Removed from the team." };
}

export async function acceptInvitation(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const token = z.string().regex(/^[0-9a-f]{64}$/).safeParse(fd.get("token"));
  if (!token.success) return { error: "This invitation link is not valid." };
  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc("accept_invitation", { p_token: token.data });
  if (error || !slug) return { error: dbErrorMessage(error, "We couldn't accept the invitation.") };
  revalidatePath("/", "layout");
  redirect(`/w/${slug}`);
}

export async function deleteOrganization(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const orgId = z.string().uuid().safeParse(fd.get("orgId"));
  const confirm = String(fd.get("confirm") ?? "").trim();
  const expected = String(fd.get("slug") ?? "");
  if (!orgId.success) return { error: "That business could not be found." };
  if (confirm !== expected) return { fieldErrors: { confirm: `Type ${expected} to confirm.` } };

  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").delete().eq("id", orgId.data).select("id");
  if (error) return { error: dbErrorMessage(error, "We couldn't delete the business.") };
  if (!data?.length) return { error: "Only owners can delete a business." };
  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}

export async function updateProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = z.string().trim().min(1, "Enter your name").max(120).safeParse(fd.get("fullName"));
  if (!name.success) return { fieldErrors: { fullName: name.error.issues[0].message } };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: name.data }).eq("id", user.id);
  if (error) return { error: dbErrorMessage(error, "We couldn't save your name.") };
  revalidatePath("/w", "layout");
  return { message: "Your name is saved." };
}
