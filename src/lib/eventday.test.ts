import { describe, expect, it } from "vitest";
import { csvCell, itemsLine, ordersCsv, searchPickup, tallyItems, toCsv, type DayJob } from "./eventday";

const job = (n: number, answers: DayJob["answers"], extra: Partial<DayJob> = {}): DayJob => ({
  id: "j" + n, number: n, title: "t", summary: null, stageId: "s1", dueDate: null, priority: 0, customerName: "Lena Ortiz", phone: "+15551234567",
  email: null, consent: true, formId: "f", formTitle: "Food Fest", assignee: null, createdAt: "2026-10-24T15:00:00Z", completedAt: null, answers, ...extra,
});

describe("item counts", () => {
  it("adds up choices, multi-choice, sizes and option colours per question", () => {
    const t = tallyItems([
      job(1001, { item: { label: "Item", type: "choice", value: "Hoodie", optionColours: { Hoodie: "Red (#C62828)" } }, sizes: { label: "Sizes", type: "sizes", value: { M: 2, L: 1 } } }),
      job(1002, { item: { label: "Item", type: "choice", value: "Hoodie", optionColours: { Hoodie: "Red (#C62828)" } }, sizes: { label: "Sizes", type: "sizes", value: { M: 1 } } }),
      job(1003, { item: { label: "Item", type: "choice", value: "Cap" }, extras: { label: "Extras", type: "multi", value: ["Gift wrap", "Rush"] }, name: { label: "Name", type: "short", value: "x" } }),
    ]);
    expect(t.find((x) => x.question === "Item")).toEqual({ question: "Item", total: 3, items: [{ item: "Hoodie · Red", count: 2 }, { item: "Cap", count: 1 }] });
    expect(t.find((x) => x.question === "Sizes")?.items).toEqual([{ item: "M", count: 3 }, { item: "L", count: 1 }]);
    expect(t.find((x) => x.question === "Extras")?.total).toBe(2);
    expect(t.some((x) => x.question === "Name")).toBe(false);
  });
});

describe("CSV export", () => {
  it("quotes cells and stops spreadsheet formulas", () => {
    expect(csvCell('Say "hi", ok')).toBe('"Say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a"], [["b"]])).toBe("﻿a\r\nb\r\n");
  });
  it("has one column per question and the order details", () => {
    const csv = ordersCsv([
      job(1001, { item: { label: "Item", type: "choice", value: "Hoodie" } }, { email: "lena@example.com" }),
      job(1002, { note: { label: "Notes", type: "long", value: "Line 1\nLine 2" } }, { customerName: "=cmd" }),
    ], () => "New order", "America/New_York");
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe("Order,Placed,Form,Stage,Customer,Mobile,Email,Agreed to updates,Due,Priority,Assigned to,Summary,Item,Notes");
    expect(lines[1]).toContain("QTG-1001");
    expect(lines[1]).toContain("(555) 123-4567");
    expect(lines[1]).toContain("Hoodie");
    expect(csv).toContain('"Line 1\nLine 2"');
    expect(csv).toContain("'=cmd");
  });
});

describe("pickup search", () => {
  const jobs = [job(1001, {}), job(1042, {}, { customerName: "Sam Lee", phone: "+15559998888" }), job(1100, {}, { customerName: "Ada Byron", phone: null })];
  it("finds by order number, name or last 4 digits", () => {
    expect(searchPickup(jobs, "QTG-1042").map((j) => j.number)).toEqual([1042]);
    expect(searchPickup(jobs, "1042").map((j) => j.number)).toEqual([1042]);
    expect(searchPickup(jobs, "sam").map((j) => j.number)).toEqual([1042]);
    expect(searchPickup(jobs, "8888").map((j) => j.number)).toEqual([1042]);
    expect(searchPickup(jobs, "110").map((j) => j.number)).toEqual([1100]);
    expect(searchPickup(jobs, "")).toEqual([]);
    expect(searchPickup(jobs, "zz")).toEqual([]);
  });
  it("makes a short items line for labels", () => {
    expect(itemsLine({ answers: { i: { label: "Item", type: "choice", value: "Hoodie" }, s: { label: "Sizes", type: "sizes", value: { M: 2 } } }, summary: null })).toBe("Hoodie · M × 2");
    expect(itemsLine({ answers: {}, summary: "x".repeat(200) }, 20)).toHaveLength(20);
  });
});
