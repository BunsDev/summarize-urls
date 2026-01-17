import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { SlideSettings } from './settings.js'
import type { SlideExtractionResult, SlideSource } from './types.js'

const normalizePath = (value: string) => path.resolve(value)

export function resolveSlidesDir(outputDir: string, sourceId: string): string {
  return path.join(outputDir, sourceId)
}

export async function validateSlidesCache({
  cached,
  source,
  settings,
}: {
  cached: SlideExtractionResult
  source: SlideSource
  settings: SlideSettings
}): Promise<SlideExtractionResult | null> {
  if (!cached || typeof cached !== 'object') return null
  if (cached.sourceId !== source.sourceId) return null
  if (cached.sourceKind !== source.kind) return null
  if (cached.sourceUrl !== source.url) return null

  const expectedSlidesDir = resolveSlidesDir(settings.outputDir, source.sourceId)
  if (!cached.slidesDir || normalizePath(cached.slidesDir) !== normalizePath(expectedSlidesDir)) {
    return null
  }

  if (cached.sceneThreshold !== settings.sceneThreshold) return null
  if (cached.maxSlides !== settings.maxSlides) return null
  if (cached.minSlideDuration !== settings.minDurationSeconds) return null
  if (cached.ocrRequested !== settings.ocr) return null
  if (!Array.isArray(cached.slides) || cached.slides.length === 0) return null

  for (const slide of cached.slides) {
    if (!slide?.imagePath) return null
    const stat = await fs.stat(slide.imagePath).catch(() => null)
    if (!stat?.isFile()) return null
  }

  return cached
}

export async function readSlidesCacheIfValid({
  source,
  settings,
}: {
  source: SlideSource
  settings: SlideSettings
}): Promise<SlideExtractionResult | null> {
  const slidesDir = resolveSlidesDir(settings.outputDir, source.sourceId)
  const payloadPath = path.join(slidesDir, 'slides.json')
  let raw: string
  try {
    raw = await fs.readFile(payloadPath, 'utf8')
  } catch {
    return null
  }
  let parsed: SlideExtractionResult
  try {
    parsed = JSON.parse(raw) as SlideExtractionResult
  } catch {
    return null
  }
  return await validateSlidesCache({ cached: parsed, source, settings })
}
