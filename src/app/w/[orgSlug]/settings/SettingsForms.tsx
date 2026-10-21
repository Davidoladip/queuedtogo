"use client";

import { useActionState } from "react";
import type { OrgRole, Workspace } from "@/lib/auth";
import {
  changeRole,
  createInvitation,
  deleteOrganization,
  removeMember,
  updateOrganization,
  updateProfile,
} from "@/server/actions/organizations";
import { initialState } from "@/lib/validation/form-state";
import { US_TIMEZONES } from "@/lib/validation/org";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CopyField } from "@/components/ui/CopyField";

export function BusinessForm({ org, disabled }: { org: Workspace; disabled: boolean }) {
  const [state, action] = useActionState(updateOrganization, initialState);
  return (
    <form action={action} className="form" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="orgId" value={org.id} />
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Business name" name="name" required defaultValue={state.values?.name ?? org.name} error={state.fieldErrors?.name} />
        <Field label="Workspace address" name="slug" required prefix="queuedtogo.app/" defaultValue={state.values?.slug ?? org.slug}
          hint="Changing it changes your form links." error={state.fieldErrors?.slug} />
        <div className="field">
          <label htmlFor="f-timezone">Time zone</label>
          <select id="f-timezone" name="timezone" defaultValue={state.values?.timezone ?? org.timezone}>
            {US_TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {state.fieldErrors?.timezone && <span className="err">{state.fieldErrors.timezone}</span>}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Country: United States · Currency: US dollars (USD)</p>
        {!disabled && <div><SubmitButton pendingText="Saving…">Save business settings</SubmitButton></div>}
      </fieldset>
    </form>
  );
}

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, action] = useActionState(updateProfile, initialState);
  return (
    <form action={action} className="form" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      <Field label="Your name" name="fullName" autoComplete="name" required defaultValue={fullName} error={state.fieldErrors?.fullName}
        hint="Your teammates see this on jobs you're assigned to." />
      <div><SubmitButton pendingText="Saving…">Save name</SubmitButton></div>
    </form>
  );
}

export function InviteForm({ orgId }: { orgId: string }) {
  const [state, action] = useActionState(createInvitation, initialState);
  return (
    <form action={action} className="form" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && (
        <>
          <Notice tone="success">{state.message}</Notice>
          {state.data?.link && <CopyField value={state.data.link} label="Copy link" />}
        </>
      )}
      <input type="hidden" name="orgId" value={orgId} />
      <Field label="Email" name="email" type="email" required defaultValue={state.message ? "" : state.values?.email} error={state.fieldErrors?.email} key={state.message} />
      <div className="field">
        <label htmlFor="f-role">Role</label>
        <select id="f-role" name="role" defaultValue={state.values?.role ?? "member"}>
          <option value="member">Member: works on forms and jobs</option>
          <option value="admin">Admin: also manages the team and settings</option>
        </select>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Email sending isn&apos;t connected yet, so copy the invitation link and send it yourself.</p>
      <div><SubmitButton pendingText="Creating…">Create invitation link</SubmitButton></div>
    </form>
  );
}

export function MemberRow({ orgId, userId, name, email, role, isMe, myRole, lastOwner }: {
  orgId: string; userId: string; name: string | null; email: string; role: OrgRole; isMe: boolean; myRole: OrgRole; lastOwner: boolean;
}) {
  const [roleState, roleAction] = useActionState(changeRole, initialState);
  const [removeState, removeAction] = useActionState(removeMember, initialState);
  const canEdit = (myRole === "owner" || (myRole === "admin" && role !== "owner")) && !lastOwner;
  const canRemove = isMe ? !lastOwner : canEdit;
  const initials = (name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  const err = roleState.error || removeState.error;
  return (
    <tr>
      <td>
        <div className="person">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <span style={{ minWidth: 0 }}>
            <b>{name || email}</b> {isMe && <span className="pill accent">You</span>}
            <br /><small className="muted" style={{ overflowWrap: "anywhere" }}>{email}</small>
            {err && <><br /><small style={{ color: "var(--bad)" }} role="alert">{err}</small></>}
          </span>
        </div>
      </td>
      <td>
        {canEdit ? (
          <form action={roleAction} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="userId" value={userId} />
            <select name="role" defaultValue={role} aria-label={`Role for ${name || email}`} style={{ width: "auto", padding: "6px 8px" }}>
              {myRole === "owner" && <option value="owner">Owner</option>}
              <option value="admin">Admin</option>
              <option value="member">Member</option>
            </select>
            <SubmitButton className="btn small" pendingText="…">Save</SubmitButton>
          </form>
        ) : (
          <span className="pill plain" title={lastOwner ? "A business needs at least one owner" : undefined}>{role}</span>
        )}
      </td>
      <td style={{ textAlign: "right" }}>
        {canRemove && (
          <form action={removeAction}>
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="userId" value={userId} />
            <SubmitButton className="btn small danger" pendingText="…">{isMe ? "Leave" : "Remove"}</SubmitButton>
          </form>
        )}
      </td>
    </tr>
  );
}

export function DeleteBusiness({ orgId, slug }: { orgId: string; slug: string }) {
  const [state, action] = useActionState(deleteOrganization, initialState);
  return (
    <form action={action} className="form" noValidate style={{ maxWidth: 420 }}>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="slug" value={slug} />
      <Field label={`Type ${slug} to confirm`} name="confirm" autoComplete="off" error={state.fieldErrors?.confirm} />
      <div><SubmitButton className="btn danger primary" pendingText="Deleting…">Delete business permanently</SubmitButton></div>
    </form>
  );
}
