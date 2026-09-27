// End-to-end check of a PWA build: boot, service-worker install, installability,
// telemetry hooks, then a reload with the web server KILLED (a real dead zone).
//
//   python3 pwa/build_pwa.py SastraMap_Done.html            # -> pwa/dist
//   NODE_PATH=$(npm root -g) node pwa/test/pwa_e2e.js pwa/dist 8123
//   NODE_PATH=$(npm root -g) node pwa/test/pwa_e2e.js <folder with the original as index.html> 8124 baseline
//
// Needs Playwright + Chromium and python3 (for the throwaway web server). WebGL
// runs on SwiftShader, so a headless boot takes minutes, not seconds.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const DIR = process.argv[2], PORT = +process.argv[3] || 8123, MODE = process.argv[4] || 'full';
const URL = `http://localhost:${PORT}/index.html`;
const T0 = Date.now(); const ts = () => ((Date.now() - T0) / 1000).toFixed(1) + 's';
const log = (...a) => console.log('[' + ts() + ']', ...a);
function serve() { return spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: DIR, stdio: 'ignore' }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let srv = serve(); await sleep(800);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // Google Fonts are unreachable from this sandbox: fail them fast instead of waiting on the proxy
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctx.newPage();
  const tel = [], errs = [], failed = [];
  page.on('console', m => { const t = m.text(); if (t.startsWith('[TELEMETRY]') || t.startsWith('[PWA]')) tel.push(t); if (m.type() === 'error') errs.push(t); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('requestfailed', r => failed.push(r.url().slice(0, 90)));

  log('online load', URL);
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__campusBoot && window.__campusBoot.done, null, { timeout: 900000, polling: 1000 });
  const boot1 = await page.evaluate(() => ({ readyAt: Math.round(window.__campusBoot.readyAt), gl: !!document.querySelector('#app canvas') }));
  log('campus:ready', JSON.stringify(boot1));
  if (MODE === 'baseline') { log('BASELINE readyAt', boot1.readyAt); await browser.close(); srv.kill(); return; }

  await page.waitForFunction(() => window.SastraPWA && window.SastraPWA.state().offlineReady, null, { timeout: 120000, polling: 500 });
  const pwa1 = await page.evaluate(async () => ({ state: SastraPWA.state(), caches: await caches.keys(),
    shellCached: !!(await caches.match(new URL('index.html', location.href).href)) }));
  log('PWA', JSON.stringify(pwa1));

  const cdp = await ctx.newCDPSession(page);
  const inst = await cdp.send('Page.getInstallabilityErrors');
  const man = await cdp.send('Page.getAppManifest');
  log('installability errors:', JSON.stringify(inst.installabilityErrors), '| manifest errors:', JSON.stringify(man.errors));

  // ---- telemetry hooks ---------------------------------------------------
  await page.evaluate(() => { const i = document.getElementById('axSearchIn'); i.focus(); });
  await page.keyboard.type('library', { delay: 30 }); await sleep(300); await page.keyboard.press('Enter'); await sleep(2500);
  await page.evaluate(() => { const i = document.getElementById('axSearchIn'); i.value = ''; i.dispatchEvent(new Event('input')); i.focus(); });
  await page.keyboard.type('swimming pool', { delay: 30 }); await sleep(2200);
  await page.evaluate(() => document.getElementById('axSearchIn').blur());
  await page.evaluate(() => { document.getElementById('pxFood').click(); }); await sleep(600);
  await page.evaluate(() => { document.getElementById('pxFood').click(); }); await sleep(600);
  await page.evaluate(() => SastraPOI.set('atm', true)); await sleep(600);
  await page.evaluate(() => SastraCard.openRecord('jvc')); await sleep(6000);
  const grid = await page.evaluate(() => {           // the Route button's real path: nmPickBuilding -> nmRouteBuildings
    nmSetArmed(true); nmPickBuilding(BUILDINGS.find(b => b.id === 'jvc')); nmPickBuilding(BUILDINGS.find(b => b.id === 'vidyut-vihar'));
    return { lastLen: Math.round(NMESH.lastLen), expanded: NMESH.lastExpand };
  });
  await sleep(800);
  log('grid route', JSON.stringify(grid));
  log('TELEMETRY (online):\n  ' + tel.join('\n  '));
  tel.length = 0;
  await sleep(15000);                                  // let the texture cache write in its idle slices

  // ---- dead zone: the server is gone -------------------------------------
  srv.kill('SIGKILL'); await sleep(500);
  failed.length = 0;
  log('server killed; reloading');
  const t1 = Date.now();
  const resp = await page.reload({ waitUntil: 'load', timeout: 180000 });
  log('reload status', resp && resp.status(), 'fromServiceWorker', resp && resp.fromServiceWorker());
  await page.waitForFunction(() => window.__campusBoot && window.__campusBoot.done, null, { timeout: 900000, polling: 1000 });
  const off = await page.evaluate(() => {
    const r = nmRouteBuildings('jvc', 'vidyut-vihar');
    const p = SastraRoute.plan('soc');
    return { readyAt: Math.round(window.__campusBoot.readyAt), grid: r && { metres: Math.round(r.metres), waypoints: r.waypoints, partial: r.partial },
             road: p && { length: p.length, waypoints: p.waypoints, ms: p.ms }, texHits: window.__campusTex && window.__campusTex.stats.hit,
             meshes: (() => { let n = 0; scene.traverse(o => { if (o.isMesh) n++; }); return n; })(), online: navigator.onLine };
  });
  log('OFFLINE boot', ((Date.now() - t1) / 1000).toFixed(1) + 's', JSON.stringify(off));
  await sleep(5000);
  log('TELEMETRY (offline):\n  ' + tel.join('\n  '));
  log('failed requests while offline:', JSON.stringify([...new Set(failed)]));
  log('page errors:', JSON.stringify(errs.slice(0, 10)));
  await browser.close();
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
