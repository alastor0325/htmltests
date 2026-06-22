# Bug 2049301 — seek-to-first-frame latency (Firefox vs Chrome)

Measures `video.currentTime =` seek latency for a buffered ±10 s seek, on a
direct progressive MP4 and on an MSE-appended fragmented MP4. Open the page in
Firefox and in Chrome and compare.

**Live page:** https://alastor0325.github.io/htmltests/bug_tests/bug2049301/seek-test.html

Click **Run measurement** (or append `?auto=1` to auto-run). Two result tables
are shown:

- **seeked (ms)** — primary metric: time from issuing the seek to the `seeked`
  event (decode reached the target frame).
- **firstFrame (ms)** — time until `requestVideoFrameCallback` reports a
  presented frame at/after the target (best-effort).
- **waiting (ms)** — time to the `waiting` event if one fired.

The **Direct progressive MP4** case is the clean control from the bug report
(no MSE/site complexity). The gap reproduces on macOS (VideoToolbox hardware
decode); on Linux/software decode Firefox is equal to or faster than Chrome.

## Files

- `seek-test.html` — the harness (committed media, runs as-is)
- `direct.mp4` — 40 s, 1280x720@60, H.264 High, 2 s GOP, AAC
- `frag.mp4` — fragmented copy of the above for the MSE path
- `make-media.sh` — regenerates the two clips with ffmpeg (only needed to change them)
