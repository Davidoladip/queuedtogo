"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { acceptTerms } from "@/server/actions/organizations";

/** Asks people who joined before the current Terms of Service (or before an update) to accept them. */
export function TermsPrompt() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="terms-prompt" role="region" aria-label="Terms of Service">
      <div className="wrap terms-prompt-in">
        <p>
          <b>We&apos;ve published our Terms of Service.</b> Please review them, including the arbitration agreement and class action waiver
          in section 16, and the updated <Link href="/privacy" target="_blank">Privacy Policy</Link>.{" "}
          {failed && <span role="alert">That didn&apos;t save. Try again.</span>}
        </p>
        <div className="terms-prompt-act">
          <Link href="/terms-of-service" target="_blank" className="btn small">Read the terms</Link>
          <button type="button" className="btn small primary" disabled={busy} onClick={async () => {
            setBusy(true);
            const r = await acceptTerms();
            setBusy(false);
            if (r.ok) router.refresh(); else setFailed(true);
          }}>{busy ? "Saving…" : "I agree"}</button>
        </div>
      </div>
    </div>
  );
}
