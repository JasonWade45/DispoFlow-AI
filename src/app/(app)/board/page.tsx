"use client";

import Link from "next/link";
import { useState } from "react";
import type { Property } from "@/types";
import { useDb } from "@/lib/store";
import { changePropertyStatus } from "@/lib/actions";
import { formatMoney } from "@/lib/format";
import { useSession } from "@/lib/store";
import { useModals } from "@/components/modals/ModalHost";
import { Button, PageHeader } from "@/components/ui";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "Sold"
      ? "bg-slate-400"
      : status === "Under Contract" || status === "Pending"
        ? "bg-amber-500"
        : status === "Marketing"
          ? "bg-blue-500"
          : status === "Cancelled"
            ? "bg-rose-400"
            : status === "Offer Received"
              ? "bg-violet-500"
              : "bg-emerald-500";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function KanbanCard({ p, onDragStart }: { p: Property; onDragStart: (e: React.DragEvent, id: string) => void }) {
  const thumb = p.photos?.[0] ?? p.photosUrl;
  const margin = p.askingPrice != null && p.arv != null ? p.arv - p.askingPrice : null;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, p.id)}
      className="cursor-grab active:cursor-grabbing"
    >
      <Link
        href={`/properties/${p.id}`}
        className="block overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
      >
        <div className="relative aspect-[3/2] overflow-hidden bg-slate-100">
          {thumb ? (
            <img src={thumb} alt={p.address} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
              No photo
            </div>
          )}
          <div className="absolute left-0 top-0 rounded-br-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
            {p.askingPrice != null ? formatMoney(p.askingPrice) : "No price"}
          </div>
          {margin != null && margin > 0 && (
            <div className="absolute right-0 top-0 rounded-bl-lg bg-emerald-600/90 px-1.5 py-1 text-[10px] font-semibold text-white">
              +{formatMoney(margin)}
            </div>
          )}
        </div>
        <div className="px-2.5 py-2">
          <p className="truncate text-xs font-medium text-slate-900">{p.address}</p>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {p.city}
            {p.state ? `, ${p.state}` : ""} {p.zip}
          </p>
          {(p.bedrooms || p.bathrooms || p.sqft) && (
            <p className="mt-1 text-[10px] text-slate-400">
              {[p.bedrooms && `${p.bedrooms}bd`, p.bathrooms && `${p.bathrooms}ba`, p.sqft && `${p.sqft}sf`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}

export default function BoardPage() {
  const db = useDb();
  const session = useSession();
  const modals = useModals();
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const statuses = db.settings.propertyStatuses;

  const byStatus = new Map<string, Property[]>();
  for (const s of statuses) byStatus.set(s, []);
  for (const p of db.properties) {
    const list = byStatus.get(p.status) ?? byStatus.get("Available")!;
    list.push(p);
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, status: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(status);
  }

  function handleDragLeave() {
    setDragOverCol(null);
  }

  function handleDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id || !session.userId) return;
    const prop = db.properties.find((p) => p.id === id);
    if (!prop || prop.status === status) return;
    changePropertyStatus(id, status, session.userId);
  }

  const totalValue = db.properties.reduce((s, p) => s + (p.askingPrice ?? 0), 0);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Pipeline Board"
        subtitle={`${db.properties.length} properties · ${formatMoney(totalValue)} total · drag cards to change status`}
        actions={
          <Button onClick={() => modals.addProperty()}>Add Property</Button>
        }
      />

      {db.properties.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-slate-500">No properties yet.</p>
            <p className="mt-1 text-xs text-slate-400">
              Sync ElevateReg or add properties to see them on the board.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
          {statuses.map((status) => {
            const items = byStatus.get(status) ?? [];
            const isOver = dragOverCol === status;
            return (
              <div
                key={status}
                className={`flex w-64 shrink-0 flex-col rounded-xl border transition-colors ${
                  isOver ? "border-blue-400 bg-blue-50/50" : "border-slate-200 bg-slate-50"
                }`}
                onDragOver={(e) => handleDragOver(e, status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, status)}
              >
                <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
                  <StatusDot status={status} />
                  <span className="flex-1 text-xs font-semibold text-slate-700">{status}</span>
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    {items.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ minHeight: 80 }}>
                  {items.map((p) => (
                    <KanbanCard key={p.id} p={p} onDragStart={handleDragStart} />
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] text-slate-400">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
