// Drives webaudio-mediasession.html in a real browser and answers every
// checkpoint automatically. At each checkpoint it records:
//  - hub: Chrome only, whether chrome://media-internals (Audio Focus tab)
//    lists the page's session as Controllable (Global Media Controls).
//  - os: whether macOS Now Playing shows an item from the browser under test,
//    read through MediaRemote by now-playing.js.
// The page is answered with "hub" for Chrome and "os" otherwise.
//
// Serve the htmltests root on 127.0.0.1:8765, then:
//   node run-matrix.js chrome  [path/to/playwright]
//   node run-matrix.js safari  (needs "Allow remote automation" in Safari)
//   node run-matrix.js firefox [path/to/firefox]  (default: Firefox Nightly)
// ONLY=id1,id2 restricts the run to some scenarios.
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BROWSER = process.argv[2] || "chrome";
const PAGE = "http://127.0.0.1:8765/bug_tests/bug2067534/webaudio-mediasession.html";
const SKIP = new Set(["muted-tab"]);
const BUNDLE_PREFIX = { chrome: "com.google.Chrome", safari: "com.apple.Safari", firefox: "org.mozilla." }[BROWSER];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function nowPlaying() {
  const out = execFileSync("osascript", ["-l", "JavaScript", path.join(__dirname, "now-playing.js")]).toString();
  return JSON.parse(out);
}

async function chromeDriver(pwPath) {
  const { chromium } = require(pwPath || "playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  const mi = await context.newPage();
  await mi.goto("chrome://media-internals/#audio-focus");
  await page.bringToFront();
  return {
    version: `Chrome ${browser.version()}`,
    goto: url => page.goto(url),
    click: css => page.click(css),
    eval: expr => page.evaluate(expr),
    hub: async () => {
      await mi.reload();
      await mi.waitForTimeout(300);
      const lines = (await mi.evaluate(() => document.body.innerText)).split("\n");
      const i = lines.findIndex(l => l.includes(PAGE));
      return i < 0 ? "(no session)" : lines[i + 1].trim();
    },
    close: () => browser.close(),
  };
}

// Minimal W3C WebDriver (classic) client for safaridriver.
async function safariDriver() {
  const port = 4445;
  const proc = spawn("safaridriver", ["-p", String(port)], { stdio: "ignore" });
  await sleep(1500);
  const call = async (method, url, body) => {
    const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    const j = await r.json();
    if (j.value && j.value.error) throw new Error(`${j.value.error}: ${j.value.message}`);
    return j.value;
  };
  const s = await call("POST", "/session", { capabilities: { alwaysMatch: { browserName: "safari" } } });
  const sid = `/session/${s.sessionId}`;
  const el = async css => (await call("POST", `${sid}/element`, { using: "css selector", value: css }))["element-6066-11e4-a52f-4a52f4a52f4a"];
  return {
    version: `Safari ${s.capabilities.browserVersion}`,
    goto: url => call("POST", `${sid}/url`, { url }),
    click: async css => call("POST", `${sid}/element/${await el(css)}/click`, {}),
    eval: expr => call("POST", `${sid}/execute/sync`, { script: `return (${expr})`, args: [] }),
    hub: async () => null,
    close: async () => { await call("DELETE", sid).catch(() => {}); proc.kill(); },
  };
}

// Minimal WebDriver BiDi client, talking to Firefox's built-in Remote Agent.
async function firefoxDriver(bin) {
  const port = 9333;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "bug2067534-ff-"));
  const proc = spawn(bin || "/Applications/Firefox Nightly.app/Contents/MacOS/firefox",
    ["--remote-debugging-port", String(port), "--profile", profile, "--no-remote", "--new-instance"], { stdio: "ignore" });
  let ws;
  for (let i = 0; i < 50 && !ws; i++) {
    await sleep(300);
    try {
      ws = await new Promise((res, rej) => {
        const w = new WebSocket(`ws://127.0.0.1:${port}/session`);
        w.onopen = () => res(w);
        w.onerror = rej;
      });
    } catch {}
  }
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.type === "error" ? rej(new Error(`${m.error}: ${m.message}`)) : res(m.result);
    }
  };
  const send = (method, params) => new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const session = await send("session.new", { capabilities: {} });
  const tree = await send("browsingContext.getTree", {});
  const context = tree.contexts[0].context;
  const evaluate = async expr => {
    const r = await send("script.evaluate", { expression: expr, target: { context }, awaitPromise: true, serializationOptions: { maxObjectDepth: 10 } });
    return fromRemote(r.result);
  };
  return {
    version: `Firefox ${session.capabilities.browserVersion}`,
    goto: url => send("browsingContext.navigate", { context, url, wait: "complete" }),
    click: async css => {
      const r = await send("script.evaluate", { expression: `(e => (e.scrollIntoView({ block: "center" }), e))(document.querySelector(${JSON.stringify(css)}))`, target: { context }, awaitPromise: false });
      const origin = { type: "element", element: { sharedId: r.result.sharedId } };
      await send("input.performActions", { context, actions: [{ type: "pointer", id: "mouse", actions: [
        { type: "pointerMove", x: 0, y: 0, origin }, { type: "pointerDown", button: 0 }, { type: "pointerUp", button: 0 }] }] });
    },
    eval: evaluate,
    hub: async () => null,
    close: async () => { await send("session.end", {}).catch(() => {}); proc.kill(); },
  };
}

