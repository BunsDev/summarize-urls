import { describe, expect, it } from 'vitest'

import {
  parseDurationMs,
  parseLengthArg,
  parseYoutubeMode,
  truncateToCharacters,
} from '../packages/cli/src/flags.js'

describe('cli flag parsing', () => {
  it('parses --youtube', () => {
    expect(parseYoutubeMode('auto')).toBe('auto')
    expect(parseYoutubeMode('web')).toBe('web')
    expect(parseYoutubeMode('apify')).toBe('apify')
    expect(parseYoutubeMode('autp')).toBe('auto')
    expect(() => parseYoutubeMode('nope')).toThrow(/Unsupported --youtube/)
  })

  it('parses --timeout durations', () => {
    expect(parseDurationMs('30')).toBe(30_000)
    expect(parseDurationMs('30s')).toBe(30_000)
    expect(parseDurationMs('2m')).toBe(120_000)
    expect(parseDurationMs('500ms')).toBe(500)
    expect(() => parseDurationMs('0')).toThrow(/Unsupported --timeout/)
  })

  it('parses --length as preset or character count', () => {
    expect(parseLengthArg('medium')).toEqual({ kind: 'preset', preset: 'medium' })
    expect(parseLengthArg('20k')).toEqual({ kind: 'chars', maxCharacters: 20_000 })
    expect(parseLengthArg('1500')).toEqual({ kind: 'chars', maxCharacters: 1500 })
    expect(() => parseLengthArg('nope')).toThrow(/Unsupported --length/)
  })

  it('truncates to character budget', () => {
    expect(truncateToCharacters('hello', 10)).toBe('hello')
    const truncated = truncateToCharacters('hello world', 6)
    expect(truncated.length).toBeLessThanOrEqual(6)
    expect(truncated).toContain('…')
  })
})
