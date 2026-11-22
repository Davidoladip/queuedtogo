import { describe, expect, it } from "vitest";
import { ENVELOPE_STYLES, normalizeSettings } from "./engine";

const env = (e: unknown) => normalizeSettings({ mode: "rsvp", cover: { envelope: e } }).cover.envelope;

describe("envelope design options", () => {
  it("older saved envelopes keep their look (new options default to the original design)", () => {
    expect(env({ on: true, color: "#F1E8D4" })).toMatchObject({ flap: "pointed", paper: "smooth", linerPattern: "diagonal", sealShape: "round", size: "medium", glow: false, sealColor: "", ink: "" });
  });
  it("rejects values that aren't options, and colours that aren't colours", () => {
    expect(env({ flap: "zigzag", paper: "url(x)", linerPattern: "<b>", sealShape: "star", size: "huge", glow: "yes", sealColor: "red; x", ink: "javascript:" }))
      .toMatchObject({ flap: "pointed", paper: "smooth", linerPattern: "diagonal", sealShape: "round", size: "medium", glow: false, sealColor: "", ink: "" });
  });
  it("every ready-made style survives saving unchanged", () => {
    for (const st of ENVELOPE_STYLES) expect(env({ on: true, ...st.set }), st.name).toMatchObject(st.set);
  });
});
