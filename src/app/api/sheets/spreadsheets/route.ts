import { type NextRequest, NextResponse } from 'next/server'
import { withSheetsAuth } from '@/lib/server/sheets-auth'
import { driveFilesResponseSchema } from '@/lib/schemas'

export async function GET(request: NextRequest) {
  return withSheetsAuth(request, async (token) => {
    try {
      const res = await fetch(
        'https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27&fields=files(id%2Cname%2CmodifiedTime)&pageSize=50',
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        const err = await res.text()
        if (res.status === 401) {
          // token rejected by Google — lets withSheetsAuth refresh + retry
          return NextResponse.json({ error: 'upstream_unauthorized', detail: err }, { status: 401 })
        }
        return NextResponse.json({ error: 'drive_list_failed', detail: err }, { status: 500 })
      }
      const raw: unknown = await res.json()
      const parsed = driveFilesResponseSchema.safeParse(raw)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'drive_list_failed', detail: 'Unexpected response from Google Drive' },
          { status: 500 },
        )
      }
      return NextResponse.json({ spreadsheets: parsed.data.files ?? [] })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'failed' },
        { status: 500 },
      )
    }
  })
}
