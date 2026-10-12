import { beforeEach, describe, expect, it } from "vitest";
import { createSeed } from "@/lib/seed-work";
import { getDb, updateDb } from "@/lib/store";
import { completeTask, createTask, markSent } from "@/lib/actions";
import { taskStatus } from "@/lib/selectors";

function reset() {
  localStorage.clear();
  updateDb(() => createSeed());
}

describe("createTask", () => {
  beforeEach(reset);

  it("creates a scheduled task with completedVia/sentAt null", () => {
    const id = createTask({
      buyerId: null,
      propertyId: null,
      taskType: "Follow-Up Call",
      description: "Call John",
      dueDate: "2026-10-15",
      dueTime: "10:00",
      assignedUserId: "u_sarah",
      priority: "High",
    });
    const t = getDb().tasks.find((x) => x.id === id);
    expect(t).toBeDefined();
    expect(t?.status).toBe("Scheduled");
    expect(t?.completedVia).toBeNull();
    expect(t?.sentAt).toBeNull();
  });
});

describe("markSent vs completeTask", () => {
  beforeEach(reset);

  it("markSent sets completedVia=sent and records sentAt", () => {
    const id = createTask({
      buyerId: "b_1",
      propertyId: "p_1",
      taskType: "Follow-Up Message",
      description: "Text about pricing",
      dueDate: null,
      dueTime: null,
      assignedUserId: "u_sarah",
      priority: "Medium",
    });
    markSent(id, "Sent the SMS", "u_sarah");
    const t = getDb().tasks.find((x) => x.id === id);
    expect(t?.status).toBe("Completed");
    expect(t?.completedVia).toBe("sent");
    expect(t?.sentAt).toBeTruthy();
  });

  it("markSent updates relationship lastMessageSentAt + lastContactedAt", () => {
    const rel = getDb().relationships.find((r) => r.buyerId === "b1" && r.propertyId === "p1");
    expect(rel).toBeDefined();
    const id = createTask({
      buyerId: "b1",
      propertyId: "p1",
      taskType: "Follow-Up Message",
      description: "Text about pricing",
      dueDate: null,
      dueTime: null,
      assignedUserId: "u_sarah",
      priority: "Medium",
    });
    markSent(id, "sent", "u_sarah");
    const updated = getDb().relationships.find(
      (r) => r.buyerId === "b1" && r.propertyId === "p1",
    );
    expect(updated?.lastMessageSentAt).toBeTruthy();
    expect(updated?.lastContactedAt).toBeTruthy();
  });

  it("completeTask on a call task sets completedVia=complete and updates lastCallAt", () => {
    const id = createTask({
      buyerId: "b1",
      propertyId: "p1",
      taskType: "Follow-Up Call",
      description: "Call about offer",
      dueDate: null,
      dueTime: null,
      assignedUserId: "u_sarah",
      priority: "Medium",
    });
    completeTask(id, "Spoke with buyer", "u_sarah");
    const t = getDb().tasks.find((x) => x.id === id);
    expect(t?.status).toBe("Completed");
    expect(t?.completedVia).toBe("complete");
    const updated = getDb().relationships.find(
      (r) => r.buyerId === "b1" && r.propertyId === "p1",
    );
    expect(updated?.lastCallAt).toBeTruthy();
  });

  it("completeTask is idempotent — second call is a no-op", () => {
    const id = createTask({
      buyerId: null,
      propertyId: null,
      taskType: "Follow-Up Call",
      description: "Call",
      dueDate: null,
      dueTime: null,
      assignedUserId: "u_sarah",
      priority: "Low",
    });
    completeTask(id, "done", "u_sarah");
    const first = getDb().tasks.find((x) => x.id === id);
    completeTask(id, "done again", "u_sarah");
    const second = getDb().tasks.find((x) => x.id === id);
    expect(second?.completionNotes).toBe(first?.completionNotes);
    expect(second?.completedAt).toBe(first?.completedAt);
  });
});

describe("taskStatus", () => {
  it("returns Needs Scheduling when no dueDate", () => {
    const t = {
      id: "t1",
      orgId: "o",
      buyerId: null,
      propertyId: null,
      relatedInteractionId: null,
      taskType: "Call",
      description: "x",
      dueDate: null,
      dueTime: null,
      assignedUserId: "u",
      priority: "Low" as const,
      status: "Scheduled" as const,
      completionNotes: "",
      createdAt: "",
      completedAt: null,
      completedVia: null,
      sentAt: null,
    };
    expect(taskStatus(t)).toBe("Needs Scheduling");
  });

  it("returns Completed for completed tasks regardless of due date", () => {
    const t = {
      id: "t2",
      orgId: "o",
      buyerId: null,
      propertyId: null,
      relatedInteractionId: null,
      taskType: "Call",
      description: "x",
      dueDate: "2020-01-01",
      dueTime: null,
      assignedUserId: "u",
      priority: "Low" as const,
      status: "Completed" as const,
      completionNotes: "",
      createdAt: "",
      completedAt: "2026-01-01T00:00:00.000Z",
      completedVia: "complete" as const,
      sentAt: null,
    };
    expect(taskStatus(t)).toBe("Completed");
  });

  it("returns Overdue for past-due open tasks", () => {
    const now = new Date("2026-10-12T12:00:00");
    const t = {
      id: "t3",
      orgId: "o",
      buyerId: null,
      propertyId: null,
      relatedInteractionId: null,
      taskType: "Call",
      description: "x",
      dueDate: "2026-10-11",
      dueTime: "10:00",
      assignedUserId: "u",
      priority: "Low" as const,
      status: "Scheduled" as const,
      completionNotes: "",
      createdAt: "",
      completedAt: null,
      completedVia: null,
      sentAt: null,
    };
    expect(taskStatus(t, now)).toBe("Overdue");
  });
});
