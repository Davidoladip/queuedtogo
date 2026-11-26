"use client";

import { useEffect, useRef } from "react";
import { DemoForm } from "@/components/demo/DemoForm";
import type { FormModel } from "@/lib/design/engine";

/**
 * Test mode: the form exactly as guests will see it, working end to end (answers are checked and the
 * thank-you screen shows), but nothing is saved or sent. Available before the business has a plan.
 */
export function TestDrive({ form, assetBase, businessName, onClose }: { form: FormModel; assetBase: string; businessName: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    return () => d?.close?.();
  }, []);
  return (
    <dialog ref={ref} className="b-test" aria-labelledby="b-test-h" onClose={onClose} onCancel={onClose}>
      <div className="b-test-bar">
        <div>
          <h2 id="b-test-h">Test your form</h2>
          <p>Fill it in as a guest would. Nothing is saved or sent, and the tracking link is only a sample.</p>
        </div>
        <button type="button" className="btn small" onClick={() => ref.current?.close()}>Close test</button>
      </div>
      <div className="b-test-body pf-page">
        <DemoForm form={structuredClone(form)} assetBase={assetBase} businessName={businessName} />
      </div>
    </dialog>
  );
}
