import { describe, expect, it } from "vitest";
import {
  actorName, boardDbError, completeStage, describeEvent, dueState, initials, jobPatchSchema, nextStage,
  noteSchema, reopenStage, sortJobs, stageSchema, todayIn, type BoardEvent, type BoardStage,
} from "./board";

const stages: BoardStage[] = [
  { id: "s2", name: "In production", color: "#3346D3", position: 1, isFinal: false, notify: true },
  { id: "s1", name: "New order", color: "#7B8194", position: 0, isFinal: false, notify: true },
  { id: "s3", name: "Completed", color: "#5A6077", position: 2, isFinal: true, notify: false },
];
const ev = (e: Partial<BoardEvent>): BoardEvent => ({ id: "e", type: "note", actorId: null, fromStageId: null, toStageId: null, body: null, data: {}, at: "2026-10-22T10:00:00Z", ...e });

describe("dates", () => {
  it("uses the business's time zone for today", () => {
    const late = new Date("2026-10-23T02:30:00Z"); // 10:30pm in New York on the 22nd
    expect(todayIn("America/New_York", late)).toBe("2026-10-22");
    expect(todayIn("Africa/Lagos", late)).toBe("2026-10-23");
    expect(todayIn("Not/AZone", late)).toBe("2026-10-23");
  });
  it("flags overdue and due-today jobs, but never finished ones", () => {
    const open = stages[0];
    expect(dueState({ dueDate: "2026-10-21", completedAt: null }, open, "2026-10-22")).toBe("overdue");
    expect(dueState({ dueDate: "2026-10-22", completedAt: null }, open, "2026-10-22")).toBe("today");
    expect(dueState({ dueDate: "2026-10-30", completedAt: null }, open, "2026-10-22")).toBeNull();
    expect(dueState({ dueDate: null, completedAt: null }, open, "2026-10-22")).toBeNull();
    expect(dueState({ dueDate: "2026-10-01", completedAt: null }, stages[2], "2026-10-22")).toBe("done");
  });
});

describe("ordering and stages", () => {
  it("puts urgent work first, then the soonest due, then the oldest order", () => {
    const list = sortJobs([
      { number: 1003, priority: 0, dueDate: null },
      { number: 1002, priority: 0, dueDate: "2026-10-25" },
      { number: 1004, priority: 2, dueDate: "2026-11-30" },
      { number: 1001, priority: 0, dueDate: "2026-10-25" },
    ]);
    expect(list.map((j) => j.number)).toEqual([1004, 1001, 1002, 1003]);
  });
  it("finds the next, complete and reopen stages by position", () => {
    expect(nextStage(stages, "s1")?.id).toBe("s2");
    expect(nextStage(stages, "s3")).toBeNull();
    expect(completeStage(stages)?.id).toBe("s3");
    expect(reopenStage(stages)?.id).toBe("s2");
  });
  it("makes initials from names and emails", () => {
    expect(initials("Grace Hopper")).toBe("GH");
    expect(initials("finn@example.com")).toBe("FI");
    expect(initials("Ada Byron Lovelace")).toBe("AL");
  });
});

describe("history wording", () => {
  const sn = new Map(stages.map((s) => [s.id, s.name]));
  const people = new Map([["u1", "Finn Member"]]);
  it("describes each kind of change in plain words", () => {
    expect(describeEvent(ev({ type: "created", toStageId: "s1" }), sn, people)).toBe("Order received in New order");
    expect(describeEvent(ev({ type: "stage_changed", fromStageId: "s1", toStageId: "gone" }), sn, people)).toBe("Moved from New order to a removed stage");
    expect(describeEvent(ev({ type: "assigned", data: { to: "u1" } }), sn, people)).toBe("Assigned to Finn Member");
    expect(describeEvent(ev({ type: "assigned", data: { to: null } }), sn, people)).toBe("Unassigned");
    expect(describeEvent(ev({ type: "due_changed", data: { to: "2026-10-30" } }), sn, people)).toBe("Due date set to Fri, Oct 30");
    expect(describeEvent(ev({ type: "note", body: "Gold thread" }), sn, people)).toBe("Gold thread");
  });
  it("names who did it, and online orders", () => {
    expect(actorName(ev({ type: "created" }), people)).toBe("Online order");
    expect(actorName(ev({ actorId: "u1" }), people)).toBe("Finn Member");
    expect(actorName(ev({ actorId: "u9" }), people)).toBe("A former team member");
  });
});

describe("input checks", () => {
  it("accepts real changes and refuses bad or unknown ones", () => {
    expect(jobPatchSchema.safeParse({ priority: 2, dueDate: "2026-10-30" }).success).toBe(true);
    expect(jobPatchSchema.safeParse({ dueDate: null, assigneeId: null }).success).toBe(true);
    expect(jobPatchSchema.safeParse({ priority: 9 }).success).toBe(false);
    expect(jobPatchSchema.safeParse({ dueDate: "2026-02-31x" }).success).toBe(false);
    expect(jobPatchSchema.safeParse({ assigneeId: "not-an-id" }).success).toBe(false);
    expect(jobPatchSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(jobPatchSchema.safeParse({ tracking_token: "x" }).success).toBe(false);
    expect(jobPatchSchema.safeParse({}).success).toBe(false);
    const s = jobPatchSchema.safeParse({ summary: "   " });
    expect(s.success && s.data.summary).toBeNull();
  });
  it("checks notes and stages", () => {
    expect(noteSchema.safeParse("  ").success).toBe(false);
    expect(noteSchema.safeParse("x".repeat(2001)).success).toBe(false);
    expect(stageSchema.safeParse({ name: "Embroidering", color: "#3346D3", isFinal: false }).success).toBe(true);
    expect(stageSchema.safeParse({ name: "X", color: "red", isFinal: false }).success).toBe(false);
    expect(stageSchema.safeParse({ name: "x".repeat(61), color: "#000000", isFinal: false }).success).toBe(false);
  });
  it("explains database refusals", () => {
    expect(boardDbError({ code: "QTG05", message: "A business needs at least one stage." }, "x")).toBe("A business needs at least one stage.");
    expect(boardDbError({ code: "23503", message: 'update or delete on table "workflow_stages" violates…' }, "x")).toMatch(/still has jobs/);
    expect(boardDbError({ code: "XX000" }, "fallback")).toBe("fallback");
  });
});
