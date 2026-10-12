// src/lib/scraper/elevatereg.ts
// Server-only scraper for ElevateReg.com (regex-based, no JSDOM)

export interface ScrapedProperty {
  address: string
  city: string
  state: string
  zip: string
  accessType: string
  askingPrice: number | null
  arv: number | null
  estimatedRepairs: number | null
  description: string
  images: string[]
  comps: Array<{
    address: string
    soldPrice: number
    soldDate: string
    source: string
  }>
  specs: {
    bedrooms: string
    bathrooms: string
    sqft: string
    lotSize: string
    yearBuilt: string
    propertyType: string
    terms: string
  }
  financingNote: string
  companyLink: string
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    return await res.text()
  } finally {
    clearTimeout(timeout)
  }
}

function parsePrice(text: string): number | null {
  const match = text.match(/\$?([\d,]{4,})/)
  if (!match) return null
  const n = parseInt(match[1].replace(/,/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
}

function parseAddress(fullAddress: string): { address: string; city: string; state: string; zip: string } | null {
  const parts = fullAddress.split(',').map(s => s.trim())
  if (parts.length < 3) return null
  const address = parts[0]
  const city = parts[1]
  const stateZip = parts[2].split(' ')
  return { address, city, state: stateZip[0], zip: stateZip.slice(1).join(' ') }
}

function extractAll(re: RegExp, text: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(m[1])
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return out
}

export async function scrapeElevateRegProperty(url: string): Promise<ScrapedProperty> {
  const html = await fetchHtml(url)

  // --- Address from <h1 ...>Title</h1>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const fullAddress = stripTags(h1Match?.[1] ?? '').replace(' For Sale', '').trim()
  const parsedAddress = parseAddress(fullAddress)
  if (!parsedAddress) throw new Error('Could not parse address from page')

  // --- Asking price: first "$110,000" in article content
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i)
  const article = articleMatch?.[0] ?? html
  const priceMatch = article.match(/\$\s?([\d,]{5,})/)
  const askingPrice = priceMatch ? parsePrice(priceMatch[0]) : null

  // --- Description: first <p> in article with substantial text
  const paras = extractAll(/<p[^>]*>([\s\S]*?)<\/p>/gi, article)
  const description = paras.map(stripTags).find(p => p.length > 60) ?? paras.map(stripTags)[0] ?? ''

  // --- Images: carrot CDN links
  const images = [...new Set(extractAll(/href="(https:\/\/[^"]*image-cdn\.carrot\.com[^"]+)"/gi, html))]
    .filter(u => /\.(jpe?g|png|webp)/i.test(u))

  // --- Comps: Zillow links (address in link) + "Sold for $X" nearby
  const comps: ScrapedProperty['comps'] = []
  const zillowLinkRe = /<a[^>]*href="(https:\/\/www\.zillow\.com\/homedetails\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let zm: RegExpExecArray | null
  while ((zm = zillowLinkRe.exec(html)) !== null) {
    const address = stripTags(zm[2]).replace(/[^\x20-\x7E]/g, '').replace(/,\s*,/g, ',').trim()
    if (!address) continue
    // Look ahead up to 800 chars for "Sold for $X"
    const after = html.slice(zm.index, zm.index + zm[0].length + 800)
    const soldMatch = after.match(/Sold\s+for\s*\$?([\d,]+)/i)
    if (soldMatch) {
      comps.push({
        address,
        soldPrice: parsePrice(soldMatch[1]) ?? 0,
        soldDate: '',
        source: 'Zillow',
      })
    }
  }

  // --- ARV estimate from comps average
  let arv: number | null = null
  if (comps.length > 0) {
    const avg = comps.reduce((s, c) => s + (c.soldPrice || 0), 0) / comps.length
    arv = Math.round(avg)
  }

  // --- Specs from labeled lines
  const plain = stripTags(article)
  const specs = {
    bedrooms: plain.match(/(\d+)\s*(?:bd|bed|bedroom)/i)?.[1] ?? '',
    bathrooms: plain.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath|bathroom)/i)?.[1] ?? '',
    sqft: plain.match(/([\d,]+)\s*sqft/i)?.[1] ?? '',
    lotSize: plain.match(/([\d.]+)\s*acres?/i)?.[1] ?? '',
    yearBuilt: plain.match(/(?:Year Built|Built in)\s*:?\s*(\d{4})/i)?.[1] ?? '',
    propertyType: plain.match(/Property Type\s*:?\s*([^\n]+)/i)?.[1]?.trim() ?? '',
    terms: plain.match(/Terms\s*:?\s*([^\n]+)/i)?.[1]?.trim() ?? '',
  }

  // --- Financing note
  const financingMatch = html.match(/WE NOW OFFER LENDING[^<]*/i)
  const financingNote = financingMatch?.[0]?.trim() ?? ''

  // --- Access type (best effort from page text)
  let accessType = ''
  const accessText = plain.toLowerCase()
  if (accessText.includes('lockbox') || accessText.includes('lock box')) accessType = 'Lockbox'
  else if (accessText.includes('open house')) accessType = 'Open'
  else if (accessText.includes('appointment')) accessType = 'Appointments'

  return {
    address: parsedAddress.address,
    city: parsedAddress.city,
    state: parsedAddress.state,
    zip: parsedAddress.zip,
    accessType,
    askingPrice,
    arv,
    estimatedRepairs: null,
    description,
    images,
    comps,
    specs,
    financingNote,
    companyLink: url,
  }
}

