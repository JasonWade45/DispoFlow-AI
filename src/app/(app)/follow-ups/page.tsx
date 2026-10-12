"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import type { Task } from "@/types";
import { cancelTask, markSent, updateTask } from "@/lib/actions";
import { cx, formatDate, formatTime } from "@/lib/format";
import { buyerById, propertyById, sortTasksByPriority, taskStatus, userById } from "@/lib/selectors";
import { useDb, useSession } from "@/lib/store";
import { useModals } from "@/components/modals/ModalHost";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Tabs,
} from "@/components/ui";

const TABS = ["All", "Overdue", "Due", "Scheduled", "Needs Scheduling", "Completed", "Cancelled"];

const EMPTY_TITLES: Record<string, string> = {
  All: "No follow-ups yet",
  Overdue: "Nothing overdue",
  Due: "Nothing due today",
  Scheduled: "Nothing scheduled",
  "Needs Scheduling": "Everything is scheduled",
  Completed: "No completed follow-ups",
  Cancelled: "No cancelled follow-ups",
};

const SUMMARY = [
  { label: "Overdue", key: "Overdue", tone: "border-rose-200" },
  { label: "Due", key: "Due", tone: "border-amber-200" },
  { label: "Needs Scheduling", key: "Needs Scheduling", tone: "border-purple-200" },
];

