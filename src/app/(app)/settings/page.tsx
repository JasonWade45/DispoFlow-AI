"use client";

import { useState } from "react";
import type { DB, Settings } from "@/types";
import { resetDemoData, updateDb, useDb, useSession } from "@/lib/store";
import { Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";

type ExtSettings = Settings & {
  defaultCurrency?: string;
  defaultValidDays?: number;
};

type ListKey =
  | "propertyStatuses"
  | "interestStatuses"
  | "buyerStatuses"
  | "offerStatuses"
  | "taskTypes";

const LIST_META: { key: ListKey; title: string; hint: string }[] = [
  { key: "propertyStatuses", title: "Deal statuses", hint: "Stages a property can move through" },
  { key: "interestStatuses", title: "Pipeline stages", hint: "Buyer interest stages used in the pipeline" },
  { key: "buyerStatuses", title: "Buyer statuses", hint: "Active, inactive, or do-not-contact" },
  { key: "offerStatuses", title: "Offer statuses", hint: "Stages of offer negotiation" },
  { key: "taskTypes", title: "Activity types", hint: "Types of follow-up activities" },
];

function setList(d: DB, key: ListKey, values: string[]): void {
  if (key === "propertyStatuses") d.settings.propertyStatuses = values;
  else if (key === "interestStatuses") d.settings.interestStatuses = values;
  else if (key === "buyerStatuses") d.settings.buyerStatuses = values;
  else if (key === "offerStatuses") d.settings.offerStatuses = values;
  else d.settings.taskTypes = values;
}

function usageCount(db: DB, key: ListKey, value: string): number {
  if (key === "propertyStatuses") return db.properties.filter((p) => p.status === value).length;
  if (key === "interestStatuses") return db.relationships.filter((r) => r.interestStatus === value).length;
  if (key === "buyerStatuses") return db.buyers.filter((b) => b.status === value).length;
  if (key === "offerStatuses") return db.offers.filter((o) => o.status === value).length;
  return db.tasks.filter((t) => t.taskType === value).length;
}

function ListCard({
  title,
  hint,
  values,
  usage,
  canEdit,
  onValues,
  onNotice,
}: {
  title: string;
  hint: string;
  values: string[];
  usage: (value: string) => number;
  canEdit: boolean;
  onValues: (values: string[]) => void;
  onNotice: (message: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function remove(value: string) {
    const used = usage(value);
    if (used > 0) {
      onNotice(
        `"${value}" is used by ${used} record${used === 1 ? "" : "s"} on ${title} and can't be removed.`,
      );
      return;
    }
    if (!window.confirm(`Remove "${value}" from ${title}?`)) return;
    onValues(values.filter((v) => v !== value));
    onNotice("");
  }

  function add() {
    const value = draft.trim();
    if (!value) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      onNotice(`"${value}" already exists on ${title}.`);
      return;
    }
    onValues([...values, value]);
    setDraft("");
    onNotice("");
  }

  return (
    <Card>
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {values.length === 0 && (
          <p className="text-xs text-slate-400">No values yet.</p>
        )}
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-slate-700"
          >
            {value}
            {canEdit && (
              <button
                type="button"
                title={`Remove ${value}`}
                onClick={() => remove(value)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                ✕
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <div className="flex items-center gap-2 px-4 pb-4">
          <Input
            value={draft}
            placeholder="Add a value…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button size="sm" onClick={add} disabled={!draft.trim()}>
            + Add
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const db = useDb();
  const session = useSession();
  const me = db.users.find((u) => u.id === session.userId) ?? null;
  const canEdit = me?.role === "owner";

  const ext = db.settings as ExtSettings;
  const [orgName, setOrgName] = useState(db.organization.name);
  const [prevOrgName, setPrevOrgName] = useState(db.organization.name);
  if (db.organization.name !== prevOrgName) {
    setPrevOrgName(db.organization.name);
    setOrgName(db.organization.name);
  }
  const [currency, setCurrency] = useState(ext.defaultCurrency ?? "USD");
  const [validDays, setValidDays] = useState(String(ext.defaultValidDays ?? 14));
  const [prevSettings, setPrevSettings] = useState(db.settings);
  if (db.settings !== prevSettings) {
    const s = db.settings as ExtSettings;
    setPrevSettings(db.settings);
    setCurrency(s.defaultCurrency ?? "USD");
    setValidDays(String(s.defaultValidDays ?? 14));
  }
  const [notice, setNotice] = useState("");

  function saveWorkspace() {
    const name = orgName.trim();
    if (!name) return;
    updateDb((d) => {
      d.organization.name = name;
      return d;
    });
  }

  function saveProposalDefaults() {
    updateDb((d) => {
      const s = d.settings as ExtSettings;
      s.defaultCurrency = currency.trim() || "USD";
      const parsed = Math.max(1, Math.round(Number(validDays)));
      s.defaultValidDays = Number.isFinite(parsed) ? parsed : 14;
      return d;
    });
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Workspace preferences, status lists, and team"
      />

      {!canEdit && (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          You have read-only access — ask an admin to change settings.
        </p>
      )}

      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Workspace</h2>
              <p className="mt-0.5 text-xs text-slate-400">Shown across the app and on documents</p>
            </div>
            <div className="space-y-3 px-4 py-4">
              <Field label="Account name">
                <Input
                  value={orgName}
                  readOnly={!canEdit}
                  onChange={(e) => setOrgName(e.target.value)}
                  className={canEdit ? undefined : "bg-slate-50 text-slate-500"}
                />
              </Field>
              <div>
                <Button onClick={saveWorkspace} disabled={!canEdit || !orgName.trim()}>
                  Save
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Proposal defaults</h2>
              <p className="mt-0.5 text-xs text-slate-400">Applied when creating new offers</p>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Default currency">
                  <Input
                    value={currency}
                    readOnly={!canEdit}
                    placeholder="USD"
                    onChange={(e) => setCurrency(e.target.value)}
                    className={canEdit ? undefined : "bg-slate-50 text-slate-500"}
                  />
                </Field>
                <Field label="Default valid days">
                  <Input
                    type="number"
                    min={1}
                    value={validDays}
                    readOnly={!canEdit}
                    onChange={(e) => setValidDays(e.target.value)}
                    className={canEdit ? undefined : "bg-slate-50 text-slate-500"}
                  />
                </Field>
              </div>
              <div>
                <Button onClick={saveProposalDefaults} disabled={!canEdit}>
                  Save
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {notice && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            {notice}
          </p>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Status lists</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            {LIST_META.map((meta) => (
              <ListCard
                key={meta.key}
                title={meta.title}
                hint={meta.hint}
                values={db.settings[meta.key]}
                usage={(value) => usageCount(db, meta.key, value)}
                canEdit={canEdit}
                onValues={(next) =>
                  updateDb((d) => {
                    setList(d, meta.key, next);
                    return d;
                  })
                }
                onNotice={setNotice}
              />
            ))}
          </div>
        </div>

        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Team</h2>
            <p className="mt-0.5 text-xs text-slate-400">Everyone with access to this workspace</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{u.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <Badge label={u.role === "owner" ? "Owner" : "Team"} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge label={u.active ? "Active" : "Inactive"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="border-rose-200">
          <div className="border-b border-rose-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-rose-700">Danger zone</h2>
            <p className="mt-0.5 text-xs text-slate-400">Irreversible actions for this workspace</p>
          </div>
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">Reset demo data</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Restore the original demo properties, buyers, offers, and activity.
              </p>
            </div>
            <Button
              variant="danger"
              disabled={!canEdit}
              onClick={() => {
                if (window.confirm("Reset all demo data? Every change you've made will be lost.")) {
                  resetDemoData();
                }
              }}
            >
              Reset demo data
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
