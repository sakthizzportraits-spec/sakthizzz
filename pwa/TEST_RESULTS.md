# PWA kit - test results

Run on 27 Sep 2026 with `pwa/test/pwa_e2e.js`: headless Chromium 141.0.7390.37 (Playwright 1.56.1),
WebGL on SwiftShader, the build served by `python3 -m http.server` on localhost, a normal (non-incognito)
browser profile. Boot times are long because WebGL is emulated in software; compare them with each other,
not with a phone.

| Check | Result |
|---|---|
| Boot time, original vs PWA build | `campus:ready` at 81.3 s (original, unmodified) vs 79.9 s, 81.7 s and 84.5 s (three PWA runs). No measurable delay. |
| Service-worker registration | 11.5 s, 20.9 s and 12.6 s **after** `campus:ready` |
| Offline cache | `sastramap-shell-<VERSION>` holds `index.html`; `sastramap-fonts-v1` created |
| Installability | `Page.getInstallabilityErrors`: **none**; manifest errors: none |
| Telemetry | Every hook fired with the expected JSON (log below) |
| Dead zone (web server **killed**) | Reload returned 200 from the service worker; the full scene booted again (6,283 meshes) |
| A* offline | Grid router answered (3 waypoints); road graph planned SOC: 376.9 u, 12 waypoints, 0.6 ms |
| Page exceptions | None |
| Failed requests offline | Google Fonts (unreachable from the sandbox) and `images/velaa_logo.jpg` (requested by the original map too, never shipped; the map paints a sign instead) |

Not verified here (need physical devices): the Android install prompt and chip, iOS Safari "Add to Home Screen",
standalone display, and GPS on campus.

Observations about the original map (unchanged by this kit):

- The Route button's grid router returns 16 m between JVC and Vidyut Vihar, far shorter than the buildings'
  separation. Its endpoints snap from the survey footprints, which no longer match where those buildings were
  moved in the editor. The road route from the card is unaffected.
- The texture cache had saved only 5 of 228 textures when the dead-zone step ran (it writes in idle time, which a
  continuously rendering headless browser rarely gives it), so the offline boot repainted them.

## Console log of the final run

