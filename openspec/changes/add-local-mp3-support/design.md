# Design Document: Local MP3 File Support

## Context

**Problem:** Users cannot directly summarize audio files from the local filesystem. Audio support exists only for URLs (YouTube, direct media URLs, podcasts) and embedded media in HTML.

**Opportunity:** Reuse existing transcription infrastructure (Whisper, yt-dlp, transcript caching) to support local audio files with minimal new code.

**Scope:** Local MP3, WAV, M4A, and other common audio formats detected via `file-type` MIME detection.

**Constraints:**
- Must not break URL-based audio flows (YouTube, podcasts, direct media URLs)
- Must use existing transcript provider pipeline
- Must respect `--video-mode` flag (auto, transcript, understand)
- Must work with all transcription providers (whisper.cpp, OpenAI, FAL)
- Must reuse existing caching and progress reporting

## Goals

- ✅ Enable `summarize ./file.mp3` to work end-to-end
- ✅ Leverage existing Whisper transcription + caching
- ✅ Provide consistent progress reporting (loading → transcribing → summarizing)
- ✅ Maintain backward compatibility with all URL-based audio flows
- ✅ Add regression tests to prevent future breakage

## Non-Goals

- ✅ Support audio format conversion (users must provide transcribable formats)
- ✅ Add new transcription providers (use existing Whisper integration)
- ✅ Support streaming from pipes (file path only)
- ✅ Change any public API surface in `-core` library

## Technical Decisions

### Decision 1: Audio Detection Strategy

**What:** Detect audio MIME types in `handleFileInput` before asset summarization.

**Why:** 
- `file-type` library is already a dependency (used elsewhere in project)
- MIME detection happens naturally during `loadLocalAsset`
- Routing decision can be made in `handleFileInput` with minimal refactoring

**Alternatives considered:**
- File extension matching (fragile, unreliable)
- Magic byte inspection (reinvents file-type; already have it)

**Approach:**
1. In `handleFileInput`, after `loadLocalAsset` succeeds, check `loaded.attachment.mediaType`
2. If it starts with `audio/`, route to transcript provider instead of `ctx.summarizeAsset`
3. Otherwise, use existing asset summarization path

**Status:** ✅ IMPLEMENTED

### Decision 2: Transcript Provider Integration

**What:** Use `resolveTranscriptForLink` (or extract generic provider directly) to transcribe local audio.

**Why:**
- Reuses all existing provider logic (yt-dlp, Whisper, caching)
- Consistent with URL-based audio flows
- Automatic fallback chain: whisper.cpp → OpenAI → FAL

