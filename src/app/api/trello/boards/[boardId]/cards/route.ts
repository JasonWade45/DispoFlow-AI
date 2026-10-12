import { NextRequest, NextResponse } from "next/server"

const TRELLO_KEY = process.env.TRELLO_API_KEY
const TRELLO_TOKEN = process.env.TRELLO_TOKEN

function authFromRequest(request: NextRequest): { key: string; token: string } | null {
  const headerKey = request.headers.get("x-trello-key")
  const headerToken = request.headers.get("x-trello-token")
  if (headerKey && headerToken) return { key: headerKey, token: headerToken }
  if (TRELLO_KEY && TRELLO_TOKEN) return { key: TRELLO_KEY, token: TRELLO_TOKEN }
  return null
}

type TrelloAttachment = {
  id: string
  url: string
  name: string
  previews?: { url: string }[]
  type?: string
  isUpload?: boolean
}

type TrelloCard = {
  id: string
  name: string
  desc: string
  idList: string
  idBoard: string
  shortUrl: string
  dateLastActivity: string
  due: string | null
  labels: { id: string; name: string; color: string | null }[]
  attachments: TrelloAttachment[]
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
    const url = new URL(`https://api.trello.com/1/boards/${boardId}/cards`)
    url.searchParams.set("key", auth.key)
    url.searchParams.set("token", auth.token)
    url.searchParams.set("filter", "open")
    url.searchParams.set(
      "fields",
      "id,name,desc,idList,idBoard,shortUrl,dateLastActivity,due",
    )
    url.searchParams.set("attachments", "true")
    url.searchParams.set("attachment_fields", "id,url,name,previews,type,isUpload")
    url.searchParams.set("labels", "true")

    const res = await fetch(url.toString())
    if (!res.ok) {
      const detail = await res.text()
      return NextResponse.json({ error: "trello_api_failed", detail }, { status: 500 })
    }
    const cards: TrelloCard[] = await res.json()
    return NextResponse.json({ cards })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    )
  }
}
