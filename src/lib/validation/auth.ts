import { z } from "zod";

export const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
/** The most-used passwords (and their obvious variants), refused outright. Length matters more than symbols. */
const COMMON = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssword", "p@ssw0rd",
  "123456789", "1234567890", "12345678", "0987654321", "1q2w3e4r5t", "qwertyuiop", "qwerty123", "qwerty1234",
  "iloveyou1", "letmein123", "welcome123", "welcome1", "admin1234", "administrator", "football1", "baseball1",
  "sunshine1", "princess1", "dragon123", "monkey123", "abc1234567", "abcdefghij", "1111111111", "0000000000",
  "aaaaaaaaaa", "trustno1", "changeme", "changeme123", "queuedtogo", "queuedtogo1", "threadtogo", "threadtogo1",
]);
export const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72, "Use 72 characters or fewer")
  .refine((v) => !COMMON.has(v.toLowerCase()), "That password is too common. Choose something harder to guess.")
  .refine((v) => new Set(v).size >= 4, "Use a mix of characters, not one or two repeated.");

export const signInSchema = z.object({ email, password: z.string().min(1, "Enter your password").max(72) });
export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name").max(120),
  email,
  password,
}).refine((v) => !v.password.toLowerCase().includes(v.email.split("@")[0]) || v.email.split("@")[0].length < 4, { path: ["password"], message: "Don't use your email address in your password." });
export const forgotSchema = z.object({ email });
export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match" });
