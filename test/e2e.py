"""End-to-end smoke test for the Imtiaz dashboard.

Prerequisites:
    python test/server.py        # serves public/ at http://127.0.0.1:8125
    pip install playwright && playwright install chromium

Run:
    python test/e2e.py           # or set E2E_BASE to another URL
"""
import json
import os
import sys
import tempfile

from playwright.sync_api import sync_playwright

BASE = os.environ.get('E2E_BASE', 'http://127.0.0.1:8125/index.html')
OUT = tempfile.mkdtemp(prefix='imtiaz-e2e-')
PAGES = [
    'overview', 'schedule', 'round-1', 'round-2',
    'round-3', 'round-4', 'round-5', 'not-registered',
]
NAV = ['overview', 'schedule', 'round-1', 'round-2', 'round-3', 'round-4', 'not-registered']

errors, failed_reqs = [], []


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        page = ctx.new_page()
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('requestfailed', lambda r: failed_reqs.append(r.url))

        # inject a gate session before scripts run
        page.add_init_script("""
          localStorage.setItem('imtiaz_gate_session_v1', JSON.stringify({ts:Date.now(), exp:Date.now()+8*3600*1000, name:'tester'}));
        """)
        page.goto(BASE, wait_until='domcontentloaded')
        page.wait_for_function('window.DB && window.DB.students && window.DB.students.length > 100', timeout=45000)
        page.wait_for_function("document.getElementById('gate-overlay').classList.contains('hidden')", timeout=10000)

        # ---- data numbers ----
        counts = page.evaluate("""() => {
          const d = window.DB || {};
          return {
            students: (d.students||[]).length,
            groups: (d.groups||[]).length,
            assignments: (d.assignments||[]).length,
            unreg: (d.unregistered||[]).length,
            matrixKeys: Object.keys(d.roundMatrix||{}).length,
            birthDates: (d.students||[]).filter(s => s.birth_date).length
          };
        }""")
        print('DB counts:', counts)

        # ---- raw template text leaking into the DOM ----
        raw = page.evaluate("""() => document.body.innerText.match(/\\$\\{[^}]*\\}/g)""")
        print('RAW TEMPLATE TEXT FOUND:', raw)

        # ---- theme toggle works + persists ----
        page.click('#theme-toggle')
        page.wait_for_timeout(250)
        dark1 = page.evaluate("document.documentElement.classList.contains('dark')")
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('window.DB && window.DB.students', timeout=45000)
        dark2 = page.evaluate("document.documentElement.classList.contains('dark')")
        stored = page.evaluate("localStorage.getItem('imtiaz_theme')")
        print('THEME: after click=', dark1, ' after reload=', dark2, ' stored=', stored)

        # ---- every page renderer ----
        for pid in PAGES:
            page.evaluate("(id) => window.showPage(id)", pid)
            page.wait_for_timeout(120)
            info = page.evaluate("""(id) => {
              const el = document.getElementById('page-' + id);
              return el ? {visible: !el.classList.contains('hidden'),
                            errorCard: !!el.querySelector('.error-card'),
                            textLen: el.textContent.trim().length} : null;
            }""", pid)
            print(f'PAGE {pid}:', info)

        # ---- navigation at desktop & mobile widths ----
        for vw in (1440, 390):
            page.set_viewport_size({'width': vw, 'height': 900})
            for name in NAV:
                page.click(f'.nav-btn[data-page="{name}"]')
                page.wait_for_timeout(180)
                active = page.evaluate("document.querySelector('.nav-btn.active')?.dataset.page")
                overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                print(f'  vw={vw} nav={name} active={active} hOverflow={overflow}px')

        # ---- student profile (NID toggle + birth date) ----
        page.set_viewport_size({'width': 1440, 'height': 900})
        page.evaluate("window.showPage('round-2-units')")
        page.wait_for_timeout(300)
        unit_card = page.query_selector('#page-round-2-units .unit-card')
        if unit_card:
            unit_card.click()
            page.wait_for_timeout(250)
        card = page.query_selector('#page-round-2-units .unit-card.open [data-action="student"]')
        if card:
            card.click()
            page.wait_for_timeout(500)
            modal = page.evaluate("!!document.querySelector('.modal-overlay, .profile-overlay')")
            print('STUDENT MODAL open=', modal)
            if page.query_selector('#nid-toggle-btn'):
                before = page.get_attribute('#nid-display', 'data-masked')
                page.click('#nid-toggle-btn')
                page.wait_for_timeout(100)
                after = page.get_attribute('#nid-display', 'data-masked')
                svg = page.evaluate("!!document.querySelector('#nid-toggle-btn svg')")
                print('NID TOGGLE:', before, '->', after, ' iconKept=', svg)
            page.evaluate("window.Overlays && window.Overlays.closeAll()")
        else:
            print('STUDENT MODAL: no clickable student found')

        # ---- export: all 8 scope/format combos ----
        results = {}
        for scope in ('page', 'full'):
            for fmt in ('xlsx', 'csv', 'pdf', 'docx'):
                page.evaluate("window.showPage('round-2-units')")
                page.click('#export-btn')
                page.wait_for_timeout(200)
                page.click(f'.export-scope[data-scope="{scope}"]')
                page.wait_for_timeout(100)
                with page.expect_download(timeout=90000) as di:
                    page.click(f'.export-item[data-format="{fmt}"]')
                dl = di.value
                path = os.path.join(OUT, dl.suggested_filename)
                dl.save_as(path)
                results[f'{scope}/{fmt}'] = (dl.suggested_filename, os.path.getsize(path))
                print(f'EXPORT {scope}/{fmt}:', results[f'{scope}/{fmt}'])
                page.wait_for_timeout(300)

        # ---- screenshots ----
        for theme in ('light', 'dark'):
            page.evaluate(f"localStorage.setItem('imtiaz_theme', '{theme}')")
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function('window.DB && window.DB.students', timeout=45000)
            for vw, label in ((1440, 'desktop'), (390, 'mobile')):
                page.set_viewport_size({'width': vw, 'height': 900})
                for i, name in enumerate(('overview', 'schedule')):
                    page.click(f'.nav-btn[data-page="{name}"]')
                    page.wait_for_timeout(350)
                    page.screenshot(path=os.path.join(OUT, f'shot-{theme}-{label}-{name}.png'))

        browser.close()
        return results, counts, raw


res, counts, raw = run()
print('\nCONSOLE ERRORS:', errors[:10] if errors else 'NONE')
print('FAILED REQUESTS:', [u.split('?')[0] for u in set(failed_reqs)][:10] if failed_reqs else 'NONE')
print('OUTPUT DIR:', OUT)
with open(os.path.join(OUT, 'report.json'), 'w', encoding='utf-8') as f:
    json.dump({'results': res, 'counts': counts, 'raw': raw, 'errors': errors[:20]}, f, ensure_ascii=False, indent=1)
sys.exit(1 if errors else 0)
