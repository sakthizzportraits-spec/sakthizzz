# SastraMap PWA + Campus Analytics kit

This folder turns `SastraMap_Done.html` into an **installable, offline-capable Progressive Web App**
and adds a **privacy-first telemetry layer** (`CampusAnalytics`) that, in this build, only writes
to the browser console.

It does not contain the map itself. You run `build_pwa.py` on your copy of the map and deploy the
folder it writes.

```
pwa/
  build_pwa.py              injects the blocks, amends the CSP, writes a deployable folder
  make_icons.py             regenerates icons/ from the map's golden "SU" boot crest
  icons/                    192, 512, maskable 512, apple-touch 180, favicon 32 (PNG)
  src/head-pwa.html         <head> block: theme-color, apple-* tags, manifest + icon links
  src/manifest.webmanifest  install metadata (name, icons, standalone display, colours)
  src/sw.js                 service worker template (VERSION filled in by the build)
  src/campus-analytics.html <script> block: CampusAnalytics + its hooks          (markers TEL1)
  src/pwa-shell.html        <script> block: SW registration, install chip, notices (markers PWA1)
  test/pwa_e2e.js           Playwright test: boot, install, telemetry, dead-zone reload
```

## 1. Build and deploy

```bash
python3 pwa/build_pwa.py SastraMap_Done.html            # writes pwa/dist/
cd pwa/dist && python3 -m http.server 8080              # try it: http://localhost:8080/
```

`pwa/dist/` contains `index.html` (the patched map), `sw.js`, `manifest.webmanifest` and `icons/`.
Upload **the whole folder** to one directory on an **HTTPS** host, for example a SASTRA web server at
`https://maps.sastra.edu/campus/`, or GitHub Pages or Netlify. Service workers only run on HTTPS or
`http://localhost`. On `file://` the map still works exactly as before; it just is not installable
or offline-capable.

Rules for the host:

| File | Cache-Control | Why |
|---|---|---|
| `index.html`, `sw.js` | `no-cache` (revalidate) | The browser must see a new `sw.js` to update. Revalidation with an ETag or Last-Modified costs a 304, not 4.5 MB. |
| `manifest.webmanifest` | `no-cache` | Serve as `application/manifest+json`. |
| `icons/*` | long max-age is fine | |

- Keep the page, `sw.js` and the manifest in **one directory** (the service-worker scope). Any other
  HTML placed in the same directory would receive the map when navigated to offline.
- **Always deploy `index.html` and the `sw.js` the build wrote with it together.** `sw.js` carries
  `VERSION = buildStamp.sha256(index.html + worker)[:12]`. A new page produces a byte-different `sw.js`, which
  is how every installed copy learns there is an update.
- Visitors should get a **Final (viewer) build**. Export it from the World Editor
  (`SastraMap_Final.html`) and run the build on that file. The Dev build mounts the editor on desktop
  and auto-saves to localStorage.
- Re-running the build on an already patched file replaces the marked blocks. It never stacks them.

## 2. What was injected, and where

The build makes exactly four edits. Every added block is marked (`PWA1`, `TEL1`) so later agents can
find it with grep.

1. **CSP** (line 14): `worker-src 'none'` becomes `worker-src 'self'`, and `manifest-src 'self'` is
   added. Nothing else changes. `connect-src 'none'` stays, so the page still cannot send data
   anywhere: telemetry is console-only by construction.
2. **`<head>`**, directly after the viewport meta: `src/head-pwa.html`, which adds `theme-color
   #000000`, `mobile-web-app-capable`, `apple-mobile-web-app-capable`, status-bar style `black`,
   `apple-mobile-web-app-title`, the manifest link, the favicon and the apple-touch-icon.
3. **Two `<script>` blocks** after the last module (GLASS SETTINGS) and before `#sathizz-map-data`:
   `src/campus-analytics.html`, then `src/pwa-shell.html`.
4. **`exportHTML()` strip list**: `#pwaCSS, #pwaChip` are added, so a World-Editor export never bakes
   a stale install chip.

Both scripts come *after* the host engine, so the texture cache key for host painters (a hash of
every script up to the host script) does not change. Returning visitors keep their cached textures.

