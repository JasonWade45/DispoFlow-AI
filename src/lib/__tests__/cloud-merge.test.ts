import { describe, expect, it } from "vitest";
import { mergeCloudConflict } from "@/lib/cloud-merge";
import { createSeed } from "@/lib/seed-work";
import type { DB, Property, Task, User } from "@/types";

function db(partial: Partial<DB> = {}): DB {
  return { ...createSeed(), ...partial };
}

function prop(id: string, updatedAt: string, address: string): Property {
  return { id, address, updatedAt, createdAt: "2026-01-01T00:00:00.000Z" } as Property;
}

function task(id: string, createdAt: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    createdAt,
    completedAt: null,
    sentAt: null,
    taskType: "Call",
    status: "Needs Scheduling",
    ...patch,
  } as Task;
}

describe("mergeCloudConflict", () => {
  it("keeps the local copy when it is strictly newer than the remote", () => {
    const local = db({ properties: [prop("p1", "2026-10-20T10:00:00.000Z", "local edit")] });
    const remote = db({ properties: [prop("p1", "2026-10-20T09:00:00.000Z", "remote edit")] });
    const merged = mergeCloudConflict(local, remote);
    expect(merged.properties).toHaveLength(1);
    expect(merged.properties[0].address).toBe("local edit");
  });

  it("keeps the remote copy when it is strictly newer than the local", () => {
    const local = db({ properties: [prop("p1", "2026-10-20T09:00:00.000Z", "local edit")] });
    const remote = db({ properties: [prop("p1", "2026-10-20T10:00:00.000Z", "remote edit")] });
    const merged = mergeCloudConflict(local, remote);
    expect(merged.properties[0].address).toBe("remote edit");
  });

  it("keeps the remote copy on a timestamp tie", () => {
    const local = db({ properties: [prop("p1", "2026-10-20T10:00:00.000Z", "local edit")] });
    const remote = db({ properties: [prop("p1", "2026-10-20T10:00:00.000Z", "remote edit")] });
    const merged = mergeCloudConflict(local, remote);
    expect(merged.properties[0].address).toBe("remote edit");
  });

  it("preserves entities that exist on only one side", () => {
    const local = db({ properties: [prop("local-only", "2026-10-20T10:00:00.000Z", "L")] });
    const remote = db({ properties: [prop("remote-only", "2026-10-20T10:00:00.000Z", "R")] });
    const merged = mergeCloudConflict(local, remote);
    expect(merged.properties.map((p) => p.id).sort()).toEqual(["local-only", "remote-only"]);
  });

  it("merges tasks without updatedAt via their completedAt/createdAt stamps", () => {
    const local = db({
      tasks: [task("t1", "2026-10-01T00:00:00.000Z", { completedAt: "2026-10-20T12:00:00.000Z", status: "Completed" })],
    });
    const remote = db({
      tasks: [task("t1", "2026-10-01T00:00:00.000Z", { status: "Needs Scheduling" })],
    });
    const merged = mergeCloudConflict(local, remote);
    expect(merged.tasks).toHaveLength(1);
    expect(merged.tasks[0].status).toBe("Completed");
  });

  it("takes non-core fields (settings, org) from the remote copy whole", () => {
    const local = db();
    const remote = db();
    local.settings.followUpOverdueDays = 7;
    remote.settings.followUpOverdueDays = 3;
    const merged = mergeCloudConflict(local, remote);
    expect(merged.settings.followUpOverdueDays).toBe(3);
  });

  it("merges users by id with remote winning ties (no timestamps)", () => {
    const local = db({ users: [{ id: "u1", name: "local name" }, { id: "u-local", name: "L" }] as User[] });
    const remote = db({ users: [{ id: "u1", name: "remote name" }, { id: "u-remote", name: "R" }] as User[] });
    const merged = mergeCloudConflict(local, remote);
    expect(merged.users).toHaveLength(3);
    expect(merged.users.find((u) => u.id === "u1")?.name).toBe("remote name");
    expect(merged.users.map((u) => u.id).sort()).toEqual(["u-local", "u-remote", "u1"]);
  });
});
