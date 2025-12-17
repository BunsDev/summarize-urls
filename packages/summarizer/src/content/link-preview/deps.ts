export interface FirecrawlScrapeResult {
  markdown: string
  html?: string | null
  metadata?: Record<string, unknown> | null
}

export type ScrapeWithFirecrawl = (
  url: string,
  options?: { timeoutMs?: number }
) => Promise<FirecrawlScrapeResult | null>

export interface LinkPreviewDeps {
  fetch: typeof fetch
  scrapeWithFirecrawl: ScrapeWithFirecrawl | null
  apifyApiToken: string | null
}
