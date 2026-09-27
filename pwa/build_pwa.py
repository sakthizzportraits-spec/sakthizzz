#!/usr/bin/env python3
"""Turn SastraMap_Done.html into an installable, offline-capable PWA build.

    python3 pwa/build_pwa.py SastraMap_Done.html            # -> pwa/dist/
    python3 pwa/build_pwa.py SastraMap_Done.html --out site  # any folder
    python3 pwa/build_pwa.py SastraMap_Done.html --name map.html

Writes into the output folder:
    index.html            the map with the PWA1 + TEL1 blocks injected
    sw.js                 the service worker, VERSION = buildStamp + hash of page and worker
    manifest.webmanifest  install metadata (start_url follows --name)
    icons/                the crest icons

Deploy the whole folder over HTTPS (or test on http://localhost). Re-running on
an already patched page replaces the marked blocks instead of stacking them.
Needs Python 3.8+; `node` on PATH adds a syntax check of every script.
"""
import argparse
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')

CSP_OLD_WORKER = "worker-src 'none'"
CSP_NEW_WORKER = "worker-src 'self'"
CSP_MANIFEST = "manifest-src 'self'"
STRIP_ANCHOR = "'#pxCSS, #pxBar, #pxPills, #pxMenu, #pxTip');"
STRIP_NEW = "'#pxCSS, #pxBar, #pxPills, #pxMenu, #pxTip, ' +\n      /* PWA1 the install chip */\n      '#pwaCSS, #pwaChip');"
PAYLOAD_TAG = '<div id="sathizz-map-data"'


def die(msg):
    sys.exit('build_pwa: ' + msg)


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def strip_marked(page, name):
    """Remove an earlier <!-- NAME:BEGIN x --> ... <!-- NAME:END x --> block (and its newline)."""
    return re.sub(r'<!-- %s:BEGIN [a-z]+ .*?<!-- %s:END [a-z]+ -->\n?' % (name, name), '', page, flags=re.S)


def patch(page):
    page = strip_marked(page, 'PWA1')
    page = strip_marked(page, 'TEL1')

    # 1. CSP: allow the same-origin service worker and manifest; nothing else changes
    m = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)">', page)
    if not m:
        die('no Content-Security-Policy meta found - is this SastraMap_Done.html?')
    csp = m.group(1)
    if CSP_OLD_WORKER in csp:
        csp = csp.replace(CSP_OLD_WORKER, CSP_NEW_WORKER)
    elif CSP_NEW_WORKER not in csp:
        csp = csp.rstrip('; ') + '; ' + CSP_NEW_WORKER
    if CSP_MANIFEST not in csp:
        csp = csp.replace("default-src 'none';", "default-src 'none'; " + CSP_MANIFEST + ';', 1)
    page = page[:m.start(1)] + csp + page[m.end(1):]

    # 2. head block right after the viewport meta
    vm = re.search(r'<meta name="viewport"[^>]*>\n', page)
    if not vm:
        die('no viewport meta found')
    page = page[:vm.end()] + read(os.path.join(SRC, 'head-pwa.html')) + page[vm.end():]

    # 3. the two script blocks after the last module, before the layout payload
    at = page.rfind(PAYLOAD_TAG)
    if at < 0:
        die('no #sathizz-map-data payload found')
    blocks = read(os.path.join(SRC, 'campus-analytics.html')) + read(os.path.join(SRC, 'pwa-shell.html'))
    page = page[:at] + blocks + page[at:]

    # 4. exportHTML(): strip the chip from exported copies
    if '/* PWA1 the install chip */' not in page:
        if page.count(STRIP_ANCHOR) != 1:
            die('exporter strip list not found exactly once')
        page = page.replace(STRIP_ANCHOR, STRIP_NEW)
    return page


def build_stamp(page):
    m = re.search(r'<div id="sathizz-map-data"[^>]*>(.*?)</div>', page, re.S)
    if not m:
        return 'nostamp'
    try:
        return json.loads(urllib.parse.unquote(m.group(1))).get('buildStamp') or 'nostamp'
    except ValueError:
        return 'nostamp'


def font_css(page):
    m = re.search(r'<link href="(https://fonts\.googleapis\.com/css2\?[^"]+)" rel="stylesheet">', page)
    return html.unescape(m.group(1)) if m else ''


def syntax_check(page, sw_path):
    node = shutil.which('node')
    if not node:
        print('  (node not found: skipping the syntax check)')
        return
    scripts = re.findall(r'<script>(.*?)</script>', page, re.S)
    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for i, s in enumerate(scripts):
            p = os.path.join(tmp, 's%02d.js' % i)
            with open(p, 'w', encoding='utf-8') as f:
                f.write(s)
            files.append(p)
        files.append(sw_path)
        bad = [p for p in files if subprocess.run([node, '--check', p], capture_output=True).returncode]
    if bad:
        die('syntax error in: ' + ', '.join(os.path.basename(p) for p in bad))
    print('  syntax check: %d page scripts + sw.js parse' % len(scripts))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source', help='SastraMap_Done.html (or an earlier PWA build)')
    ap.add_argument('--out', default=os.path.join(HERE, 'dist'))
    ap.add_argument('--name', default='index.html', help='file name of the page in the output folder')
    a = ap.parse_args()

    page = patch(read(a.source))
    os.makedirs(os.path.join(a.out, 'icons'), exist_ok=True)
    with open(os.path.join(a.out, a.name), 'w', encoding='utf-8') as f:
        f.write(page)

    sw = read(os.path.join(SRC, 'sw.js'))
    # a new page OR new worker logic rolls the cache name
    version = '%s.%s' % (build_stamp(page), hashlib.sha256((page + sw).encode('utf-8')).hexdigest()[:12])
    sw = sw.replace('__VERSION__', version).replace('__SHELL__', a.name).replace('__FONT_CSS__', font_css(page))
    sw_path = os.path.join(a.out, 'sw.js')
    with open(sw_path, 'w', encoding='utf-8') as f:
        f.write(sw)

    man = json.loads(read(os.path.join(SRC, 'manifest.webmanifest')))
    if a.name != 'index.html':
        man['start_url'] = man['id'] = './' + a.name
    with open(os.path.join(a.out, 'manifest.webmanifest'), 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=2)

    for n in os.listdir(os.path.join(HERE, 'icons')):
        if n.endswith('.png'):
            shutil.copy(os.path.join(HERE, 'icons', n), os.path.join(a.out, 'icons', n))

    print('build_pwa: wrote %s' % a.out)
    print('  page     %s (%d bytes)' % (a.name, len(page.encode('utf-8'))))
    print('  version  %s' % version)
    syntax_check(page, sw_path)


if __name__ == '__main__':
    main()
