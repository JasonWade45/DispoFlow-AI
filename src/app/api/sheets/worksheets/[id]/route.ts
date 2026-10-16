import { type NextRequest, NextResponse } from 'next/server'
import { withSheetsAuth } from '@/lib/server/sheets-auth'

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
        return NextResponse.json({ error: 'sheets_meta_failed', detail: err }, { status: 500 })
      }
      const data = await res.json()
      const worksheets = (data.sheets ?? []).map(
        (s: { properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }) => ({
          sheetId: s.properties?.sheetId,
          title: s.properties?.title,
          rowCount: s.properties?.gridProperties?.rowCount,
          columnCount: s.properties?.gridProperties?.columnCount,
        }),
      )
      return NextResponse.json({ worksheets })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'failed' },
        { status: 500 },
      )
    }
  })
}
