"use client";

import { useActionState } from "react";
import { acceptInvitation } from "@/server/actions/organizations";
import { initialState } from "@/lib/validation/form-state";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function AcceptInvite({ token, orgName }: { token: string; orgName: string }) {
  const [state, action] = useActionState(acceptInvitation, initialState);
  return (
    <form action={action} className="form">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="token" value={token} />
      <SubmitButton className="btn primary block" pendingText="Joining…">Join {orgName}</SubmitButton>
    </form>
  );
}
