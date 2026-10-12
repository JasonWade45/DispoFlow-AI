"use client";

import { useState } from "react";
import type { Priority, Task } from "@/types";
import { useDb, useSession } from "@/lib/store";
import { buyerById, propertyById, taskStatus } from "@/lib/selectors";
import { completeTask, createTask } from "@/lib/actions";
import { addDaysIso } from "@/lib/format";
import { Badge, Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";

export function CreateFollowUpModal({
  open,
  onClose,
  defaultBuyerId,
  defaultPropertyId,
  defaultDescription,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultBuyerId?: string | null;
  defaultPropertyId?: string | null;
  defaultDescription?: string;
  onCreated?: (id: string) => void;
}) {
  const db = useDb();
  const session = useSession();
  const [buyerId, setBuyerId] = useState(defaultBuyerId ?? "");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [taskType, setTaskType] = useState("Follow-Up Call");
  const [description, setDescription] = useState(defaultDescription ?? "");
  const [dueDate, setDueDate] = useState(addDaysIso(1));
  const [dueTime, setDueTime] = useState("10:00");
  const [assignedUserId, setAssignedUserId] = useState(session.userId ?? "u_sarah");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [error, setError] = useState("");

  function submit() {
    if (!description.trim()) {
      setError("Describe the next step so it's actionable.");
      return;
    }
    const id = createTask({
      buyerId: buyerId || null,
      propertyId: propertyId || null,
      taskType,
      description: description.trim(),
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      assignedUserId,
      priority,
    });
    onCreated?.(id);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Follow-Up"
      description="A follow-up without a date stays in Needs Scheduling until you pick one."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Create Follow-Up</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Buyer">
            <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
              <option value="">— None —</option>
              {db.buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Property">
            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">— None —</option>
              {db.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}, {p.city}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Task Type">
          <Select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
            {db.settings.taskTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description *">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Call John to confirm the partner decision…"
            className="min-h-20"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Due Date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Due Time">
            <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {["Low", "Medium", "High", "Urgent"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Assigned To">
          <Select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}>
            {db.users
              .filter((u) => u.active)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </Select>
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}

export function CompleteTaskModal({
  open,
  onClose,
  task,
}: {
  open: boolean;
  onClose: () => void;
  task: Task | null;
}) {
  const db = useDb();
  const session = useSession();
  const [notes, setNotes] = useState("");
  const [createNext, setCreateNext] = useState(true);
  const [completionMode, setCompletionMode] = useState<"complete" | "sent">("complete");
  const [nextDate, setNextDate] = useState(addDaysIso(2));
  const [nextTime, setNextTime] = useState("10:00");
  const [nextDesc, setNextDesc] = useState(() =>
    task?.description
      ? `Follow up again: ${task.description.replace(/^Follow up/i, "").trim()}`
      : "",
  );
  const [error, setError] = useState("");

  if (!task) return null;
  const buyer = buyerById(db, task.buyerId);
  const property = propertyById(db, task.propertyId);
  const isMessageTask = task.taskType.toLowerCase().includes("message");

  function submit() {
    if (!task) return;
    completeTask(task.id, notes.trim(), session.userId ?? "u_sarah", completionMode);
    if (createNext && nextDesc.trim()) {
      createTask({
        buyerId: task.buyerId,
        propertyId: task.propertyId,
        taskType: task.taskType,
        description: nextDesc.trim(),
        dueDate: nextDate || null,
        dueTime: nextTime || null,
        assignedUserId: task.assignedUserId,
        priority: task.priority,
      });
    } else if (!createNext && nextDesc.trim()) {
      setError("Uncheck 'Create the next follow-up' or fill in the details.");
      return;
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Complete Follow-Up"
      description="Record what happened and define the next step."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>
            {completionMode === "sent" ? "Mark Sent" : "Complete"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge label={taskStatus(task)} />
            <Badge label={task.taskType} />
            {buyer && <span className="text-xs text-slate-500">{buyer.fullName}</span>}
            {property && <span className="text-xs text-slate-500">· {property.address}</span>}
          </div>
          <p className="mt-2 text-slate-700">{task.description}</p>
        </div>

        <Field label={completionMode === "sent" ? "What was sent?" : "Result / Completion Notes"}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              completionMode === "sent"
                ? "Paste the message content or note what was sent…"
                : "What did the buyer say? What was the outcome?"
            }
            className="min-h-24"
          />
        </Field>

        {isMessageTask && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">How was this handled?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCompletionMode("sent")}
                className={
                  completionMode === "sent"
                    ? "rounded-lg border border-slate-800 bg-slate-800 px-3 py-1.5 text-xs font-medium text-white"
                    : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
                }
              >
                Message sent
              </button>
              <button
                type="button"
                onClick={() => setCompletionMode("complete")}
                className={
                  completionMode === "complete"
                    ? "rounded-lg border border-slate-800 bg-slate-800 px-3 py-1.5 text-xs font-medium text-white"
                    : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
                }
              >
                Completed another way
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              &quot;Message sent&quot; records the send timestamp on the buyer relationship.
            </p>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={createNext}
            onChange={(e) => setCreateNext(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Create the next follow-up
        </label>

        {createNext && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <Field label="Next step">
              <Textarea
                value={nextDesc}
                onChange={(e) => setNextDesc(e.target.value)}
                className="min-h-16"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
              </Field>
              <Field label="Time">
                <Input type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}
