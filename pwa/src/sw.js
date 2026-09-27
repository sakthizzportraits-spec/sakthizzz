/* =========================================================================
   SASTRA MAP - SERVICE WORKER  (markers PWA1)

   WHAT  Keeps the whole campus map on the device so it opens and routes in
         a network dead zone. The map is ONE document: three.js r128, the
         engine, every procedural texture painter, the CSS UI, the JSON
         layout payload and the A* road graph are all inline in it. So
         caching that one response caches all of them, and the A* routers,
         the 3D geometry and the GPS dot need nothing else. The only
         network assets are the Google Fonts (cached here when reachable;
         without them the UI falls back to system fonts) and the icons and
         manifest.

   HOW   install   fetch the shell with a conditional GET (a 304 reuses the
                   HTTP-cached copy, so a first visit does not download the
                   4.5 MB page twice) and put it in a cache named after
                   VERSION. Icons, manifest and fonts are best-effort.
         fetch     navigations inside the scope: cache first, network only
                   when the cache is empty. Fonts: stale-while-revalidate
                   for the stylesheet, cache-first for the font files.
         activate  delete older shell caches, take control of open pages
                   and tell them (the page shows "saved for offline use" or
                   "update ready").

   UPDATES are atomic: build_pwa.py writes VERSION = buildStamp + a hash of
   index.html and this worker, so a new page means a byte-different sw.js, which the
   browser picks up on the next navigation (updateViaCache: 'none').
   Never deploy a new index.html without the sw.js the build wrote with it.
   ========================================================================= */
'use strict';

const VERSION = '__VERSION__';
const SHELL_NAME = '__SHELL__';
const FONT_CSS = '__FONT_CSS__';

const SHELL_CACHE = 'sastramap-shell-' + VERSION;
const FONT_CACHE = 'sastramap-fonts-v1';
const SCOPE = self.registration.scope;                 /* ends with '/' */
const SCOPE_PATH = new URL(SCOPE).pathname;
const SHELL_URL = new URL(SHELL_NAME, SCOPE).href;
const OPTIONAL = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
                  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png']
                 .map(function (p) { return new URL(p, SCOPE).href; });

/* ------------------------------------------------------------------ install */
self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(SHELL_CACHE);
    const res = await fetch(new Request(SHELL_URL, { cache: 'no-cache' }));
    const type = res.headers.get('content-type') || '';
    if (!res.ok || res.type !== 'basic' || type.indexOf('text/html') < 0) {
      throw new Error('shell not cacheable: ' + res.status + ' ' + type);   /* install fails, retried later */
    }
    await cache.put(SHELL_URL, res);
    await Promise.all(OPTIONAL.map(function (u) {
      return fetch(new Request(u, { cache: 'no-cache' }))
        .then(function (r) { return r.ok ? cache.put(u, r) : null; })
        .catch(function () { /* optional */ });
    }));
    await warmFonts();
    await self.skipWaiting();                          /* one document, no lazy chunks: safe to swap */
  })());
});

/* The stylesheet varies by browser (it names woff2 files for this engine),
   so it is fetched from here - same user agent - and every font file it
   names is cached. Offline at install time: skipped, retried at runtime. */
async function warmFonts() {
  if (!FONT_CSS || FONT_CSS.indexOf('https://') !== 0) return;
  try {
    const cache = await caches.open(FONT_CACHE);
    const css = await fetch(FONT_CSS, { mode: 'cors', credentials: 'omit' });
    if (!css.ok) return;
    const text = await css.clone().text();
    await cache.put(FONT_CSS, css);
    const urls = Array.from(new Set(text.match(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g) || []));
    await Promise.all(urls.map(function (u) {
      return cache.match(u, { ignoreVary: true }).then(function (hit) {
        return hit || fetch(u, { mode: 'cors', credentials: 'omit' })
          .then(function (r) { return r.ok ? cache.put(u, r) : null; });
      }).catch(function () { /* one font missing: that face falls back */ });
    }));
  } catch (e) { /* no network at install: fonts are cached on first online use */ }
}

/* ----------------------------------------------------------------- activate */
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) {
      return k.indexOf('sastramap-shell-') === 0 && k !== SHELL_CACHE;
    }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
    const wins = await self.clients.matchAll({ type: 'window' });
    wins.forEach(function (c) { c.postMessage({ type: 'sastra-sw', event: 'activated', version: VERSION }); });
  })());
});

self.addEventListener('message', function (event) {
  const d = event.data || {};
  if (d.type === 'sastra-sw' && d.ask === 'version' && event.source) {
    event.source.postMessage({ type: 'sastra-sw', event: 'version', version: VERSION });
  }
});

/* -------------------------------------------------------------------- fetch */
function isShellPath(url) {
  return url.origin === self.location.origin &&
         (url.pathname === SCOPE_PATH || url.pathname === SCOPE_PATH + SHELL_NAME);
}

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && isShellPath(url)) {  /* ?route=0, #JVC etc. all get the one shell */
    event.respondWith(shell(req));
    return;
  }
  if (url.origin === self.location.origin) {
    if (url.href.indexOf(SCOPE) === 0) event.respondWith(cacheThenNetwork(req, SHELL_CACHE, true));   /* e.g. images/velaa_logo.jpg if deployed */
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') { event.respondWith(staleWhileRevalidate(req, FONT_CACHE)); return; }
  if (url.hostname === 'fonts.gstatic.com') { event.respondWith(cacheThenNetwork(req, FONT_CACHE, true)); return; }
  /* anything else: the page's CSP already forbids it; let the browser decide */
});

async function shell(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(SHELL_URL);
  if (hit) return hit;
  try {
    return await fetch(req);
  } catch (e) {
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>SASTRA Map - offline</title><body style="margin:0;display:grid;place-items:center;height:100vh;' +
      'background:#000;color:#e8d5a4;font:16px system-ui,sans-serif;text-align:center">' +
      '<div><h1 style="font-size:20px;letter-spacing:.2em">SASTRA CAMPUS</h1>' +
      '<p>You are offline and the map has not been saved on this device yet.<br>' +
      'Open it once with a connection and it will work offline after that.</p></div>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function cacheThenNetwork(req, name, store) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: name === SHELL_CACHE, ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);                        /* offline: rejects, as an uncached request would */
  if (store && res.ok) cache.put(req, res.clone()).catch(function () {});
  return res;
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  const net = fetch(req).then(function (res) {
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(function () {});
    return res;
  });
  if (hit) { net.catch(function () {}); return hit; }
  return net;
}