```
[1.0s] online load http://localhost:8127/index.html
[92.0s] campus:ready {"readyAt":79879,"gl":true}
[107.7s] PWA {"state":{"supported":true,"secure":true,"state":"registered","error":null,"version":"Bmuds6ios-9kbp.e122b18ffd62","registeredAt":91373,"offlineReady":true,"updated":false,"controlled":true,"standalone":false,"installable":false,"chip":"none","online":true,"bootReadyAt":79879},"caches":["sastramap-shell-Bmuds6ios-9kbp.e122b18ffd62","sastramap-fonts-v1"],"shellCached":true}
[107.7s] installability errors: [] | manifest errors: []
[141.7s] grid route {"lastLen":8,"expanded":8}
[141.7s] TELEMETRY (online):
  [TELEMETRY] App launched: browser, online
{"v":1,"type":"app_launch","t":"2026-09-27T08:29:00Z","seq":1,"sid":"36515ebaf4ae3c51","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"bootMs":79879}}
  [TELEMETRY] Search: "library" → Library SASTRA (1 result)
{"v":1,"type":"search_query","t":"2026-09-27T08:30:00Z","seq":2,"sid":"36515ebaf4ae3c51","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"term":"library","results":1,"chosen":"Library SASTRA","chosenKey":"library","via":"enter"}}
  [TELEMETRY] Building viewed: Library SASTRA
{"v":1,"type":"building_viewed","t":"2026-09-27T08:30:00Z","seq":3,"sid":"36515ebaf4ae3c51","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"key":"library","name":"Library SASTRA"}}
  [TELEMETRY] Route generated: Main Gate to Library SASTRA - 442m
{"v":1,"type":"route_generated","t":"2026-09-27T08:30:00Z","seq":4,"sid":"36515ebaf4ae3c51","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"start":"Main Gate","end":"Library SASTRA","metres":442,"minutes":6,"router":"road","startKind":"gate","startVertex":null,"endKey":"library","path":[1,2,3,49,94,96,112,152,113,117],"partial":false}}
  [TELEMETRY] Search: "swimming pool" - no results
{"v":1,"type":"search_query","t":"2026-09-27T08:30:00Z","seq":5,"sid":"36515ebaf4ae3c51","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"term":"swimming pool","results":0,"chosen":null,"chosenKey":null,"via":"typing"}}
  [TELEMETRY] POI toggled: food ON
{"v":1,"type":"poi_toggled","t":"2026-09-27T08:30:00Z","seq":6,"sid":"36515ebaf4ae3c51","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"poi":"food","state":"on"}}
  [TELEMETRY] POI toggled: food OFF
{"v":1,"type":"poi_toggled","t":"2026-09-27T08:30:00Z","seq":7,"sid":"36515ebaf4ae3c51","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"poi":"food","state":"off"}}
  [TELEMETRY] POI toggled: atm ON
{"v":1,"type":"poi_toggled","t":"2026-09-27T08:30:00Z","seq":8,"sid":"36515ebaf4ae3c51","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"poi":"atm","state":"on"}}
  [TELEMETRY] Building viewed: JVC
{"v":1,"type":"building_viewed","t":"2026-09-27T08:30:00Z","seq":9,"sid":"36515ebaf4ae3c51","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"key":"jvc","name":"JVC"}}
  [TELEMETRY] Route generated: JVC - Jiva Chaitanya & Jana Chaitanya to Vidyut Vihar - 16m
{"v":1,"type":"route_generated","t":"2026-09-27T08:30:00Z","seq":10,"sid":"36515ebaf4ae3c51","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"start":"JVC - Jiva Chaitanya & Jana Chaitanya","end":"Vidyut Vihar","metres":16,"minutes":null,"router":"grid","startKind":"building","startVertex":null,"endKey":null,"path":null,"partial":false}}
  [TELEMETRY] Route generated: Main Gate to JVC - 321m
{"v":1,"type":"route_generated","t":"2026-09-27T08:30:00Z","seq":11,"sid":"36515ebaf4ae3c51","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"start":"Main Gate","end":"JVC","metres":321,"minutes":4,"router":"road","startKind":"gate","startVertex":null,"endKey":"jvc","path":[51,50,48,44,45,53,54,55,56,57,58,59,60,61,62,66,78],"partial":false}}
[159.6s] texture cache before the dead zone: {"rows":0,"recorded":228,"written":5,"writtenMB":1.05,"skipped":{"cheap":124,"font":26}}
[160.1s] server killed; reloading
[166.5s] reload status 200 fromServiceWorker true
[262.0s] OFFLINE boot 101.9s {"readyAt":85552,"grid":{"metres":16,"waypoints":3,"partial":false},"road":{"length":376.89,"waypoints":12,"ms":0.6},"texHits":0,"meshes":6283,"online":true}
[267.0s] TELEMETRY (offline):
  [TELEMETRY] App launched: browser, online
{"v":1,"type":"app_launch","t":"2026-09-27T08:32:00Z","seq":1,"sid":"312f816f56831e0d","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"bootMs":85552}}
  [TELEMETRY] Building viewed: JVC
{"v":1,"type":"building_viewed","t":"2026-09-27T08:32:00Z","seq":2,"sid":"312f816f56831e0d","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"key":"jvc","name":"JVC"}}
  [TELEMETRY] Route generated: JVC - Jiva Chaitanya & Jana Chaitanya to Vidyut Vihar - 16m
{"v":1,"type":"route_generated","t":"2026-09-27T08:32:00Z","seq":3,"sid":"312f816f56831e0d","ctx":{"display":"browser","online":true,"tier":"high","lang":"en-US","build":"Bmuds6ios-9kbp"},"data":{"start":"JVC - Jiva Chaitanya & Jana Chaitanya","end":"Vidyut Vihar","metres":16,"minutes":null,"router":"grid","startKind":"building","startVertex":null,"endKey":null,"path":null,"partial":false}}
[267.0s] failed requests while offline: ["https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Noto+Sa","http://localhost:8127/images/velaa_logo.jpg"]
[267.0s] page exceptions: []
[267.0s] console errors (other): ["The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.","X-Frame-Options may only be set via an HTTP header sent along with a document. It may not be set inside <meta>.","Failed to load resource: net::ERR_FAILED","Failed to load resource: the server responded with a status of 404 (File not found)"]
```
