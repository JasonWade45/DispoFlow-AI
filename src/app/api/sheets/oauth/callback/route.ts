import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

export async function GET(request: NextRequest) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Google OAuth not configured' },
      { status: 503 },
    )
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') || 'default'

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 })
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/sheets/oauth/callback`,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      return NextResponse.json({ error: 'Token exchange failed', detail: err }, { status: 500 })
    }

    const tokens = await tokenRes.json()

    // Return the user to the page they started from (allowlist: only local paths).
    const targetPath = state === 'settings' ? '/settings/sheets' : '/'
    const redirectUrl = new URL(targetPath, request.url)
    redirectUrl.searchParams.set('sheets_connected', '1')
    if (tokens.access_token) {
      redirectUrl.searchParams.set('has_token', '1')
    }

    const response = NextResponse.redirect(redirectUrl)
    response.cookies.set('gs_access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokens.expires_in ?? 3600,
      path: '/',
    })
    if (tokens.refresh_token) {
      response.cookies.set('gs_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 180 * 24 * 3600,
        path: '/',
      })
    }

    return response
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'OAuth callback failed' },
      { status: 500 },
    )
  }
}
