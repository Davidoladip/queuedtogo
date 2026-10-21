import { z } from "zod";

export const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
export const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use 72 characters or fewer");

export const signInSchema = z.object({ email, password: z.string().min(1, "Enter your password").max(72) });
export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name").max(120),
  email,
  password,
});
export const forgotSchema = z.object({ email });
export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match" });
