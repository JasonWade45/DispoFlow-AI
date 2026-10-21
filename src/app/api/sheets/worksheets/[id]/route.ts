import { type NextRequest, NextResponse } from 'next/server'
import { withSheetsAuth } from '@/lib/server/sheets-auth'
import { sheetsMetaResponseSchema } from '@/lib/schemas'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return withSheetsAuth(request, async (token) => {
    try {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets(properties(sheetId,title,gridProperties))`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        const err = await res.text()
        if (res.status === 401) {
          // token rejected by Google — lets withSheetsAuth refresh + retry
          return NextResponse.json({ error: 'upstream_unauthorized', detail: err }, { status: 401 })
        }
        return NextResponse.json({ error: 'sheets_meta_failed', detail: err }, { status: 500 })
      }
      const raw: unknown = await res.json()
      const parsed = sheetsMetaResponseSchema.safeParse(raw)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'sheets_meta_failed', detail: 'Unexpected response from Google Sheets' },
          { status: 500 },
        )
      }
      const worksheets = (parsed.data.sheets ?? []).map((s) => ({
        sheetId: s.properties?.sheetId,
        title: s.properties?.title,
        rowCount: s.properties?.gridProperties?.rowCount,
        columnCount: s.properties?.gridProperties?.columnCount,
      }))
      return NextResponse.json({ worksheets })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'failed' },
        { status: 500 },
      )
    }
  })
}
