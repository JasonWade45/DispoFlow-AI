// src/lib/scraper/elevatereg.ts
// Server-only scraper for ElevateReg.com

import { JSDOM } from 'jsdom'

export interface ScrapedProperty {
  address: string
  city: string
  state: string
  zip: string
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
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.text()
}

function parsePrice(text: string): number | null {
  const match = text.match(/\$?([\d,]+)/)
  if (!match) return null
  return parseInt(match[1].replace(/,/g, ''), 10)
}

function parseAddress(fullAddress: string): { address: string; city: string; state: string; zip: string } | null {
  const parts = fullAddress.split(',').map(s => s.trim())
  if (parts.length < 3) return null
  const address = parts[0]
  const city = parts[1]
  const stateZip = parts[2].split(' ')
  const state = stateZip[0]
  const zip = stateZip.slice(1).join(' ')
  return { address, city, state, zip }
}

function extractSpecs(doc: Document): ScrapedProperty['specs'] {
  const specs: ScrapedProperty['specs'] = {
    bedrooms: '',
    bathrooms: '',
    sqft: '',
    lotSize: '',
    yearBuilt: '',
    propertyType: '',
    terms: '',
  }

  const text = doc.body.textContent || ''
  
  const patterns = {
    bedrooms: /(\d+)\s*(?:bd|bed|bedroom)/i,
    bathrooms: /(\d+(?:\.\d+)?)\s*(?:ba|bath|bathroom)/i,
    sqft: /([\d,]+)\s*sqft/i,
    lotSize: /([\d.]+)\s*acres?/i,
    yearBuilt: /(?:Year Built|Built in)\s*:?\s*(\d{4})/i,
    propertyType: /Property Type\s*:?\s*([^\n]+)/i,
    terms: /Terms\s*:?\s*([^\n]+)/i,
  }

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern)
    if (match) specs[key as keyof typeof specs] = match[1]?.trim() || ''
  }

  return specs
}

export async function scrapeElevateRegProperty(url: string): Promise<ScrapedProperty> {
  const html = await fetchHtml(url)
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const h1 = doc.querySelector('h1')
  const fullAddress = h1?.textContent?.replace(' For Sale', '').trim() || ''
  const parsedAddress = parseAddress(fullAddress)
  
  if (!parsedAddress) throw new Error('Could not parse address')

  const priceText = doc.querySelector('strong, .lead, b')?.textContent || ''
  const askingPrice = parsePrice(priceText)

  const article = doc.querySelector('article')
  const firstPara = article?.querySelector('p')
  const description = firstPara?.textContent?.trim() || ''

  const images: string[] = []
  const galleryLinks = doc.querySelectorAll('article a[href*="image-cdn.carrot.com"]')
  galleryLinks.forEach(a => {
    const href = a.getAttribute('href')
    if (href && !images.includes(href)) images.push(href)
  })
  
  const contentImages = doc.querySelectorAll('article img')
  contentImages.forEach(img => {
    const src = img.getAttribute('src')
    if (src && src.includes('image-cdn.carrot.com') && !images.includes(src)) {
      images.push(src)
    }
  })

  const comps: ScrapedProperty['comps'] = []
  const compsHeader = Array.from(doc.querySelectorAll('h2, h3, h4, strong, b')).find(
    el => el.textContent?.toLowerCase().includes('comp')
  )
  
  if (compsHeader) {
    const compsSection = compsHeader.parentElement
    if (compsSection) {
      const links = compsSection.querySelectorAll('a[href*="zillow.com"]')
      links.forEach(a => {
        const text = a.textContent?.trim() || ''
        const soldMatch = text.match(/Sold\s*\$?([\d,]+)/i)
        if (soldMatch) {
          comps.push({
            address: text.replace(/Sold\s*\$?[\d,]+/i, '').trim(),
            soldPrice: parsePrice(soldMatch[0]),
            soldDate: '',
            source: 'Zillow',
          })
        }
      })
    }

  const specs = extractSpecs(doc)

  const text = doc.body.textContent || ''
  const financingMatch = text.match(/WE NOW OFFER LENDING[^.]*/i)
  const financingNote = financingMatch?.[0]?.trim() || ''

  let arv: number | null = null
  if (comps.length > 0) {
    const avgSold = comps.reduce((sum, c) => sum + (c.soldPrice || 0), 0) / comps.length
    arv = Math.round(avgSold)
  }

  return {
    address: parsedAddress!.address,
    city: parsedAddress!.city,
    state: parsedAddress!.state,
    zip: parsedAddress!.zip,
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

function parseAddress(fullAddress: string): { address: string; city: string; state: string; zip: string } | null {
  const parts = fullAddress.split(',').map(s => s.trim())
  if (parts.length < 3) return null
  const address = parts[0]
  const city = parts[1]
  const stateZip = parts[2].split(' ')
  const state = stateZip[0]
  const zip = stateZip.slice(1).join(' ')
  return { address, city, state, zip }
}

function extractSpecs(doc: Document): ScrapedProperty['specs'] {
  const specs: ScrapedProperty['specs'] = {
    bedrooms: '',
    bathrooms: '',
    sqft: '',
    lotSize: '',
    yearBuilt: '',
    propertyType: '',
    terms: '',
  }

  const text = doc.body.textContent || ''
  
  const patterns = {
    bedrooms: /(\d+)\s*(?:bd|bed|bedroom)/i,
    bathrooms: /(\d+(?:\.\d+)?)\s*(?:ba|bath|bathroom)/i,
    sqft: /([\d,]+)\s*sqft/i,
    lotSize: /([\d.]+)\s*acres?/i,
    yearBuilt: /(?:Year Built|Built in)\s*:?\s*(\d{4})/i,
    propertyType: /Property Type\s*:?\s*([^\n]+)/i,
    terms: /Terms\s*:?\s*([^\n]+)/i,
  }

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern)
    if (match) specs[key as keyof typeof specs] = match[1]?.trim() || ''
  }

  return specs
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.text()
}
}