### Why the manifest and service worker are files, not data: URIs

- A service worker **must** be a same-origin `http(s)` script. `data:` and `blob:` URLs are rejected
  by `register()`. So offline support needs a real `sw.js` next to the page whatever you do.
- Browsers resolve `start_url`, `scope` and icon paths against the manifest's own URL, which a
  `data:` URL cannot provide, and Android's install and update checks work from a manifest URL they
  can fetch again. With `sw.js` already a file, a `manifest.webmanifest` beside it costs nothing and
  is the reliable choice.

## 3. How offline works

Everything the map needs to run is **inside the one HTML document**: three.js r128, the engine, the
CSS UI, the embedded JSON layout, the card dictionary, the road graph (`ROAD_NET`) and both A*
routers. So the service worker caches that one response.

| Request | Strategy |
|---|---|
| Navigation to the page (any `?query` or `#hash`) | **Cache first**, network only if nothing is cached yet |
| `manifest.webmanifest`, `icons/*` | Pre-cached at install (best effort), then cache first |
| Other same-origin files in the folder (e.g. the optional `images/velaa_logo.jpg`, which the map replaces with a painted sign when absent) | Cache first; kept after the first successful fetch |
| `fonts.googleapis.com` stylesheet | Stale-while-revalidate |
| `fonts.gstatic.com` font files | Cache first. The install step pre-fetches every file the stylesheet names |
| Anything else | Not handled (the page CSP forbids it anyway) |

In a dead zone the map therefore boots, draws the 3D campus, routes with both A* routers (grid
navmesh and road graph) and shows the GPS blue dot. GPS itself needs no data connection. Once
the map's own IndexedDB texture cache has finished saving (it writes in idle time after a visit),
an offline boot also skips repainting the textures; until then it repaints them, exactly as an
online first visit does. The only thing that can be missing offline is a web font that has never
been fetched; the UI then falls back to system fonts.

`navigator.onLine` stays `true` when the phone has Wi-Fi but the Wi-Fi has no internet, a common
campus dead zone. The worker does not care: the shell is served from the cache either way.

**Updates.** The browser re-checks `sw.js` on each launch (`updateViaCache: 'none'`). When it
changed, the new worker pre-caches the new page, activates, deletes the old shell cache, and the
page shows "Map updated — reopen it to use the new version". First install shows "Campus map saved
— it now works offline". Going offline or online also shows a notice. All notices use the host's
own `toast()`, so no new DOM is added.

**Storage.** An installed copy calls `navigator.storage.persist()` (Chrome and Safari grant or
refuse this silently), which protects the service-worker cache and the up-to-192 MB texture cache
from eviction.

### It never delays `init()` or the render loop

- Nothing in the two blocks runs during parse except adding event listeners, and neither block has
  per-frame code.
- `register()` is armed on `campus:ready`, then waits **4 s plus an idle slot**, so it cannot compete
  with the shader link, the World-Editor rebuild or the governor's first measured frames. The worker
  installs on its own thread.
- A fallback registers 90 s after `load` if the boot never releases (no WebGL).
- The install chip appears 25 s after `campus:ready`.

Measured in headless Chromium (see §7): the PWA build and the original reach `campus:ready` in
comparable times, and the worker registers after `campus:ready`.

## 4. Installing

| Platform | What the visitor sees |
|---|---|
| Android (Chrome, Edge, Samsung Internet) | 25 s after the map is ready, a glass chip: **Install SASTRA Map** with an **Install** button, which opens the browser's install dialog through `beforeinstallprompt`. "×" hides the chip for 30 days. Chrome's menu item "Install app" always works too. |
| iOS / iPadOS Safari | Safari has no install prompt, so the chip explains: Share, then **Add to Home Screen**. The apple-* tags supply the title, icon and full-screen launch. |
| Desktop Chrome / Edge | The browser's own install icon in the address bar. No chip. |

Launched from the home screen, the map opens in `standalone` mode, with no URL bar or browser UI,
on a black status bar. The status bar is `black` rather than `black-translucent` because the HUD is
positioned from the top edge. If you want the canvas to run under the status bar, switch the meta to
`black-translucent` and add `env(safe-area-inset-top)` to `#brand`, `#viewbar`, `#toast` and the
search bar.

