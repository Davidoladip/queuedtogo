import { describe, expect, it } from "vitest";
import { password, signUpSchema } from "./auth";

describe("password rules", () => {
  it("needs 10 or more characters and at most 72", () => {
    expect(password.safeParse("short1234").success).toBe(false);
    expect(password.safeParse("long enough pass").success).toBe(true);
    expect(password.safeParse("x".repeat(73)).success).toBe(false);
  });
  it("refuses the most common passwords and runs of one character", () => {
    expect(password.safeParse("Password123").success).toBe(false);
    expect(password.safeParse("1234567890").success).toBe(false);
    expect(password.safeParse("aaaaaaaaaaaa").success).toBe(false);
    expect(password.safeParse("ababababab").success).toBe(false);
  });
  it("refuses a password built from the email name", () => {
    const r = signUpSchema.safeParse({ fullName: "Ada", email: "adalovelace@example.com", password: "adalovelace2026" });
    expect(r.success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "Ada", email: "adalovelace@example.com", password: "tea at four, please" }).success).toBe(true);
  });
});
