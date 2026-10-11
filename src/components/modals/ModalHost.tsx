"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Task } from "@/types";
import LogInteractionModal from "@/components/modals/LogInteractionModal";
import GenerateFollowUpModal from "@/components/modals/GenerateFollowUpModal";
import { AddBuyerModal, AddOfferModal, AddPropertyModal, LinkBuyerModal } from "@/components/modals/EntityModals";
import { CompleteTaskModal, CreateFollowUpModal } from "@/components/modals/TaskModals";

export interface ModalPayload {
  buyerId?: string | null;
  propertyId?: string | null;
  relationshipId?: string | null;
  description?: string;
}

interface ModalApi {
  logInteraction: (p?: ModalPayload) => void;
  generateFollowUp: (p?: ModalPayload) => void;
  createFollowUp: (p?: ModalPayload) => void;
  completeTask: (task: Task) => void;
  addProperty: () => void;
  addBuyer: () => void;
  linkBuyer: (p?: ModalPayload) => void;
  addOffer: (p?: ModalPayload) => void;
}

const Ctx = createContext<ModalApi | null>(null);

type Kind =
  | "log"
  | "followup"
  | "createTask"
  | "complete"
  | "property"
  | "buyer"
  | "link"
  | "offer"
  | null;

export function ModalsProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<Kind>(null);
  const [payload, setPayload] = useState<ModalPayload>({});
  const [task, setTask] = useState<Task | null>(null);

  const open = useCallback((k: Kind, p: ModalPayload = {}) => {
    setPayload(p);
    setKind(k);
  }, []);

  const api = useMemo<ModalApi>(
    () => ({
      logInteraction: (p) => open("log", p),
      generateFollowUp: (p) => open("followup", p),
      createFollowUp: (p) => open("createTask", p),
      completeTask: (t) => {
        setTask(t);
        setKind("complete");
      },
      addProperty: () => open("property"),
      addBuyer: () => open("buyer"),
      linkBuyer: (p) => open("link", p),
      addOffer: (p) => open("offer", p),
    }),
    [open],
  );

  const close = useCallback(() => setKind(null), []);

  const scope = `${kind ?? "none"}:${payload.buyerId ?? ""}:${payload.propertyId ?? ""}:${payload.description ?? ""}:${task?.id ?? ""}`;

  return (
    <Ctx.Provider value={api}>
      {children}
      <LogInteractionModal
        key={`log:${scope}`}
        open={kind === "log"}
        onClose={close}
        defaultBuyerId={payload.buyerId}
        defaultPropertyId={payload.propertyId}
      />
      <GenerateFollowUpModal
        key={`followup:${scope}`}
        open={kind === "followup"}
        onClose={close}
        defaultBuyerId={payload.buyerId}
        defaultPropertyId={payload.propertyId}
      />
      <CreateFollowUpModal
        key={`task:${scope}`}
        open={kind === "createTask"}
        onClose={close}
        defaultBuyerId={payload.buyerId}
        defaultPropertyId={payload.propertyId}
        defaultDescription={payload.description}
      />
      <CompleteTaskModal key={`complete:${scope}`} open={kind === "complete"} onClose={close} task={task} />
      <AddPropertyModal key={`property:${scope}`} open={kind === "property"} onClose={close} />
      <AddBuyerModal key={`buyer:${scope}`} open={kind === "buyer"} onClose={close} />
      <LinkBuyerModal
        key={`link:${scope}`}
        open={kind === "link"}
        onClose={close}
        defaultBuyerId={payload.buyerId}
        defaultPropertyId={payload.propertyId}
      />
      <AddOfferModal
        key={`offer:${scope}`}
        open={kind === "offer"}
        onClose={close}
        defaultBuyerId={payload.buyerId}
        defaultPropertyId={payload.propertyId}
      />
    </Ctx.Provider>
  );
}

export function useModals(): ModalApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useModals must be used inside ModalsProvider");
  return ctx;
}
