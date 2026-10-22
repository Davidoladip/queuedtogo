import { describe, expect, it } from "vitest";
import { blankField, normalizeDesign, normalizeSettings, type FormModel } from "./design/engine";
import { SWATCH_DEFAULT, emptyMeta } from "./design/media";
import { checkSubmission, formatAnswer, sniffMatches, toE164 } from "./submission";

function form(): FormModel {
  const name = { ...blankField("short"), id: "name", label: "Your name", required: true };
  const phone = { ...blankField("phone"), id: "phone", required: true };
  const email = { ...blankField("email"), id: "email" };
  const item = { ...blankField("choice"), id: "item", label: "Item", options: ["T-shirt", "Hoodie"], required: true };
  item.config.optMeta = [emptyMeta(), { ...emptyMeta(), swatches: { ...structuredClone(SWATCH_DEFAULT), required: true } }];
  const extras = { ...blankField("multi"), id: "extras", label: "Extras", options: ["Gift wrap", "Rush"] };
  const sizes = { ...blankField("sizes"), id: "sizes", label: "Sizes", options: ["S", "M", "L"] };
  const event = { ...blankField("short"), id: "event", label: "Event", config: { locked: true, value: "Food Fest" } };
  const qty = { ...blankField("number"), id: "qty", label: "Quantity" };
  const file = { ...blankField("upload"), id: "file", label: "Logo" };
  return {
    id: "f", title: "Food Fest", slug: "food-fest", eventDate: null, venue: "", intro: "", thanks: "", submitLabel: "Go",
    settings: normalizeSettings({}), design: normalizeDesign({}),
    fields: [name, phone, email, item, extras, sizes, event, qty, file, blankField("submit")],
  };
}
function fd(entries: [string, string | File][]) {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}
const good = (): [string, string | File][] => [
  ["name", " Lena Ortiz "], ["phone", "(555) 123-4567"], ["email", "Lena@Example.com"], ["item", "Hoodie"], ["item__o1__color", "Red (#C62828)"],
  ["extras", "Rush"], ["sizes", "2"], ["sizes", ""], ["sizes", "1"], ["event", "Hacked"], ["qty", "3"], ["__consent", "on"],
];

describe("phone numbers", () => {
  it("normalises US numbers to E.164 and rejects junk", () => {
    expect(toE164("(555) 123-4567")).toBe("+15551234567");
    expect(toE164("1 555 123 4567")).toBe("+15551234567");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("12")).toBeNull();
    expect(toE164("call me")).toBeNull();
  });
});

describe("checking a submission", () => {
  it("accepts good answers and builds the customer, title and summary", () => {
    const r = checkSubmission(form(), fd(good()));
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.customer).toEqual({ name: "Lena Ortiz", email: "lena@example.com", phone: "+15551234567", channel: "sms" });
    expect(r.answers.item.optionColours).toEqual({ Hoodie: "Red (#C62828)" });
    expect(r.answers.sizes.value).toEqual({ S: 2, L: 1 });
    expect(r.answers.event.value).toBe("Food Fest");
    expect(r.consent).toBe(true);
    expect(r.title).toBe("Food Fest · Lena Ortiz");
    expect(r.summary).toBe("Item: Hoodie · Red (#C62828) · Extras: Rush · Sizes: S × 2, L × 1");
  });
  it("uses the locked answer from the form, not from the browser", () => {
    const r = checkSubmission(form(), fd(good()));
    expect(r.ok && r.answers.event.value).toBe("Food Fest");
  });
  it("requires answers and the option's colour", () => {
    const r = checkSubmission(form(), fd([["item", "Hoodie"]]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toBe("This is required.");
      expect(r.errors.phone).toBe("This is required.");
      expect(r.errors.item).toBe("Choose a colour for Hoodie.");
    }
  });
  it("rejects options, colours and values that aren't on the form", () => {
    const bad = good().map(([k, v]): [string, string | File] =>
      k === "item" ? [k, "Free car"] : k === "extras" ? [k, "<script>"] : k === "qty" ? [k, "lots"] : k === "email" ? [k, "nope"] : [k, v]);
    const r = checkSubmission(form(), fd(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "extras", "item", "qty"]);
    const c = checkSubmission(form(), fd(good().map(([k, v]): [string, string | File] => (k === "item__o1__color" ? [k, "Gold (#FFD700)"] : [k, v]))));
    expect(!c.ok && c.errors.item).toBe("Choose one of the colours shown.");
  });
  it("rejects too-long answers and bad sizes", () => {
    const r = checkSubmission(form(), fd([...good().filter(([k]) => k !== "name" && k !== "sizes"), ["name", "x".repeat(501)], ["sizes", "-1"]]));
    expect(!r.ok && r.errors.name).toBe("Keep this under 500 characters.");
    expect(!r.ok && r.errors.sizes).toBe("Enter whole numbers for each size.");
  });
  it("ignores fields that aren't on the form and turns away the bot trap", () => {
    const r = checkSubmission(form(), fd([...good(), ["is_admin", "true"], ["price", "0"]]));
    expect(r.ok && Object.keys(r.answers)).not.toContain("is_admin");
    expect(checkSubmission(form(), fd([...good(), ["__hp", "buy now"]])).ok).toBe(false);
  });
  it("checks uploaded files", () => {
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2])], "logo.pdf", { type: "application/pdf" });
    const ok = checkSubmission(form(), fd([...good(), ["file", pdf]]));
    expect(ok.ok && ok.uploads.length).toBe(1);
    const exe = new File([new Uint8Array([0x4d, 0x5a])], "virus.exe", { type: "application/x-msdownload" });
    const bad = checkSubmission(form(), fd([...good(), ["file", exe]]));
    expect(!bad.ok && bad.errors.file).toBe("Upload a PNG, JPG, WebP or PDF file.");
  });
  it("only asks for consent when the form does", () => {
    const f = form();
    f.settings.notify.consent = false;
    const r = checkSubmission(f, fd(good()));
    expect(r.ok && r.consent).toBe(false);
  });
});

describe("files and display", () => {
  it("checks file contents match the declared type", () => {
    expect(sniffMatches("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
    expect(sniffMatches("image/png", new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBe(false);
    expect(sniffMatches("application/pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(true);
  });
  it("formats answers for people", () => {
    expect(formatAnswer({ label: "Sizes", type: "sizes", value: { S: 2 } })).toBe("S × 2");
    expect(formatAnswer({ label: "Logo", type: "upload", value: { file: "a.png", size: 1, type: "image/png" } })).toBe("File: a.png");
    expect(formatAnswer({ label: "Name", type: "short", value: "Lena", colour: "Black (#111111)" })).toBe("Lena · colour Black (#111111)");
  });
});