**Initial Approach (rejected):**
1. Build a minimal transcript context with:
   - `url` = file path (or `file://` URL)
   - `html` = `null` (no embedded media)
   - `resourceKey` = `null` (local files don't have video IDs)
2. Call generic provider's `fetchDirectMediaTranscript` with the file path

**Actual Approach (implemented):**
1. Created new `summarizeMediaFile()` handler that:
   - Resolves file path to absolute path
   - Converts absolute path to `file://` URL using `pathToFileURL()`
   - Validates transcription provider availability early
   - Creates LinkPreviewClient with full dependencies
   - Calls `client.fetchLinkContent()` with the file:// URL and `mediaTranscript: 'prefer'`
   - Converts resulting transcript to text attachment
   - Calls `summarizeAsset()` with the transcript attachment
2. Updated yt-dlp to accept `--enable-file-urls` flag for file:// URLs

**Rationale for change:**
- Initial approach would have required modifying generic provider to understand file paths
- Actual approach leverages existing LinkPreviewClient infrastructure
- file:// URL conversion is explicit and clear
- Keeps all logic in one place (media handler)

**Status:** ✅ IMPLEMENTED

### Decision 3: Cache Key Strategy

**What:** Cache local audio transcripts using file path + modification time.

**Why:**
- File path + mtime uniquely identifies local file content
- Cheap to compute (no content hash needed)
- Standard cache invalidation pattern

**Initial Approach:**
- Use `stat().mtime.toISOString() + filePath` as part of cache key

**Actual Approach (implemented):**
1. Added optional `fileMtime` parameter throughout cache layer:
   - `TranscriptCache.get()` accepts `fileMtime?: number | null`
   - `readTranscriptCache()` accepts `fileMtime?: number | null`
   - `resolveTranscriptForLink()` accepts `fileMtime?: number | null`
   - `FetchLinkContentOptions` accepts `fileMtime?: number | null`
2. `buildTranscriptCacheKey()` includes `fileMtime` in the hash
3. Media handler computes `fileMtime` using `statSync()` and passes it through
4. Cache key includes: `{ url, namespace, fileMtime, formatVersion }`

**Rationale for change:**
- More flexible: `fileMtime` is optional (works for URLs too)
- Centralized in one function: `buildTranscriptCacheKey()`
- Doesn't require cache validation on read; key itself differs
- Works transparently with existing caching infrastructure

**Status:** ✅ IMPLEMENTED

### Decision 4: Progress Reporting

**What:** Display consistent phases: "Loading file" → "Transcribing" → "Summarizing".

**Why:**
- Matches existing URL-based audio behavior
- Users see meaningful progress (not just spinner)
- Supports both TTY spinners and OSC progress protocol

**Approach:**
1. `handleFileInput` shows "Loading file (X.X MB)…" with spinner + OSC progress
2. After load, update spinner to show MIME type and model
3. Reuse existing `ctx.summarizeAsset` flow (which handles transcription → summarization)

**Status:** ✅ IMPLEMENTED (via existing infrastructure)

### Decision 5: Error Handling

**What:** Show friendly errors when transcription providers are missing.

**Why:**
- Whisper transcription is a hard requirement for local audio
- Users need clear guidance on setup
- Prevents confusing generic asset errors

**Approach:**
1. Media handler checks for available providers early:
   - Local whisper.cpp (via env var `SUMMARIZE_WHISPER_CPP_BINARY`)
   - OpenAI API key (via `OPENAI_API_KEY`)
   - FAL API key (via `FAL_KEY`)
2. If none available, show error with setup instructions
3. Preserve provider-specific error messages (unsupported format, etc.)

**Status:** ✅ IMPLEMENTED

### Decision 6: Backward Compatibility

**What:** Ensure URL-based audio flows are never affected.

**Why:**
- Existing code paths must remain stable
- Regression tests prevent accidental breakage

**Approach:**
1. Changes are additive: only affect local file paths with audio MIME types
2. URL classification (`classifyUrl`) unaffected
3. Generic provider's `fetchDirectMediaTranscript` already handles both URLs and file:// URLs
4. Added `--enable-file-urls` flag to yt-dlp for security/compatibility

**Status:** ✅ IMPLEMENTED

### Decision 7: File URL Protocol Support (NEW - Implementation Discovery)

**What:** Convert local file paths to `file://` URLs and add yt-dlp support for them.

**Why:**
- yt-dlp expects URLs, not file paths
- yt-dlp requires explicit `--enable-file-urls` flag for security
- file:// URLs work cleanly with existing transcript pipeline

**Implementation:**
1. Media handler uses `pathToFileURL(resolvePath(filePath))` to convert paths
2. yt-dlp downloader checks if URL starts with `file://`
3. If file URL detected, adds `--enable-file-urls` flag to args

**Status:** ✅ IMPLEMENTED

## Risks & Mitigations

| Risk | Likelihood | Mitigation | Status |
|------|-----------|-----------|--------|
| Transcription cost explosion (users bulk-process) | Medium | Document in README that transcription has API costs; no automatic bulk mode | ✅ Documented |
| Cache key collision | Low | Use path + mtime; verify file exists on cache read | ✅ mtime-based keys |
| Breaking URL audio flows | Low | Add regression tests for YouTube, podcasts, direct URLs; CI gate on tests | ⚠️ Regression tests not yet added |
| Unsupported audio format crashes | Low | Let Whisper provider handle format rejection; catch and report | ✅ Error handling in place |
| File not readable (permissions) | Low | `loadLocalAsset` already handles file errors; propagate cleanly | ✅ Handled by existing code |
| yt-dlp missing for local audio | Medium | Check for transcription provider early; show clear error with install instructions | ✅ Checked in media handler |

## Open Questions (Resolved)

1. **Cache key collision:** ✅ RESOLVED - Using mtime-based keys (sufficient for local files)

2. **File path format:** ✅ RESOLVED - Both relative and absolute paths supported; converted to file:// URLs internally

3. **Audio format support:** ✅ RESOLVED - MP3, WAV, M4A, OGG, FLAC documented; provider support varies per Whisper version

4. **Progress reporting:** ✅ RESOLVED - Show phase without ETA (duration unknown without parsing); matches existing behavior

## Implementation Order

1. **Phase 1–2:** ✅ Core routing logic + transcript provider integration
   - Completed: Audio detection, media handler, LinkPreviewClient integration
   
2. **Phase 3:** ✅ Error handling + user messages
   - Completed: Provider validation, friendly error messages with setup instructions
   
3. **Phase 4:** ❌ Full test suite + regression tests
   - NOT COMPLETED: No new tests added
   - Impact: Feature works but not covered by automated tests
   
4. **Phase 5–6:** ✅ Documentation + polish
   - Partially completed: Help text already mentions audio; docs/media.md exists

## Success Criteria

- ✅ `summarize ./file.mp3` works end-to-end (verified manually)
- ❌ All existing audio URL tests pass (NOT VERIFIED - regression tests not added)
- ✅ Error messages are user-friendly (missing provider, unsupported format)
- ✅ Transcript caching works for local files (via fileMtime support)
- ❌ Code coverage thresholds maintained (NOT VERIFIED - no new tests)
- ✅ TypeScript `--strict` passes
- ✅ All linting + formatting checks pass

## Final Notes

**What Worked:**
- file:// URL approach is clean and leverages existing infrastructure
- fileMtime-based cache keys integrate seamlessly
- Reusing LinkPreviewClient avoids duplicating logic
- Error handling discovered need for yt-dlp --enable-file-urls flag

**What Was Different:**
- Initial plan to pass file paths directly to generic provider was replaced with file:// URL approach
- This required adding --enable-file-urls support to yt-dlp, but that's a small, clean addition
- All changes are backward compatible

**What's Missing:**
- Comprehensive test coverage (Phase 4 not completed)
- Regression tests to ensure URL-based audio flows unaffected