function FollowUps() {
  const searchParams = useSearchParams();
  const db = useDb();
  const session = useSession();
  const modals = useModals();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(() =>
    tabParam && TABS.includes(tabParam) ? tabParam : "All",
  );
  const [assignee, setAssignee] = useState("all");
  const [query, setQuery] = useState("");
  const [reschedule, setReschedule] = useState<Task | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  const activeUsers = db.users.filter((u) => u.active);

  const rows = useMemo(
    () => db.tasks.map((task) => ({ task, status: taskStatus(task) })),
    [db.tasks],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = Object.fromEntries(TABS.map((t) => [t, 0]));
    for (const row of rows) {
      if (row.task.status !== "Cancelled") c.All += 1;
      c[row.status] += 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ task, status }) => {
      if (activeTab === "All") {
        if (task.status === "Cancelled") return false;
      } else if (status !== activeTab) {
        return false;
      }
      if (assignee !== "all" && task.assignedUserId !== assignee) return false;
      if (!q) return true;
      const buyer = buyerById(db, task.buyerId);
      const property = propertyById(db, task.propertyId);
      return (
        task.description.toLowerCase().includes(q) ||
        task.taskType.toLowerCase().includes(q) ||
        (buyer?.fullName.toLowerCase().includes(q) ?? false) ||
        (property?.address.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, activeTab, assignee, query, db]);

  const sorted = useMemo(() => {
    if (activeTab === "Completed" || activeTab === "Cancelled") {
      return [...filtered].sort((a, b) =>
        (b.task.completedAt ?? "").localeCompare(a.task.completedAt ?? ""),
      );
    }
    const order = new Map(
      sortTasksByPriority(db, filtered.map((f) => f.task)).map((t, i) => [t.id, i]),
    );
    return [...filtered].sort(
      (a, b) => (order.get(a.task.id) ?? 0) - (order.get(b.task.id) ?? 0),
    );
  }, [filtered, activeTab, db]);

  function openReschedule(task: Task) {
    setReschedule(task);
    setRescheduleDate(task.dueDate ?? "");
    setRescheduleTime(task.dueTime ?? "");
  }

  function saveReschedule() {
    if (!reschedule) return;
    updateTask(reschedule.id, {
      dueDate: rescheduleDate || null,
      dueTime: rescheduleTime || null,
      status: "Scheduled",
    });
    setReschedule(null);
  }

  function handleCancel(id: string) {
    if (!window.confirm("Cancel this follow-up?")) return;
    cancelTask(id, "Cancelled by user");
  }

  const tabLabels = TABS.map((t) => (counts[t] > 0 ? `${t} (${counts[t]})` : t));

  return (
    <div>
      <PageHeader
        title="Follow-Ups"
        subtitle={`${counts.All} open follow-up${counts.All === 1 ? "" : "s"} across the team`}
        actions={<Button onClick={() => modals.createFollowUp()}>New Follow-Up</Button>}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        {SUMMARY.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveTab(s.key)}
            className={cx(
              "rounded-xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
              s.tone,
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {s.label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{counts[s.key]}</p>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <Tabs
          tabs={tabLabels}
          active={tabLabels[TABS.indexOf(activeTab)] ?? tabLabels[0]}
          onChange={(label) => setActiveTab(label.replace(/ \(\d+\)$/, ""))}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="sm:w-56"
            aria-label="Filter by assignee"
          >
            <option value="all">All assignees</option>
            {activeUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Search description, buyer, or property…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <ul className="divide-y divide-slate-100">
          {sorted.length === 0 && (
            <li>
              <EmptyState
                title={EMPTY_TITLES[activeTab] ?? "No follow-ups"}
                body="Try a different tab or clear your filters."
              />
            </li>
          )}
          {sorted.map(({ task, status }) => {
            const buyer = buyerById(db, task.buyerId);
            const property = propertyById(db, task.propertyId);
            const assigneeName = userById(db, task.assignedUserId)?.name ?? "Unassigned";
            const done = task.status === "Completed" || task.status === "Cancelled";
            const isMessage = task.taskType.toLowerCase().includes("message");
            const propertyHref =
              task.propertyId && task.buyerId
                ? `/properties/${task.propertyId}?buyer=${task.buyerId}`
                : task.propertyId
                  ? `/properties/${task.propertyId}`
                  : null;
            return (
              <li
                key={task.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge label={status} />
                    {(task.priority === "High" || task.priority === "Urgent") && (
                      <Badge label={task.priority} />
                    )}
                    <span className="text-xs text-slate-400">{task.taskType}</span>
                    {task.completedVia === "sent" && <Badge label="Sent" />}
                  </div>
                  <p className="mt-1 text-sm text-slate-800">
                    {propertyHref ? (
                      <Link href={propertyHref} className="hover:text-slate-950 hover:underline">
                        {task.description}
                      </Link>
                    ) : (
                      task.description
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                    {buyer ? (
                      <Link
                        href={`/buyers/${buyer.id}`}
                        className="font-medium text-slate-600 hover:text-slate-900"
                      >
                        {buyer.fullName}
                      </Link>
                    ) : (
                      <span>No buyer</span>
                    )}
                    {property && propertyHref && (
                      <Link href={propertyHref} className="hover:text-slate-700">
                        {property.address}
                      </Link>
                    )}
                    {property && !propertyHref && <span>{property.address}</span>}
                    <span>
                      {task.dueDate
                        ? `Due ${formatDate(task.dueDate)}${
                            task.dueTime ? ` · ${formatTime(task.dueTime)}` : ""
                          }`
                        : "No date"}
                    </span>
                    {task.sentAt && <span>Sent {formatDate(task.sentAt.slice(0, 10))}</span>}
                    <span>{assigneeName}</span>
                  </p>
                  {done && task.completionNotes && (
                    <p className="mt-1 text-xs text-slate-400">Note: {task.completionNotes}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      modals.generateFollowUp({
                        buyerId: task.buyerId,
                        propertyId: task.propertyId,
                      })
                    }
                  >
                    Message
                  </Button>
                  {!done && isMessage && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => markSent(task.id, "Message sent", session.userId ?? "u_sarah")}
                      title="Mark as sent — records the send timestamp"
                    >
                      Mark Sent
                    </Button>
                  )}
                  {!done && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => modals.completeTask(task)}
                      >
                        Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openReschedule(task)}
                      >
                        Reschedule
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleCancel(task.id)}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Modal
        open={reschedule !== null}
        onClose={() => setReschedule(null)}
        title="Reschedule follow-up"
        description={reschedule?.description}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReschedule(null)}>
              Close
            </Button>
            <Button onClick={saveReschedule}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Date">
            <Input
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
          </Field>
          <Field label="Time">
            <Input
              type="time"
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

export default function FollowUpsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading follow-ups…" />}>
      <FollowUps />
    </Suspense>
  );
}
