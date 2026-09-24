# Bug 2067534: does Web Audio activate the platform media controls?

`webaudio-mediasession.html` runs pages that play audio only through the Web
Audio API, each with a different `navigator.mediaSession` /
`navigator.audioSession` setup, and compares Chrome, Safari and Firefox.
Click **Run** on a row to start it; the previous scenario stops. **Stop**
ends the current one. Each scenario runs in a fresh same-origin iframe, so no
Media Session state carries over between rows. Row 1 is a control that uses an
`<audio>` element to confirm the platform controls can be observed at all.

## Automated runs (macOS)

`run-matrix.js` drives a real browser and answers each checkpoint from macOS
Now Playing (read by `now-playing.js` through MediaRemote). For Chrome it
also reads `chrome://media-internals` (Audio Focus tab) for the Global Media
Controls state.

```
python3 -m http.server 8765 --bind 127.0.0.1   # from the htmltests root
node bug_tests/bug2067534/run-matrix.js chrome [path/to/playwright]
node bug_tests/bug2067534/run-matrix.js firefox [path/to/firefox]   # default: Firefox Nightly, WebDriver BiDi
node bug_tests/bug2067534/run-matrix.js safari  # needs Safari > Settings > Developer > Allow remote automation
```

`ONLY=id1,id2` limits a run to some scenarios. Pause checkpoints call the
page's pause handler code directly instead of pressing a platform button.
