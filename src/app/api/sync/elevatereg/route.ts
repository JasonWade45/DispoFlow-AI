import { NextRequest, NextResponse } from 'next/server'
import { scrapeElevateRegListings } from '@/lib/scraper/elevatereg'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pages = Math.min(Number(searchParams.get('pages') ?? '36'), 36)

    const cards = await scrapeElevateRegListings(pages)

    return NextResponse.json({
      success: true,
      count: cards.length,
      scrapedAt: new Date().toISOString(),
      properties: cards,
    })
  } catch (error) {
    console.error('Sync listing error:', error)
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'The company site took too long to respond. Try again.'
        : error instanceof Error
          ? error.message
          : 'Failed to fetch listing'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