Console API: `SastraPWA.state()`, `SastraPWA.install()`, `SastraPWA.update()`,
`SastraPWA.showHint()`, `SastraPWA.unregister()` (removes the worker and its caches).
`?sw=0` skips registration for one visit.

## 5. CampusAnalytics

`window.campusAnalytics` is the live recorder and `window.CampusAnalytics` is the class.

| Hook | Fired by | `data` |
|---|---|---|
| `onSearchQuery(term, meta)` | Enter or a result click in `#axSearchIn`; a query that settles 1.5 s with **no results** | `term`, `results`, `chosen`, `via` (`enter`, `pick` or `typing`) |
| `onRouteGenerated(startNode, endNode, metres, meta)` | The card's road route (`sastra:route`, once per trip, not per GPS re-plan) and the Route button's grid router (by wrapping the global `nmRouteBuildings`) | `start`, `end`, `metres`, `minutes`, `router` (`road` or `grid`), `startKind` (`gate`, `gps`, `manual` or `building`), `startVertex`, `endKey`, `path` (road-graph node ids), `partial` |
| `onPOIToggled(type, on)` | `aria-pressed` on the Food / Restrooms / ATM / Bus / Parking pills | `poi`, `state` |
| `onBuildingViewed(key, name)` | `sastra:card` open | `key`, `name` |
| `onAppLaunch()` | once, at `campus:ready` | `bootMs` (plus `ctx.display` / `ctx.online`) |

Every event has the same envelope:

```json
{"v":1,"type":"route_generated","t":"2026-09-27T08:15:00Z","seq":7,"sid":"9f3c1a0b5e22d4c8",
 "ctx":{"display":"standalone","online":false,"tier":"low","lang":"en-IN","build":"Bmuds6ios-9kbp"},
 "data":{"start":"Main Gate","end":"JVC","metres":452,"minutes":6,"router":"road","startKind":"gate",
         "startVertex":null,"endKey":"jvc","path":[5,0,1,51,50,48,44,45,53,54],"partial":false}}
```

and the console sink prints a readable line followed by that JSON:

```
[TELEMETRY] Route generated: Main Gate to JVC - 452m
{"v":1,"type":"route_generated",...}
```

### Privacy by design

- **No identifiers that outlive the page.** No cookies. The session id is 64 random bits from
  `crypto.getRandomValues`, kept in memory for one page load. (`Math.random` is the map's *seeded*
  world stream, so it would give every visitor the same id.)
- **No location traces.** No raw GPS coordinates are recorded. A GPS-started route reports
  "your location" and the road-graph vertex it snapped to.
- **Minimal text.** Search terms are trimmed, capped at 48 characters, and e-mail addresses or long
  digit runs (phone or roll numbers) are replaced with `[email]` / `[number]`.
- **Coarse time.** Timestamps are rounded to the minute. No user agent, no IP (nothing is sent).
- **Consent signals win.** Global Privacy Control or Do Not Track, `campusAnalytics.optOut()`, or
  `localStorage['sastra.telemetry'] = 'off'` stop recording. `?telemetry=0` disables it for one
  visit and `?telemetry=1` forces it on for demos.
- **Enforced by the browser.** `connect-src 'none'` means this build cannot transmit anything even if
  code tried to.

`campusAnalytics.export()` returns the in-memory buffer (last 500 events) as JSON, which is useful
for demos.

## 6. Connecting a real backend (SASTRA server or Firebase)

Nothing below is enabled. It is the path from console logs to a foot-traffic heatmap for the VC.

**Step 1: allow exactly one endpoint.** In the CSP meta, change `connect-src 'none'` to
`connect-src https://telemetry.sastra.edu` (or your Cloud Function URL). Nothing else opens up.

**Step 2: add a batching sink with an offline queue.** Append a small block after TEL1:

