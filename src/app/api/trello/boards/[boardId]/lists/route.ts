import { NextRequest, NextResponse } from "next/server"
import { trelloListsResponseSchema } from "@/lib/schemas"

const TRELLO_KEY = process.env.TRELLO_API_KEY
const TRELLO_TOKEN = process.env.TRELLO_TOKEN

function authFromRequest(request: NextRequest): { key: string; token: string } | null {
  const headerKey = request.headers.get("x-trello-key")
  const headerToken = request.headers.get("x-trello-token")
  if (headerKey && headerToken) return { key: headerKey, token: headerToken }
  if (TRELLO_KEY && TRELLO_TOKEN) return { key: TRELLO_KEY, token: TRELLO_TOKEN }
  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const auth = authFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 })
  }
  const { boardId } = await params

  try {
    const url = new URL(`https://api.trello.com/1/boards/${boardId}/lists`)
    url.searchParams.set("key", auth.key)
    url.searchParams.set("token", auth.token)
    url.searchParams.set("filter", "open")
    url.searchParams.set("fields", "id,name,pos,closed")

    const res = await fetch(url.toString())
    if (!res.ok) {
      const detail = await res.text()
      return NextResponse.json({ error: "trello_api_failed", detail }, { status: 500 })
    }
    const parsed = trelloListsResponseSchema.safeParse(await res.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "trello_api_failed", detail: "Unexpected response from Trello" },
        { status: 500 },
      )
    }
    return NextResponse.json({ lists: parsed.data })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    )
  }
}
