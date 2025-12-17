import type { FirecrawlScrapeResult, LinkPreviewDeps } from '../deps.js'
import { resolveTranscriptForLink } from '../transcript/index.js'
import { isYouTubeUrl } from '../transcript/utils.js'
import type { FirecrawlDiagnostics } from '../types.js'

import { extractArticleContent } from './article.js'
import { normalizeForPrompt } from './cleaner.js'
import { fetchHtmlDocument, fetchWithFirecrawl } from './fetcher.js'
import { extractMetadataFromFirecrawl, extractMetadataFromHtml } from './parsers.js'
import type { ExtractedLinkContent, FetchLinkContentOptions } from './types.js'
import {
  appendNote,
  ensureTranscriptDiagnostics,
  finalizeExtractedLinkContent,
  pickFirstText,
  resolveMaxCharacters,
  resolveTimeoutMs,
  safeHostname,
  selectBaseContent,
} from './utils.js'
import { extractYouTubeShortDescription } from './youtube.js'

const LEADING_CONTROL_PATTERN = /^[\\s\\p{Cc}]+/u
const BLOCKED_HTML_HINT_PATTERN =
  /access denied|attention required|captcha|cloudflare|enable javascript|forbidden|please turn javascript on|verify you are human/i
const MIN_HTML_CONTENT_CHARACTERS = 200

function stripLeadingTitle(content: string, title: string | null | undefined): string {
  if (!(content && title)) {
    return content
  }

  const normalizedTitle = title.trim()
  if (normalizedTitle.length === 0) {
    return content
  }

  const trimmedContent = content.trimStart()
  if (!trimmedContent.toLowerCase().startsWith(normalizedTitle.toLowerCase())) {
    return content
  }

  const remainderOriginal = trimmedContent.slice(normalizedTitle.length)
  const remainder = remainderOriginal.replace(LEADING_CONTROL_PATTERN, '')
  return remainder
}

function shouldFallbackToFirecrawl(html: string): boolean {
  if (BLOCKED_HTML_HINT_PATTERN.test(html)) {
    return true
  }
  const normalized = normalizeForPrompt(extractArticleContent(html))
  return normalized.length < MIN_HTML_CONTENT_CHARACTERS
}

export async function fetchLinkContent(
  url: string,
  options: FetchLinkContentOptions | undefined,
  deps: LinkPreviewDeps
): Promise<ExtractedLinkContent> {
  const maxCharacters = resolveMaxCharacters(options)
  const timeoutMs = resolveTimeoutMs(options)
  const youtubeTranscriptMode = options?.youtubeTranscript ?? 'auto'

  let html: string | null = null
  let htmlError: unknown = null

  try {
    html = await fetchHtmlDocument(deps.fetch, url, { timeoutMs })
  } catch (error) {
    htmlError = error
  }

  const shouldTryFirecrawl =
    deps.scrapeWithFirecrawl !== null &&
    !isYouTubeUrl(url) &&
    (html === null || shouldFallbackToFirecrawl(html))

  if (shouldTryFirecrawl) {
    const firecrawlAttempt = await fetchWithFirecrawl(url, deps.scrapeWithFirecrawl, { timeoutMs })
    firecrawlAttempt.diagnostics.notes = appendNote(
      firecrawlAttempt.diagnostics.notes,
      html === null
        ? 'HTML fetch failed; falling back to Firecrawl'
        : 'HTML content looked blocked/thin; falling back to Firecrawl'
    )

    if (firecrawlAttempt.payload) {
      const firecrawlResult = await buildResultFromFirecrawl({
        url,
        payload: firecrawlAttempt.payload,
        maxCharacters,
        youtubeTranscriptMode,
        firecrawlDiagnostics: firecrawlAttempt.diagnostics,
        deps,
      })
      if (firecrawlResult) {
        return firecrawlResult
      }
      firecrawlAttempt.diagnostics.notes = appendNote(
        firecrawlAttempt.diagnostics.notes,
        'Firecrawl returned empty content'
      )
    }

    if (html) {
      return buildResultFromHtmlDocument({
        url,
        html,
        maxCharacters,
        youtubeTranscriptMode,
        firecrawlDiagnostics: firecrawlAttempt.diagnostics,
        deps,
      })
    }

    const notes = firecrawlAttempt.diagnostics.notes
    const firecrawlError = notes ? `; Firecrawl notes: ${notes}` : ''
    throw new Error(
      `Failed to fetch HTML document${firecrawlError}${
        htmlError instanceof Error ? `; HTML error: ${htmlError.message}` : ''
      }`
    )
  }

  if (!html) {
    throw htmlError instanceof Error ? htmlError : new Error('Failed to fetch HTML document')
  }

  const firecrawlDiagnostics: FirecrawlDiagnostics = { attempted: false, used: false, notes: null }
  return buildResultFromHtmlDocument({
    url,
    html,
    maxCharacters,
    youtubeTranscriptMode,
    firecrawlDiagnostics,
    deps,
  })
}

