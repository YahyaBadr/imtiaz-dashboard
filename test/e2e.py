import json, os, re, sys
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8125/index.html'
DL = '/tmp/dl'; os.makedirs(DL, exist_ok=True)
for f in os.listdir(DL): os.remove(os.path.join(DL,f))

errors, failed_reqs = [], []

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--no-sandbox'])
        ctx = browser.new_context(viewport={'width':1440,'height':900}, accept_downloads=True)
        page = ctx.new_page()
        page.on('console', lambda m: errors.append(m.text) if m.type=='error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('requestfailed', lambda r: failed_reqs.append(r.url))
        # inject gate session before scripts run
        page.add_init_script("""
          localStorage.setItem('imtiaz_gate_session_v1', JSON.stringify({ts:Date.now(), exp:Date.now()+8*3600*1000, name:'tester'}));
        """)
        page.goto(BASE, wait_until='networkidle')
        page.wait_for_timeout(2500)  # let app fetch + render

        # ---- verify data numbers on dashboard ----
        db = page.evaluate("() => ({students:(window.DB.students||[]).length, unreg:(window.DB.unregistered||window.ExportCore? null:null)})")
        counts = page.evaluate("""() => {
          const d = window.DB || {};
          return {
            students: (d.students||[]).length,
            groups: (d.groups||[]).length,
            unreg: (d.unregistered||[]).length,
            matrixKeys: Object.keys(d.roundMatrix||{}).length,
            g1r1: ((d.roundMatrix||{})['R1']||{}).total_students ?? (((d.roundMatrix||{})['R1']||{}).groups||[]).reduce((a,x)=>a+(+x.total_students||0),0)
          };
        }""")
        print('DB counts:', counts)

        # ---- check raw ${ text anywhere ----
        raw = page.evaluate("""() => document.body.innerText.match(/\\$\\{[^}]*\\}/g)""")
        print('RAW TEMPLATE TEXT FOUND:', raw)

        # ---- offline banner presence ----
        off = page.evaluate("""() => !!document.querySelector('[data-offline-banner], .offline-banner, .offline-toast, #offline-banner')""")
        print('OFFLINE UI PRESENT:', off)

        # ---- theme toggle works + persists ----
        page.click('#theme-toggle')
        page.wait_for_timeout(400)
        dark1 = page.evaluate("() => document.documentElement.classList.contains('dark')")
        page.reload(wait_until='networkidle'); page.wait_for_timeout(1500)
        dark2 = page.evaluate("() => document.documentElement.classList.contains('dark')")
        stored = page.evaluate("() => localStorage.getItem('imtiaz_theme')")
        print('THEME: after click=',dark1,' after reload=',dark2,' stored=',stored)

        # ---- tabs navigation at 1440 & 390 ----
        for vw in (1440, 390):
            page.set_viewport_size({'width':vw,'height':900})
            for tab in ('overview','schedule','units','not-registered'):
                a = page.query_selector(f'[data-view="{tab}"]') or page.query_selector(f'.nav-btn[data-action="goto"][data-view="{tab}"]')
                sel = page.query_selector_all('.nav-btn')
                # click by index order: الملخص/المصفوفة/الوحدات/غير المسجلين
            navs = page.query_selector_all('.nav-btn')
            labels = [n.get_attribute('data-view') or n.inner_text()[:10] for n in navs]
            print(f'VIEWPORT {vw}: nav buttons={len(navs)} labels={labels}')
            for i,n in enumerate(navs):
                n.click(); page.wait_for_timeout(500)
                active = page.evaluate("() => document.querySelector('.nav-btn.active')?.getAttribute('data-view')")
                ind = page.evaluate("""() => {const b=document.querySelector('.nav-indicator'); if(!b) return null; const a=document.querySelector('.nav-btn.active'); if(!a) return null; const ar=a.getBoundingClientRect(), br=b.getBoundingClientRect(); return Math.abs(ar.left-br.left)<8 && Math.abs(ar.width-br.width)<12;}""")
                body_hscroll = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
                print(f'  tab{i}: active={active} indicatorAligned={ind} hOverflow={body_hscroll}px')

        # ---- student modal ----
        page.set_viewport_size({'width':1440,'height':900})
        page.click('.nav-btn >> nth=0'); page.wait_for_timeout(400)
        card = page.query_selector('.copyable-name, .student-row, [data-action="open-student"]')
        if card:
            card.click(); page.wait_for_timeout(600)
            modal = page.evaluate("() => !!document.querySelector('.modal-overlay, .profile-overlay')")
            raw_in_modal = page.evaluate("""() => {const m=document.querySelector('.modal-overlay,.profile-overlay'); return m? (m.innerText.match(/\\$\\{[^}]*\\}/g)||[]) : 'no-modal';}""")
            print('STUDENT MODAL open=',modal,' rawText=',raw_in_modal)
            page.keyboard.press('Escape'); page.wait_for_timeout(300)
        else:
            print('STUDENT MODAL: no clickable student found')

        # ---- EXPORT: all 8 combos ----
        results = {}
        for scope in ('page','full'):
            for fmt in ('xlsx','csv','pdf','docx'):
                page.click('#export-btn'); page.wait_for_timeout(250)
                page.click(f'.export-scope[data-scope="{scope}"]'); page.wait_for_timeout(150)
                with page.expect_download(timeout=60000) as di:
                    page.click(f'.export-item[data-format="{fmt}"]')
                dl = di.value
                path = os.path.join(DL, dl.suggested_filename)
                dl.save_as(path)
                sz = os.path.getsize(path)
                toast = page.evaluate("() => {const t=document.querySelector('.toast'); return t?t.innerText.slice(0,80):null}")
                results[f'{scope}/{fmt}'] = (dl.suggested_filename, sz, toast)
                print(f'EXPORT {scope}/{fmt}: {dl.suggested_filename} size={sz} toast={toast!r}')
                page.wait_for_timeout(400)

        # screenshots light/dark of overview + schedule at both widths
        page.evaluate("() => localStorage.setItem('imtiaz_theme','light')")
        for theme in ('light','dark'):
            page.evaluate(f"() => {{const h=document.documentElement; h.classList.toggle('dark', {theme=='dark'});}}")
            for vw,label in ((1440,'desktop'),(390,'mobile')):
                page.set_viewport_size({'width':vw,'height':900})
                for vi,navi in enumerate([0,1]):
                    page.query_selector_all('.nav-btn')[navi].click(); page.wait_for_timeout(500)
                    page.screenshot(path=f'/tmp/dl/shot-{theme}-{label}-tab{navi}.png')
        browser.close()
        return results, counts, raw, off

res, counts, raw, off = run()
print('\nCONSOLE ERRORS:', errors[:10] if errors else 'NONE')
print('FAILED REQUESTS:', [u.split('?')[0] for u in set(failed_reqs)][:10] if failed_reqs else 'NONE')
json.dump({'results':{k:[v[0],v[1]] for k,v in res.items()},'counts':counts,'raw':raw,'offlineUI':off,'errors':errors[:20]}, open('/tmp/dl/report.json','w'), ensure_ascii=False, indent=1)
