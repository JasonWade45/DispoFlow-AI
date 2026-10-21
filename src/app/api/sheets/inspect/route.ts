import { type NextRequest, NextResponse } from 'next/server'
import { withSheetsAuth } from '@/lib/server/sheets-auth'
import { sheetsValuesResponseSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  let body: { spreadsheetId?: string; range?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const { spreadsheetId, range } = body
  if (!spreadsheetId || !range) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 })
  }

  return withSheetsAuth(request, async (token) => {
    try {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        const err = await res.text()
        if (res.status === 401) {
          // token rejected by Google — lets withSheetsAuth refresh + retry
          return NextResponse.json({ error: 'upstream_unauthorized', detail: err }, { status: 401 })
        }
        return NextResponse.json({ error: 'read_failed', detail: err }, { status: 500 })
      }
      const raw: unknown = await res.json()
      const parsed = sheetsValuesResponseSchema.safeParse(raw)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'read_failed', detail: 'Unexpected response from Google Sheets' },
          { status: 500 },
        )
      }
      const values = parsed.data.values ?? []
      const headers = values[0] ?? []
      const rows = values.slice(1)
      return NextResponse.json({ headers, rows, totalRows: rows.length })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'failed' },
        { status: 500 },
      )
    }
  })
}
