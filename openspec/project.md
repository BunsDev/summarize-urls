# Project Context

## Purpose
**Summarize** is a link-to-summary CLI tool and Chrome extension that extracts, cleans, and summarizes content from URLs, files, and media using LLMs. It supports multiple input formats (web pages, PDFs, images, audio/video, YouTube, podcasts, RSS) and provides both programmatic and user-facing interfaces.

Key goals:
- Fast, reliable content extraction from diverse sources
- Multiple LLM provider support with automatic fallback
- Streaming markdown output with TTY formatting
- Local daemon for Chrome extension integration
- Minimal dependencies for library consumers

## Tech Stack

**Core Language & Runtime:**
- TypeScript (v5.9+)
- Node.js (v22+)
- Bun (for binary compilation/distribution)

**Package Management & Monorepo:**
- pnpm (v10.25.0+)
- pnpm workspaces (monorepo with locked versions)

**CLI & UI:**
- Commander.js (CLI framework)
- Ora (spinners/progress)
- osc-progress (OSC-based progress protocol)
- markdansi (markdown ANSI rendering for TTY)
- tslog (structured logging)
- gpt-tokenizer (token counting)

**Core Libraries:**
- file-type (MIME detection)
- mime (MIME type utilities)
- json5 (lenient JSON parsing for config)
- tokentally (token accounting)
- @mariozechner/pi-ai (AI provider abstractions)

**Content Extraction:**
- Readability (HTML -> clean text)
- markitdown (PDF/Office docs via Python UV)
- yt-dlp (YouTube audio extraction)
- Whisper (audio transcription via local/remote)
- Firecrawl (fallback website extraction)

**Chrome Extension:**
- Manifest v3
- React (extension UI)
- Local daemon communication via JSON-RPC

**Development Tools:**
- Biomejs (formatting + linting)
- oxlint (type-aware linting via Rust)
- Vitest (unit + integration testing)
- esbuild (CLI bundling)
- tsx (TypeScript execution)

## Project Conventions

### Code Style

**Formatting:**
- Indent: 2 spaces
- Line width: 100 characters (enforced by Biomejs)
- Quotes: Single quotes (JavaScript/TypeScript)
- Semicolons: As-needed (no forced semicolons)
- Trailing commas: ES5 style (objects/arrays only, not function args)

**Linting & Organization:**
- Biomejs format + check (primary gate)
- oxlint (type-aware linting)
- Auto-import organization enabled

**Naming Conventions:**
- PascalCase: classes, types, interfaces
- camelCase: variables, functions, properties
- UPPER_SNAKE_CASE: constants
- Import aliases: `@steipete/summarize` and `@steipete/summarize-core` (via tsconfig)

### Architecture Patterns

**Monorepo Structure:**
- `@steipete/summarize` (CLI package): entry points + TTY/streaming UX
- `@steipete/summarize-core` (packages/core): library-only exports, no CLI deps
- `apps/chrome-extension`: Chrome extension (Manifest v3, bundled separately)

**Separation of Concerns:**
- Core library (`packages/core`) exports minimal content/prompts APIs
- CLI (`src/`) adds progress, streaming, daemon, and terminal rendering
- Apps (chrome-extension) should prefer importing from `-core` to avoid CLI-only deps

**LLM Provider Abstraction:**
- Uses `@mariozechner/pi-ai` for multi-provider support
- Gateway-style model IDs: `<provider>/<model>` (e.g., `openai/gpt-5-mini`)
- Auto mode: builds candidate list from built-in rules or config overrides
- Fallback chain: CLI providers → native providers → OpenRouter fallbacks

**Content Extraction Pipeline:**
1. Fetch (http/file with timeout)
2. Type detection (file-type/MIME)
3. Format-specific extraction (readability, PDF, etc.)
4. Markdown conversion (readability default, LLM/markitdown optional)
5. Tokenization + model routing

**Media Handling:**
- Transcript-first for audio/video (prefer existing transcripts, fallback to Whisper)
- YouTube: published transcripts → yt-dlp → Whisper → Apify fallback
- Podcasts: RSS feeds with Podcasting 2.0 transcripts, API fallbacks

**Configuration:**
- Single source: `~/.summarize/config.json` (JSON5, lenient)
- Precedence: CLI flags → env vars → config file → defaults
- Config schema validated; unknown keys ignored

**Testing Patterns:**
- Unit tests for logic (content extraction, prompts, config)
- Integration tests for pipelines (end-to-end flows)
- Daemon tested via integration; UI mocked at higher levels

### Testing Strategy

**Framework:** Vitest (v4.0+)
- Environment: Node.js
- Parallel execution: 4–8 threads (CPU-aware)
- Test files: `tests/**/*.test.ts`
- Setup: `tests/setup.ts` (shared fixtures)

**Coverage Thresholds:**
- Branches: 75%
- Functions: 75%
- Lines: 75%
- Statements: 75%

**Exclusions (intentional):**
- `src/daemon/**` (integration/manual tested)
- `src/content/transcript/providers/twitter-cookies-*.ts` (OS integration)
- Barrel files (`index.ts`, `types.ts`, `deps.ts`) and type-only modules

**Test Categories:**
- **Live tests** (`tests/live/`): real network + API calls (conditional CI)
- **Unit tests**: logic, parsing, formatting
- **Integration tests**: full pipelines (content extraction, summarization)
- **Snapshot tests**: markdown rendering, prompt formatting

