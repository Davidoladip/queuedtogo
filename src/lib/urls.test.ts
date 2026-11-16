import { describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { safeNext } from "@/lib/urls";

describe("safeNext (where to go after signing in)", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/w/acme")).toBe("/w/acme");
    expect(safeNext("/w/acme/billing?checkout=1#plans")).toBe("/w/acme/billing?checkout=1#plans");
    expect(safeNext("/invite?token=abc")).toBe("/invite?token=abc");
  });
  it("refuses other sites, including the tricks browsers fall for", () => {
    for (const bad of [
      "//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/ /evil.com".replace(" ", "\u0000"),
      "https://evil.com", "evil.com", "javascript:alert(1)", "/\\/evil.com", "\\\\evil.com", "", null, undefined, 42, "/" + "a".repeat(3000),
    ]) {
      expect(safeNext(bad, "/home"), JSON.stringify(bad)).toBe("/home");
    }
  });
  it("never returns something that a browser would read as another site", () => {
    for (const s of ["/%2F%2Fevil.com", "/.//evil.com", "/..//evil.com", "/%09/evil.com"]) {
      const out = safeNext(s);
      expect(new URL(out, "https://queuedtogo.com").origin, s).toBe("https://queuedtogo.com");
    }
  });
});
