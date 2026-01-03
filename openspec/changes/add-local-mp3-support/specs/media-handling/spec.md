## ADDED Requirements

### Requirement: Local Audio File Transcription

The CLI SHALL detect when a local file path refers to an audio file (by MIME type) and route it through the existing transcription pipeline.

#### Scenario: User summarizes local MP3 file

- **WHEN** user runs `summarize ./path/to/file.mp3`
- **THEN** CLI detects audio MIME type, displays "Loading file" + filename + size
- **AND** CLI transcribes the audio using the configured transcription provider (whisper.cpp → OpenAI → FAL)
- **AND** CLI generates a summary from the transcript using the selected LLM model
- **AND** output is displayed as markdown/text per `--format` flag

#### Scenario: User summarizes local WAV file

- **WHEN** user runs `summarize ./recording.wav`
- **THEN** CLI detects audio MIME type via `file-type` library
- **AND** transcription proceeds using the same pipeline as MP3 files
- **AND** transcript is normalized and cached (if configured)

#### Scenario: Audio transcription uses configured media mode

- **WHEN** user runs `summarize ./audio.mp3 --video-mode transcript`
- **THEN** CLI prefers transcription over any fallback modes
- **AND** transcript is generated before summary

#### Scenario: Transcription provider missing for local audio

- **WHEN** user runs `summarize ./audio.mp3` without OpenAI/FAL keys or whisper.cpp installed
- **THEN** CLI displays friendly error message
- **AND** error message lists available transcription providers
- **AND** error message includes environment variable names to set (e.g., `OPENAI_API_KEY`, `FAL_KEY`)

#### Scenario: Local audio file size exceeds input limit

- **WHEN** user runs `summarize ./large-file.mp3` (>10 MB extracted transcript)
- **THEN** CLI enforces the same size limits as URL-based audio
- **AND** friendly error message indicates file size and limit
- **AND** summarization does not proceed

### Requirement: Progress Reporting for Local Audio Files

The CLI SHALL display consistent progress feedback when loading and transcribing local audio files.

#### Scenario: Progress shown during audio transcription

- **WHEN** user runs `summarize ./file.mp3` with progress enabled (TTY)
- **THEN** spinner shows "Loading file (X.X MB)…" while detecting MIME type
- **AND** spinner updates to "Transcribing (model: whisper.cpp)…" during transcription
- **AND** spinner updates to "Summarizing (model: gpt-4-mini)…" during summarization
- **AND** each phase is reported via OSC progress protocol (if enabled)

#### Scenario: Progress disabled when not TTY

- **WHEN** user runs `summarize ./file.mp3 --plain` or pipes output
- **THEN** no progress spinners are shown
- **AND** final summary is output to stdout

### Requirement: Audio MIME Type Detection

The CLI SHALL reliably detect audio files via the `file-type` library and route them to transcription.

#### Scenario: MIME type detection for common audio formats

- **WHEN** CLI loads local file with MIME type matching `audio/*`
- **THEN** file is classified as audio (not as a generic asset)
- **AND** routing proceeds to transcript provider (generic provider with media transcription mode)
- **AND** Whisper transcription is attempted via configured provider

#### Scenario: Unsupported audio MIME type is rejected

- **WHEN** user loads a local file with MIME type `audio/x-proprietary` (not in common use)
- **THEN** CLI attempts transcription anyway (relying on provider to reject if unsupported)
- **AND** if provider rejects, friendly error message is shown

### Requirement: Transcript Caching for Local Audio

The CLI SHALL cache transcripts from local audio files to avoid redundant transcription.

#### Scenario: Transcript cached after first transcription

- **WHEN** user runs `summarize ./file.mp3` successfully
- **THEN** transcript is written to cache with file hash as key
- **AND** subsequent runs with same file reuse cached transcript (subject to cache mode)

#### Scenario: Cache bypass skips transcript cache

- **WHEN** user runs `summarize ./file.mp3` with cache mode `bypass`
- **THEN** fresh transcription is performed
- **AND** new transcript is cached (if cache mode allows writes)

## MODIFIED Requirements

### Requirement: File Input Handler

The CLI SHALL support local file inputs including audio files, images, PDFs, and text documents.

**Previous behavior:** Handled files but routed only text and binary assets to `summarizeAsset`.

**New behavior:** Detect audio MIME types via `file-type` library and route to transcription pipeline, leveraging the same media flow as URL-based audio files.

The system SHALL:
1. Load local file with `loadLocalAsset`
2. Detect MIME type using `file-type` library
3. If audio MIME type, route to generic transcript provider with media transcription mode enabled
4. Generate summary from transcript using configured LLM model
5. Display progress and metrics per existing conventions

#### Scenario: Audio file routed to transcript provider

- **WHEN** `handleFileInput` detects `audio/mpeg` MIME type
- **THEN** it invokes the transcript pipeline instead of asset summarization
- **AND** the same transcription providers (whisper.cpp, OpenAI, FAL) are used
- **AND** existing URL-based audio flows continue unchanged

#### Scenario: Non-audio files continue existing behavior

- **WHEN** user loads a PDF, image, or text file
- **THEN** file is routed to asset-based summarization (unchanged)
- **AND** audio-specific transcription logic is skipped

### Requirement: Generic Transcript Provider

The generic transcript provider SHALL handle local audio files via direct media transcription.

**Previous behavior:** Handled embedded media in HTML, direct media URLs, and Twitter video extraction.

**New behavior:** Detect when local file paths refer to audio and route them through the same Whisper transcription pipeline as URLs.

The system SHALL:
1. Accept file paths with `audio/*` MIME type
2. Invoke `fetchTranscriptWithYtDlp` or direct Whisper transcription
3. Return normalized transcript text and segments (if requested)
4. Report attempted providers and error states clearly

#### Scenario: Local MP3 transcribed via existing pipeline

- **WHEN** generic provider receives local file with `audio/mpeg` MIME type
- **THEN** Whisper transcription is attempted using yt-dlp or direct transcription
- **AND** transcript is returned in same format as URL-based transcripts
- **AND** diagnostics include transcription provider (whisper.cpp, openai, fal)

#### Scenario: Local audio uses correct transcription provider preference

- **WHEN** user runs `summarize ./file.mp3` with `SUMMARIZE_WHISPER_CPP_BINARY` set
- **THEN** local `whisper.cpp` is preferred over cloud providers
- **AND** fallback to OpenAI/FAL only if local is unavailable
