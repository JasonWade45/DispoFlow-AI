import { callGroq, isGroqConfigured } from "@/lib/ai/groq"

export interface AccessExtraction {
  code: string | null
  appointment: string | null
}

export interface AccessCandidateResult extends AccessExtraction {
  id: string
}

export function formatAccess(e: AccessExtraction): string {
  const parts: string[] = []
  if (e.code) parts.push(e.code)
  if (e.appointment) parts.push(e.appointment)
  return parts.join(" · ")
}

const LOCAL_CODE_RE =
  /\b(?:(?:LOCK\s*BOX|LOCKBOX|GATE|DOOR|ALARM)\s*(?:CODE|IS|#|:|-)?|CODE)\s*[:#-]?\s*((?=[A-Z0-9]*\d)[A-Z0-9]{3,8})\b/i
const LOCAL_APPT_RE = /\b(?:SHOWINGS?|APPOINTMENTS?|TOURS?)\b[^.,;|]{0,60}/i

export function extractAccessLocal(text: string): AccessExtraction | null {
  const s = (text || "").trim()
  if (!s) return null
  const codeMatch = s.match(LOCAL_CODE_RE)
  const apptMatch = s.match(LOCAL_APPT_RE)
  const code = codeMatch ? codeMatch[1] : null
  const appointment = apptMatch ? apptMatch[0].trim() : null
  if (!code && !appointment) return null
  return { code, appointment }
}

export function buildAccessSystemPrompt(): string {
  return [
    "You extract property access information from raw text of US real-estate listing rows.",
    "For each input item extract:",
    "- code: a lockbox / gate / door / alarm / combo access code (digits or short alphanumeric). null if none.",
    '- appointment: showing/appointment info (e.g. "Sat 10am-2pm", "appointment required", "showings after 4pm"). null if none.',
    "Rules:",
    "- NEVER invent or guess values that are not explicitly in the text.",
    "- If both are null the row simply has no access info — that is fine.",
    "- Do not treat street numbers, prices, phone numbers, or buyer names as codes.",
    '- Output STRICT JSON only: {"results":[{"id":"<same id as input>","code":null,"appointment":null}, ...]} with exactly one entry per input item.',
  ].join("\n")
}

export function buildAccessUserPrompt(
  items: Array<{ id: string; text: string }>,
): string {
  return JSON.stringify({
    items: items.map((it) => ({ id: it.id, text: it.text.slice(0, 500) })),
  })
}

export function parseAccessExtraction(
  raw: string,
  knownIds: Set<string>,
): AccessCandidateResult[] {
  if (!raw || !raw.trim()) return []
  let parsed: unknown
  try {
    const cleaned = raw
      .replace(/^\s*```(?:json)?/i, "")
      .replace(/```\s*$/i, "")
      .trim()
    parsed = JSON.parse(cleaned)
  } catch {
    return []
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : ((parsed as { results?: unknown } | null)?.results ?? null)
  if (!Array.isArray(arr)) return []
  const out: AccessCandidateResult[] = []
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue
    const r = item as Record<string, unknown>
    const id = typeof r.id === "string" ? r.id : null
    if (!id || !knownIds.has(id)) continue
    const code = typeof r.code === "string" && r.code.trim() ? r.code.trim().slice(0, 12) : null
    const appointment =
      typeof r.appointment === "string" && r.appointment.trim()
        ? r.appointment.trim().slice(0, 120)
        : null
    out.push({ id, code, appointment })
  }
  return out
}

export async function groqExtractAccessInfo(
  items: Array<{ id: string; text: string }>,
): Promise<AccessCandidateResult[]> {
  if (!isGroqConfigured() || items.length === 0) return []
  const content = await callGroq(
    buildAccessSystemPrompt(),
    buildAccessUserPrompt(items),
    0,
  )
  return parseAccessExtraction(content, new Set(items.map((i) => i.id)))
}