export interface ListingCard {
  url: string
  address: string
  price: number | null
  image: string
  statusBadge: string
  propertyType: string
  bedrooms: string
  bathrooms: string
  sqft: string
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
}

export async function scrapeElevateRegListings(maxPages = 36): Promise<ListingCard[]> {
  const cards: ListingCard[] = []
  const seen = new Set<string>()

  const pageUrls: string[] = []
  for (let page = 1; page <= maxPages; page++) {
    pageUrls.push(
      page === 1
        ? 'https://www.elevatereg.com/property/'
        : `https://www.elevatereg.com/property/page/${page}/`,
    )
  }

  const results = await mapWithConcurrency(pageUrls, 6, async (url) => {
    try {
      return await fetchHtml(url)
    } catch {
      return null
    }
  })

  for (const html of results) {
    if (!html) continue
    const articles = html.split(/<article[^>]*class="[^"]*property[^"]*"/i).slice(1)
    for (const chunk of articles) {
      const linkMatch = chunk.match(/<a[^>]*href="(https:\/\/www\.elevatereg\.com\/property\/[^"]+)"[^>]*>/i)
      if (!linkMatch) continue
      const link = linkMatch[1].replace(/\/$/, '') + '/'
      if (seen.has(link)) continue
      const titleMatch = chunk.match(
        /<(?:h2|p)[^>]*class="[^"]*property-title[^"]*"[^>]*>([\s\S]*?)<\/(?:h2|p)>/i,
      )
      const address = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : ''
      const priceText = chunk.match(/\$\s?([\d,]{5,})/)
      const price = priceText ? parsePrice(priceText[0]) : null
      const imgMatch = chunk.match(/<img[^>]*src="([^"]*image-cdn\.carrot\.com[^"]*)"/i)
      const image = imgMatch ? imgMatch[1] : ''
      const badgeMatch = chunk.match(/<span[^>]*class="[^"]*badge[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
      const statusBadge = badgeMatch ? stripTags(badgeMatch[1]) : ''
      const typeMatch = chunk.match(/<span[^>]*class="[^"]*property-type-heading[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
      const propertyType = typeMatch ? stripTags(typeMatch[1]).replace(/\s*For Sale\s*$/i, '').trim() : ''
      const detailsMatch = chunk.match(/<ul[^>]*class="[^"]*property-details[^"]*"[^>]*>([\s\S]*?)<\/ul>/i)
      const detailsHtml = detailsMatch?.[1] ?? ''
      const bedrooms = detailsHtml.match(/<li[^>]*>\s*(\d+(?:\.\d+)?)\s*bd/i)?.[1] ?? ''
      const bathrooms = detailsHtml.match(/<li[^>]*>\s*(\d+(?:\.\d+)?)\s*ba/i)?.[1] ?? ''
      const sqft = detailsHtml.match(/<li[^>]*>\s*([\d,]+)\s*sqft/i)?.[1] ?? ''
      if (!address) continue
      seen.add(link)
      cards.push({ url: link, address, price, image, statusBadge, propertyType, bedrooms, bathrooms, sqft })
    }
  }

  return cards
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}