async function buildResultFromFirecrawl({
  url,
  payload,
  maxCharacters,
  youtubeTranscriptMode,
  firecrawlDiagnostics,
  deps,
}: {
  url: string
  payload: FirecrawlScrapeResult
  maxCharacters: number
  youtubeTranscriptMode: FetchLinkContentOptions['youtubeTranscript']
  firecrawlDiagnostics: FirecrawlDiagnostics
  deps: LinkPreviewDeps
}): Promise<ExtractedLinkContent | null> {
  const normalizedMarkdown = normalizeForPrompt(payload.markdown ?? '')
  if (normalizedMarkdown.length === 0) {
    firecrawlDiagnostics.notes = appendNote(
      firecrawlDiagnostics.notes,
      'Firecrawl markdown normalization yielded empty text'
    )
    return null
  }

  const transcriptResolution = await resolveTranscriptForLink(url, payload.html ?? null, deps, {
    youtubeTranscriptMode,
  })
  const baseContent = selectBaseContent(normalizedMarkdown, transcriptResolution.text)
  if (baseContent.length === 0) {
    firecrawlDiagnostics.notes = appendNote(
      firecrawlDiagnostics.notes,
      'Firecrawl produced content that normalized to an empty string'
    )
    return null
  }

  const htmlMetadata = payload.html
    ? extractMetadataFromHtml(payload.html, url)
    : { title: null, description: null, siteName: null }
  const metadata = extractMetadataFromFirecrawl(payload.metadata ?? null)

  const title = pickFirstText([metadata.title, htmlMetadata.title])
  const description = pickFirstText([metadata.description, htmlMetadata.description])
  const siteName = pickFirstText([metadata.siteName, htmlMetadata.siteName, safeHostname(url)])

  firecrawlDiagnostics.used = true

  const transcriptDiagnostics = ensureTranscriptDiagnostics(transcriptResolution)

  return finalizeExtractedLinkContent({
    url,
    baseContent,
    maxCharacters,
    title,
    description,
    siteName,
    transcriptResolution,
    diagnostics: {
      strategy: 'firecrawl',
      firecrawl: firecrawlDiagnostics,
      transcript: transcriptDiagnostics,
    },
  })
}

async function buildResultFromHtmlDocument({
  url,
  html,
  maxCharacters,
  youtubeTranscriptMode,
  firecrawlDiagnostics,
  deps,
}: {
  url: string
  html: string
  maxCharacters: number
  youtubeTranscriptMode: FetchLinkContentOptions['youtubeTranscript']
  firecrawlDiagnostics: FirecrawlDiagnostics
  deps: LinkPreviewDeps
}): Promise<ExtractedLinkContent> {
  const { title, description, siteName } = extractMetadataFromHtml(html, url)
  const rawContent = extractArticleContent(html)
  const normalized = normalizeForPrompt(rawContent)
  const transcriptResolution = await resolveTranscriptForLink(url, html, deps, {
    youtubeTranscriptMode,
  })

  const youtubeDescription =
    transcriptResolution.text === null ? extractYouTubeShortDescription(html) : null
  const baseCandidate = youtubeDescription ? normalizeForPrompt(youtubeDescription) : normalized

  let baseContent = selectBaseContent(baseCandidate, transcriptResolution.text)
  if (baseContent === normalized) {
    baseContent = stripLeadingTitle(baseContent, title)
  }

  const transcriptDiagnostics = ensureTranscriptDiagnostics(transcriptResolution)

  return finalizeExtractedLinkContent({
    url,
    baseContent,
    maxCharacters,
    title,
    description,
    siteName,
    transcriptResolution,
    diagnostics: {
      strategy: 'html',
      firecrawl: firecrawlDiagnostics,
      transcript: transcriptDiagnostics,
    },
  })
}

export {
  DEFAULT_MAX_CONTENT_CHARACTERS,
  type ExtractedLinkContent,
  type FetchLinkContentOptions,
} from './types.js'
