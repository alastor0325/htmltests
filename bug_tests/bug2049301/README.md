# Bug 2049301 — seek-to-first-frame latency (Firefox vs Chrome)

Measures `video.currentTime =` seek latency for a buffered ±10 s seek, across
**three codecs** (H.264 / VP9 / AV1) and **two playback states**. Open the page
in Firefox and in Chrome and compare.

**Live page:** https://alastor0325.github.io/htmltests/bug_tests/bug2049301/seek-test.html

Click **Run measurement** (or append `?auto=1` to auto-run). For each codec a
table reports, for both states:

- **seeked (ms)** — primary metric: time from issuing the seek to the `seeked`
  event (decode reached the target frame).
- **firstFrame (ms)** — time until `requestVideoFrameCallback` reports a
  presented frame at/after the target (best-effort).
- **waiting (ms)** — time to the `waiting` event if one fired.

The two states:

- **Playback seek** — the video is *playing* when the seek is issued, so the
  platform decoder is alive (flushed, not torn down).
- **Dormant seek** — the video is *paused* long enough to go dormant (Firefox
  releases the decoder after `media.dormant-on-pause-timeout-ms`, default 5 s),
  so each seek recreates the decoder. This is the scrubbing-while-paused case,
  where the macOS gap is largest. Other browsers have no dormancy concept, so
  for them this is just a paused seek.

The gap reproduces on macOS (VideoToolbox hardware decode); on Linux/software
decode Firefox is equal to or faster than Chrome.

## Files

- `seek-test.html` — the harness (committed media, runs as-is)
- `h264.mp4` — 40 s, 1280x720@60, H.264 High, 2 s GOP, AAC
- `vp9.webm` — same content, VP9 / Opus
- `av1.mp4` — same content, AV1 / AAC
- `direct.mp4` / `frag.mp4` — H.264 progressive + fragmented copies for the
  older direct/MSE runner
- `make-media.sh` — regenerates the clips with ffmpeg (only needed to change them)
