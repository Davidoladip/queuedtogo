"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avatarUrl, prepareAvatar } from "@/lib/avatar";
import { avatarUploadTicket, removeAvatar, saveAvatar } from "@/server/actions/organizations";
import { Avatar } from "@/components/ui/Avatar";
import { Notice } from "@/components/ui/Notice";

/**
 * Upload, change or remove the profile picture (a photo or a business logo). The image is cropped to a square in
 * the browser, uploaded with a one-time link, then saved on the server. `demo` stores it in the dev harness instead.
 */
export function AvatarField({ name, email, path: initial, demo }: { name: string | null; email: string; path: string | null; demo?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(avatarUrl(initial));
  const [busy, setBusy] = useState<"" | "upload" | "remove">("");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy("upload"); setMsg(null);
    try {
      const img = await prepareAvatar(file);
      if (demo) {
        const p = `00000000-0000-4000-8000-0000000000aa/avatars/${crypto.randomUUID()}.${img.ext}`;
        const res = await fetch(`/dev/assets/${p}`, { method: "POST", headers: { "content-type": img.contentType }, body: img.blob });
        if (!res.ok) throw new Error("The upload didn't go through.");
        setSrc(`/dev/assets/${p}`);
      } else {
        const ticket = await avatarUploadTicket(img.ext);
        if (!ticket.ok) throw new Error(ticket.error);
        const { error } = await createClient().storage.from("avatars").uploadToSignedUrl(ticket.path, ticket.token, img.blob, { contentType: img.contentType, cacheControl: "31536000", upsert: false });
        if (error) throw new Error("The upload didn't go through. Check your connection and try again.");
        const saved = await saveAvatar(ticket.path);
        if (!saved.ok) throw new Error(saved.error);
        setSrc(avatarUrl(saved.path));
        router.refresh();
      }
      setMsg({ tone: "success", text: "Your picture is saved." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "The upload didn't go through." });
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy("remove"); setMsg(null);
    const r = demo ? { ok: true as const } : await removeAvatar();
    setBusy("");
    if (!r.ok) { setMsg({ tone: "error", text: r.error }); return; }
    setSrc(null);
    setMsg({ tone: "success", text: "Your picture is removed." });
    if (!demo) router.refresh();
  }

  return (
    <div className="avatar-field">
      <Avatar name={name} email={email} src={src} className="avatar avatar-lg" />
      <div className="avatar-field-body">
        <b id="avatar-label">Profile picture</b>
        <p className="muted">A photo of you or your business logo. It&apos;s cropped to a circle and shown on your account menu and to your team.</p>
        <div className="avatar-field-act">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" className="sr-only" id="avatar-input"
            aria-labelledby="avatar-label" onChange={(e) => choose(e.target.files?.[0])} disabled={!!busy} tabIndex={-1} />
          <button type="button" className="btn small" onClick={() => input.current?.click()} disabled={!!busy}>
            {busy === "upload" ? "Uploading…" : src ? "Change picture" : "Upload picture"}
          </button>
          {src && <button type="button" className="btn small ghost" onClick={remove} disabled={!!busy}>{busy === "remove" ? "Removing…" : "Remove"}</button>}
        </div>
        {msg && <div role="status" style={{ marginTop: 8 }}><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      </div>
    </div>
  );
}
