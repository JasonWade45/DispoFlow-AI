"use client";

import { useState } from "react";
import type { Settings, User } from "@/types";
import { updateDb, useDb, useSession } from "@/lib/store";
import { userById } from "@/lib/selectors";
import { formatDate, formatDateTime } from "@/lib/format";
import { autoMergeDuplicates, duplicateOverview } from "@/lib/merge";
import { Badge, Button, Card, EmptyState, PageHeader, Select } from "@/components/ui";

interface PendingInvitation {
  email: string;
  role: string;
  expiresAt: string;
}

type ExtSettings = Settings & {
  pendingInvitations?: PendingInvitation[];
};

export default function AdminPage() {
  const db = useDb();
  const session = useSession();
  const [error, setError] = useState("");
  const [mergeMsg, setMergeMsg] = useState<string | null>(null);

  const me = db.users.find((u) => u.id === session.userId) ?? null;

  if (!me || me.role !== "owner") {
    return (
      <Card>
        <EmptyState
          title="Admins only"
          body="This area is limited to workspace admins. Ask an owner for access."
        />
      </Card>
    );
  }

  function toggleActive(user: User) {
    if (user.id === me?.id) {
      setError("You can't deactivate your own account.");
      return;
    }
    setError("");
    updateDb((d) => {
      d.users = d.users.map((u) => (u.id === user.id ? { ...u, active: !u.active } : u));
      return d;
    });
  }

  function changeRole(user: User, role: string) {
    if (user.id === me?.id) return;
    setError("");
    updateDb((d) => {
      d.users = d.users.map((u) => (u.id === user.id ? { ...u, role: role as User["role"] } : u));
      return d;
    });
  }

  const ext = db.settings as ExtSettings;
  const invitations = ext.pendingInvitations ?? [];

  function revoke(email: string) {
    if (!window.confirm(`Revoke the invitation for ${email}?`)) return;
    updateDb((d) => {
      const s = d.settings as ExtSettings;
      s.pendingInvitations = (s.pendingInvitations ?? []).filter((i) => i.email !== email);
      return d;
    });
  }

  const auditFeed = [...db.interactions]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 50);

  const dupes = duplicateOverview(db);

  function handleMerge() {
    if (
      !window.confirm(
        `Merge ${dupes.propertyGroups} duplicate property group(s) and ${dupes.buyerGroups} duplicate buyer group(s)? Contacts and tasks will be re-linked to the kept records.`,
      )
    ) {
      return;
    }
    const r = autoMergeDuplicates();
    setMergeMsg(
      `Merged ${r.propertiesMerged} propert${r.propertiesMerged === 1 ? "y" : "ies"}, ${r.buyersMerged} buyer${r.buyersMerged === 1 ? "" : "s"}, ${r.relationshipsMerged} duplicate link${r.relationshipsMerged === 1 ? "" : "s"}.`,
    );
  }

  return (
    <div>
      <PageHeader
        title="Admin — users & audit"
        subtitle={`${db.users.length} team member${db.users.length === 1 ? "" : "s"} · ${db.interactions.length} logged events`}
      />

      {error && (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div className="space-y-5">
        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Users</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Toggle access or change roles. You can&apos;t modify your own account.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.users.map((u) => {
                  const isSelf = u.id === me.id;
                  return (
                    <tr key={u.id}>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-800">{u.name}</span>
                        {isSelf && <span className="ml-1.5 text-[11px] text-slate-400">(you)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{u.email}</td>
                      <td className="px-4 py-2.5">
                        <Badge label={u.role === "owner" ? "Owner" : "Team"} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge label={u.active ? "Active" : "Inactive"} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Select
                            value={u.role}
                            disabled={isSelf}
                            aria-label={`Change role for ${u.name}`}
                            onChange={(e) => changeRole(u, e.target.value)}
                            className="w-36"
                          >
                            <option value="owner">Owner / Admin</option>
                            <option value="team">Team member</option>
                          </Select>
                          <Button
                            size="sm"
                            variant={u.active ? "secondary" : "primary"}
                            onClick={() => toggleActive(u)}
                          >
                            {u.active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Data hygiene</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Auto-merge also runs after every ElevateReg and Google Sheets sync.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {dupes.total > 0 ? (
                <span className="text-xs font-medium text-amber-600">
                  {dupes.propertyGroups} duplicate propert{dupes.propertyGroups === 1 ? "y" : "ies"} ·{" "}
                  {dupes.buyerGroups} duplicate buyer{dupes.buyerGroups === 1 ? "" : "s"} found
                </span>
              ) : (
                <span className="text-xs text-emerald-600">No duplicates found</span>
              )}
              <Button variant="secondary" onClick={handleMerge} disabled={dupes.total === 0}>
                Merge Duplicates
              </Button>
            </div>
          </div>
          {mergeMsg && (
            <p className="border-t border-slate-100 px-4 py-3 text-sm text-emerald-700">{mergeMsg}</p>
          )}
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Pending invitations</h2>
              <p className="mt-0.5 text-xs text-slate-400">Invites that haven&apos;t been accepted yet</p>
            </div>
            {invitations.length === 0 ? (
              <EmptyState title="No pending invitations" body="Invitations appear here until they are accepted or revoked." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {invitations.map((invite) => (
                  <li key={invite.email} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{invite.email}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        <Badge label={invite.role === "owner" ? "Owner" : "Team"} />{" "}
                        expires {formatDate(invite.expiresAt)}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => revoke(invite.email)}>
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Audit log</h2>
              <p className="mt-0.5 text-xs text-slate-400">Most recent 50 recorded events</p>
            </div>
            {auditFeed.length === 0 ? (
              <EmptyState title="Nothing logged yet" body="Recorded actions will show up here." />
            ) : (
              <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
                {auditFeed.map((item) => {
                  const actor = userById(db, item.createdBy)?.name ?? "Unknown user";
                  const detail = item.enhancedNotes || item.originalContent;
                  return (
                    <li key={item.id} className="flex gap-3 px-4 py-2.5">
                      <span className="w-36 shrink-0 pt-0.5 text-xs text-slate-400">
                        {formatDateTime(item.occurredAt)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800">{actor}</span>
                          <Badge label={item.eventType} />
                        </div>
                        {detail && (
                          <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