**Running Tests:**
- `pnpm test` — run all
- `pnpm test:coverage` — with coverage report
- `pnpm test:coverage:build` — rebuild + coverage (CI gate)

### Git Workflow

**Branching:**
- Branches are ad-hoc; no formal strategy
- Multiple agents often work in parallel
- Focus on keeping the main branch stable

**Commit Conventions (Conventional Commits):**
Format: `committer "type: message" <files...>`

Examples:
- `feat: add support for Spotify podcast transcripts`
- `fix: handle timeout in Firecrawl extraction`
- `refactor: consolidate transcript providers`
- `docs: update YouTube handling section`
- `test: add integration test for PDF extraction`
- `perf: optimize tokenization caching`
- `chore: bump dependencies`

**Release Workflow:**
- Versioning: lockstep (core + CLI same version)
- Publish order: core first, then CLI
- Artifacts: npm package + Bun binary (macOS arm64) + Chrome extension
- Homebrew tap update required for binary distribution
- Manual process documented in `RELEASING.md` (no automated CI publish)

## Domain Context

**Content Types:**
- Web pages (HTTP/HTTPS with readability)
- PDFs (provider-dependent; Google most reliable)
- Images (JPEG, PNG, WebP, GIF; provider-dependent)
- Audio/Video (transcription via Whisper or cloud)
- YouTube (playlist + video; transcript-first)
- Podcasts (Apple, Spotify, Amazon Music, Podbean, Podchaser, RSS)
- Media files (local: MP4, MP3, etc.)

**LLM Provider Landscape:**
- OpenAI (`openai/*`)
- Anthropic (`anthropic/*`)
- Google Gemini (`google/*`)
- xAI Grok (`xai/*`)
- Z.AI (`zai/*`)
- OpenRouter (multi-provider gateway with free tier)
- Local OpenAI-compatible endpoints

**Key Integrations:**
- Firecrawl (website extraction fallback)
- yt-dlp (YouTube audio)
- Whisper (local `whisper.cpp` or cloud OpenAI/FAL)
- Apify (YouTube transcript scraping)
- Readability.js (HTML → clean text)
- markitdown (PDF/Office extraction via Python)

**Streaming & Real-time Features:**
- Markdown streaming to TTY
- OSC-based progress protocol (osc-progress)
- Daemon WebSocket for Chrome extension
- Scrollback-safe formatting (avoids OSC 8 in some contexts)

## Important Constraints

**Hard Rules:**
- Single source of truth: `~/Projects/summarize` (never commit in `vendor/summarize`)
- Node.js 22+
- Lockstep versioning: core + CLI must always match
- pnpm required (workspace features)

**Technical Constraints:**
- Text inputs capped at 10 MB (enforced before tokenization)
- Model input limits validated against LiteLLM catalog (cached locally)
- Some models don't support streaming (auto-detected + fallback)
- Some models don't support certain media types (fail fast with error)
- xAI models lack generic file attachment support (PDFs, etc.)

**Provider Constraints:**
- Model IDs must follow `<provider>/<model>` format
- OpenAI-compatible endpoints require explicit base URL (or standard inferred)
- OpenRouter free tier has rate limits + model availability varies
- Free model preset (`--model free`) requires periodic refresh (`refresh-free`)

**Daemon & Extension:**
- Localhost-only (security; no remote daemon access)
- Shared token required (extension → daemon auth)
- Auto-restart: launchd (macOS), systemd (Linux), Task Scheduler (Windows)
- Only runs when Side Panel is open (efficiency)

**Browser/OS:**
- Chrome/Chromium only (Manifest v3)
- macOS arm64 Bun binary (native distribution)
- Linux/Windows: npm global install or pnpm dev mode

## External Dependencies

**APIs & Services:**
- OpenAI Whisper (audio transcription)
- FAL AI (Whisper fallback)
- Apify (YouTube transcript scraping)
- Firecrawl (website extraction)
- OpenRouter (multi-model gateway)
- LiteLLM model catalog (model limits)

**Environment Variables (all optional unless using that provider):**
- `OPENAI_API_KEY` (OpenAI models + Whisper transcription)
- `ANTHROPIC_API_KEY` (Anthropic Claude)
- `GEMINI_API_KEY` (Google Gemini)
- `XAI_API_KEY` (xAI Grok)
- `Z_AI_API_KEY` or `ZAI_API_KEY` (Z.AI)
- `OPENROUTER_API_KEY` (OpenRouter multi-provider)
- `FIRECRAWL_API_KEY` (website extraction fallback)
- `YT_DLP_PATH` (YouTube audio extraction binary)
- `FAL_KEY` (FAL AI Whisper)
- `APIFY_API_TOKEN` (YouTube transcript scraping)
- `OPENAI_BASE_URL` (custom OpenAI-compatible endpoint)
- `Z_AI_BASE_URL` (Z.AI endpoint override)
- `SUMMARIZE_WHISPER_CPP_MODEL_PATH` (local whisper.cpp model)
- `SUMMARIZE_WHISPER_CPP_BINARY` (local whisper.cpp binary)
- `SUMMARIZE_DISABLE_LOCAL_WHISPER_CPP` (disable local, force remote)

**Build & Deployment:**
- GitHub Actions (CI/CD)
- Homebrew tap (`steipete/tap/summarize`)
- npm registry

**Cache & Storage:**
- `~/.summarize/config.json` (config)
- `~/.summarize/cache/` (model limits, media cache)
- `~/.summarize/logs/daemon.{out,err}.log` (daemon logs)
