import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

async function getAccessToken(request: NextRequest): Promise<string | null> {
  const cookie = request.cookies.get('gs_access_token')
  if (cookie?.value) return cookie.value
  const refreshCookie = request.cookies.get('gs_refresh_token')
  if (!refreshCookie?.value || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshCookie.value,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token ?? null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }
  const token = await getAccessToken(request)
  if (!token) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { spreadsheetId, range } = body
    if (!spreadsheetId || !range) {
      return NextResponse.json({ error: 'missing_params' }, { status: 400 })
    }

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'read_failed', detail: err }, { status: 500 })
    }
    const data = await res.json()
    const values = data.values ?? []
    const headers = values[0] ?? []
    const rows = values.slice(1)
    return NextResponse.json({ headers, rows, totalRows: rows.length })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed' },
      { status: 500 },
    )
  }
}
