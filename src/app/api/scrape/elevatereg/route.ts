import { NextRequest, NextResponse } from 'next/server'
import { scrapeElevateRegProperty } from '@/lib/scraper/elevatereg'
import { elevateRegScrapeSchema, firstIssue } from '@/lib/schemas'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = elevateRegScrapeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })
  }

  try {
    const property = await scrapeElevateRegProperty(parsed.data.url)

    return NextResponse.json({
      success: true,
      property,
      preview: {
        address: `${property.address}, ${property.city}, ${property.state} ${property.zip}`,
        askingPrice: property.askingPrice,
        arv: property.arv,
        images: property.images.length,
        comps: property.comps.length,
        specs: property.specs,
      },
    })
  } catch (error) {
    console.error('Scrape error:', error)
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'The company site took too long to respond. Try again.'
        : error instanceof Error
          ? error.message
          : 'Failed to scrape property'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'elevatereg scraper' })
}
