import { z } from "zod";
import type { Buyer, DB, Interaction, Offer, Property, Task } from "@/types";
import { FOLLOW_UP_MODES, REFINE_ACTIONS } from "@/lib/ai/followup";
import type { FollowUpMode } from "@/lib/ai/followup";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function entity<T>(error: string) {
  return z.custom<T>(isObject, { error });
}

function list<T>(error: string) {
  return z.custom<T>(Array.isArray, { error });
}

export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

export const followUpRequestSchema = z.object({
  buyer: entity<Buyer>("must be an object"),
  property: entity<Property>("must be an object"),
  interactions: list<Interaction[]>("must be an array"),
  offers: list<Offer[]>("must be an array"),
  tasks: list<Task[]>("must be an array").optional(),
  mode: z.custom<FollowUpMode>(
    (v) => typeof v === "string" && (FOLLOW_UP_MODES as string[]).includes(v),
    { error: "unknown follow-up mode" },
  ),
  variant: z.number().int().min(0).optional(),
  refine: z.enum(REFINE_ACTIONS).nullable().optional(),
  currentMessage: z.string().nullable().optional(),
});

export const mapColumnsRequestSchema = z.object({
  headers: z.array(z.string()).min(1),
  sampleRows: z.array(z.array(z.string())).optional(),
});

export const accessInfoRequestSchema = z.object({
  items: z.array(z.object({ id: z.string(), text: z.string() })).min(1).max(40),
});

export const elevateRegScrapeSchema = z.object({
  url: z
    .string()
    .refine((u) => u.includes("elevatereg.com/property/"), {
      error: "Invalid ElevateReg property URL",
    }),
});

export const statePutSchema = z.object({
  db: z.custom<DB>(
    (v) => isObject(v) && Array.isArray((v as { properties?: unknown }).properties),
    { error: "Missing db payload" },
  ),
});

export const groqChatResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).optional(),
});

export const followUpDraftResponseSchema = z.object({
  message: z.string(),
  why: z.string().optional(),
});

export const columnMapResponseSchema = z.object({
  mapping: z.record(z.string(), z.unknown()),
  notes: z.unknown().optional(),
});

const accessField = z
  .unknown()
  .optional()
  .transform((v): string | null => (typeof v === "string" ? v : null));

export const accessExtractionItemSchema = z.object({
  id: z.string(),
  code: accessField,
  appointment: accessField,
});

export const accessExtractionResponseSchema = z.union([
  z.array(z.unknown()),
  z.object({ results: z.array(z.unknown()) }).transform((v) => v.results),
]);

export const googleTokenResponseSchema = z.object({
  access_token: z.string().optional(),
  expires_in: z.number().optional().catch(undefined),
  refresh_token: z.string().optional().catch(undefined),
});

export const sheetsValuesResponseSchema = z.object({
  values: z.array(z.array(z.string())).nullable().optional(),
});

export const driveFilesResponseSchema = z.object({
  files: z.array(z.unknown()).nullable().optional(),
});

export const sheetsMetaResponseSchema = z.object({
  sheets: z
    .array(
      z.object({
        properties: z
          .object({
            sheetId: z.number().optional(),
            title: z.string().optional(),
            gridProperties: z
              .object({
                rowCount: z.number().optional(),
                columnCount: z.number().optional(),
              })
              .optional(),
          })
          .optional(),
      }),
    )
    .nullable()
    .optional(),
});
