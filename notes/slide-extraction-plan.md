# Slide Extraction Performance Plan

Goal: Make slide extraction fast and reliable without relying on minimum slide counts. The user indicates the video has slides, so we should calibrate sensitivity rather than guess.

## Strategy
1) ROI first (optional, LLM-assisted)
   - Sample 5–10 frames across the video.
   - Ask LLM for a stable slide region (crop) and validate bounds.
   - Use ROI for calibration + detection when available.

2) Sensitivity calibration from samples
   - Compute frame-to-frame change magnitude on sampled frames (hash diff).
   - Derive a single FFmpeg `scene` threshold from the diff distribution.
   - Avoid fixed minimum slide counts.

3) Single-pass detection with fallback floor
   - Run FFmpeg scene detection once using calibrated threshold on ROI.
   - If detection yields zero scenes, retry once with a lower threshold floor.

4) Low-res detect, high-res extract
   - Use low-res stream for detection to keep it fast.
   - Once timestamps are known, download higher-res for extraction frames.

5) Parallelism
   - Scene detection: segment the timeline and run multiple FFmpeg processes in parallel.
   - Frame extraction + OCR: run with a worker pool.

## Success Criteria
- Performance: near 10× speedup on gEbbGyNkR2U vs baseline.
- Quality: slide count comparable to baseline (no 3-slide regression).
- Robustness: works with/without ROI; no minimum slide count heuristics.

## Config knobs
- `SUMMARIZE_SLIDES_WORKERS` (default 8)
- `SUMMARIZE_SLIDES_YTDLP_FORMAT` (detection format)
- `SUMMARIZE_SLIDES_YTDLP_FORMAT_EXTRACT` (extraction format)
