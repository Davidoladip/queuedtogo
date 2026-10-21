import { z } from "zod";
import { email } from "./auth";

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/, "Use 3 to 48 lowercase letters, numbers or dashes, starting and ending with a letter or number");

export const US_TIMEZONES = [
  ["America/New_York", "Eastern (New York)"],
  ["America/Chicago", "Central (Chicago)"],
  ["America/Denver", "Mountain (Denver)"],
  ["America/Phoenix", "Mountain, no DST (Phoenix)"],
  ["America/Los_Angeles", "Pacific (Los Angeles)"],
  ["America/Anchorage", "Alaska (Anchorage)"],
  ["Pacific/Honolulu", "Hawaii (Honolulu)"],
] as const;

export const createOrgSchema = z.object({
  name: z.string().trim().min(1, "Enter your business name").max(120),
  slug,
});

export const updateOrgSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(1, "Enter your business name").max(120),
  slug,
  timezone: z.enum(US_TIMEZONES.map((t) => t[0]) as [string, ...string[]], { message: "Choose a time zone" }),
});

export const roleSchema = z.enum(["owner", "admin", "member"]);
export const inviteSchema = z.object({
  orgId: z.string().uuid(),
  email,
  role: z.enum(["admin", "member"], { message: "Choose admin or member" }),
});
export const memberSchema = z.object({ orgId: z.string().uuid(), userId: z.string().uuid() });
export const changeRoleSchema = memberSchema.extend({ role: roleSchema });

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}