// Converts a WebDriver BiDi remote value into a plain JS value.
function fromRemote(v) {
  switch (v.type) {
    case "undefined": case "null": return null;
    case "string": case "number": case "boolean": return v.value;
    case "array": return v.value.map(fromRemote);
    case "object": return Object.fromEntries(v.value.map(([k, x]) => [typeof k === "string" ? k : fromRemote(k), fromRemote(x)]));
    default: return v.value;
  }
}

(async () => {
  const d = BROWSER === "safari" ? await safariDriver()
    : BROWSER === "firefox" ? await firefoxDriver(process.argv[3])
    : await chromeDriver(process.argv[3]);
  await d.goto(PAGE);
  await d.eval("localStorage.clear()");
  const scenarios = await d.eval("window.testHarness.scenarios()");
  const only = process.env.ONLY && process.env.ONLY.split(",");
  const out = [];
  try {
    for (const s of scenarios) {
      if (SKIP.has(s.id) || (only && !only.includes(s.id))) continue;
      await d.click(`button[data-run="${s.id}"]`);
      const done = new Set();
      while (done.size < s.cps.length) {
        const st = await d.eval("window.testHarness.state()");
        if (!st || st.id !== s.id) break;
        for (let j = 0; j < st.cps.length; j++) {
          if (st.cps[j] === "waiting-action") {
            await d.eval(`window.simulateAction(${JSON.stringify(s.cps[j].after)})`);
          } else if (st.cps[j] === "check" && !done.has(j)) {
            const hubState = await d.hub();
            const np = nowPlaying();
            const osShown = !!np.client && np.client.startsWith(BUNDLE_PREFIX) && !!np.item;
            const hub = hubState === null ? null : hubState.includes("Controllable");
            const shown = BROWSER === "chrome" ? hub : osShown;
            await d.eval(`window.testHarness.answer(${j}, ${JSON.stringify(shown ? "Yes" : "No")})`);
            done.add(j);
            out.push({ id: s.id, checkpoint: s.cps[j].q, hub, os: osShown, osClient: np.client, osPlaying: np.playing, hubState });
            console.log(`${s.id} | ${s.cps[j].q} | hub ${hub} | os ${osShown} (${np.client || "-"}, playing ${np.playing}) | ${hubState || ""}`);
          }
        }
        await sleep(150);
      }
      await sleep(800);
    }
  } finally {
    console.log(`VERSION ${d.version}`);
    console.log("JSON " + JSON.stringify(out));
    await d.close();
  }
})();