```js
<script>
(function () {
  var URL_ = 'https://telemetry.sastra.edu/v1/events', KEY = 'sastra.telemetry.queue', MAX = 300;
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function save(q) { try { localStorage.setItem(KEY, JSON.stringify(q.slice(-MAX))); } catch (e) {} }
  function flush() {
    var q = load();
    if (!q.length || !navigator.onLine) return;
    var body = JSON.stringify({ events: q });
    var sent = navigator.sendBeacon ? navigator.sendBeacon(URL_, new Blob([body], { type: 'application/json' })) : false;
    if (sent) save([]);            /* sendBeacon queued it; the browser delivers it even if the tab closes */
  }
  campusAnalytics.addSink(function (evt) { var q = load(); q.push(evt); save(q); if (q.length >= 20) flush(); });
  addEventListener('online', flush);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
})();
</script>
```

Events recorded in a dead zone wait in the queue and go out on the next `online` or tab hide.

**Step 3, option A: SASTRA server.** Accept `POST /v1/events` (JSON, at most 64 KB, no cookies)
and write each event as one row: `(t, sid, type, data jsonb, ctx jsonb)` in PostgreSQL. Do not
store the client IP. Run nightly aggregation into tables such as `edge_counts(date, hour, a, b,
routes)`, `building_views(date, hour, key, views)` and `search_misses(date, term, n)`, then delete the
raw rows after 30 days.

**Step 3, option B: Firebase.** Use an **HTTPS Cloud Function** as the endpoint. It validates the
batch and writes to Firestore (or streams into BigQuery for large volumes). Do **not** add the Firebase
JavaScript SDK to the page: it is an external script (blocked by the CSP and against the one-file
design), and the sink above only needs one `POST`. Aggregate with scheduled functions exactly as
in option A.

**Step 4: build the heatmaps for the VC.**

- **Foot traffic along roads.** Each `route_generated` event carries `path`, the chain of
  `ROAD_NET` node ids it walked. Count every consecutive pair `(a, b)` as one use of that road
  segment, by hour and day. Drawing the counts on the road graph gives a heatmap of how people move
  between gates, hostels and academic blocks, built from routes people chose, not from tracking them.
- **Destinations.** `building_viewed` counts per building and hour give the "where do people want to
  go" map. The grid router (`router: "grid"`) adds building-to-building pairs.
- **Unmet demand.** `search_query` events with `results: 0` list what visitors look for and cannot
  find: missing labels, aliases or facilities.
- **Showing it.** The simplest option is a dashboard (Grafana, Looker Studio) over the aggregate
  tables. For an in-map view, extend the admin HUD (`?admin=1`) to fetch the day's `edge_counts`
  (allow it in `connect-src`) and tint road segments by count.

**Governance before switching it on.** Under India's Digital Personal Data Protection Act 2023,
treat this as personal data processing. Publish a short notice that states the purpose (campus
wayfinding improvement), keep the opt-out, collect only the fields above, and only release
aggregates where a cell has at least 10 sessions (k-anonymity); suppress smaller cells. Keep raw
events for 30 days at most. Have the university's data protection contact sign off first. This is
engineering guidance, not legal advice.

## 7. Testing

```bash
python3 pwa/build_pwa.py SastraMap_Done.html                        # syntax-checks all 26 scripts + sw.js
NODE_PATH=$(npm root -g) node pwa/test/pwa_e2e.js pwa/dist 8123     # full end-to-end run
```

The test boots the map in headless Chromium, waits for the worker, checks installability through the
DevTools protocol, drives search, POI pins, a card route and the grid Route button, then **kills the
web server** and reloads to confirm the page comes from the service worker and routes offline. See
`TEST_RESULTS.md` for the latest run.

On a real phone, use Chrome DevTools > Application (Manifest, Service workers, Cache storage) with
"Offline" ticked, or Safari's Web Inspector for iOS.

## 8. Known limits

- iOS may evict web-app storage of a site that has not been used for weeks. The map then needs one
  online visit to cache again.
- The World Editor's localStorage key includes the page file name, so a Dev build served as `/` and
  as `/index.html` keeps two separate saves. Viewer builds do not use localStorage.
- Route distances follow the map's two scales: `router: "road"` uses 1.13 m per unit and
  `router: "grid"` uses 2.0 m per unit (see the blueprint's known-issues list). Aggregate the two
  separately until the scale is settled.
