import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts provider tokens (Square) before they're stored. AES-256-GCM with PAYMENT_TOKEN_KEY (32 random bytes,
 * base64), kept only in the server's environment. Format: v1.<iv>.<tag>.<ciphertext>, all base64url.
 */
function key(): Buffer {
  const raw = process.env.PAYMENT_TOKEN_KEY ?? "";
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("PAYMENT_TOKEN_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function sealToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function openToken(sealed: string): string {
  const [v, iv, tag, enc] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("Unreadable token");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

export const tokenKeySet = () => Buffer.from(process.env.PAYMENT_TOKEN_KEY ?? "", "base64").length === 32;
