"""Browser tests for the QueuedToGo form-builder design upgrade.

Run:  python3 tests/test_design.py
Serves the prototype on localhost, drives it with Playwright (Chromium) and prints a pass/fail report.
"""
import base64, http.server, json, os, shutil, socketserver, struct, sys, threading, zlib
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVE = os.environ.get('QTG_SERVE', '/tmp/claude-0/qtg-serve')
SHOTS = os.environ.get('QTG_SHOTS', '/tmp/claude-0/qtg-shots')
PORT = 8765
HEAD = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'

def wrap(src, dst):
    with open(src) as f: body = f.read()
    with open(dst, 'w') as f: f.write(HEAD + body + '</body></html>')

def png(w, h, rgb):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

EVIL_SVG = b'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="80" onload="alert(1)">
<script>alert('x')</script><foreignObject width="10" height="10"><div>hi</div></foreignObject>
<a xlink:href="javascript:alert(2)"><rect width="200" height="80" fill="#E8633A" onclick="alert(3)"/></a>
<image href="https://evil.example/track.png" width="5" height="5"/></svg>'''

results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else f'  -> {detail}'), flush=True)

def main():
    shutil.rmtree(SERVE, ignore_errors=True); os.makedirs(SERVE); os.makedirs(SHOTS, exist_ok=True)
    wrap(os.path.join(ROOT, 'index.html'), os.path.join(SERVE, 'index.html'))
    wrap(os.path.join(ROOT, 'tests', 'legacy-v2.html'), os.path.join(SERVE, 'legacy.html'))
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=SERVE, **k)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
    base = f'http://127.0.0.1:{PORT}'
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1400, 'height': 950})
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and 'ERR_' not in m.text and errors.append(m.text))

        # ---------- 1. Backward compatibility: data saved by the previous version ----------
        pg.goto(base + '/legacy.html'); pg.wait_for_timeout(500)
        pg.click('[data-edit="ev-food"]'); pg.wait_for_timeout(200); pg.evaluate('save()')
        legacy = json.loads(pg.evaluate("localStorage.getItem('qtg-proto-v2')"))
        check('legacy data has no design config', 'design' not in legacy['events'][0])
        pg.goto(base + '/index.html'); pg.wait_for_timeout(800)
        ok = pg.evaluate("""()=>{const ev=S.events.find(e=>e.id==='ev-food');return !!ev.design&&ev.fields.some(f=>f.type==='submit')&&ev.design.adv.progress===true}""")
        check('legacy form loads and is upgraded (design + submit block)', ok)
        check('legacy form renders in the builder', pg.locator('#prev [data-sid="__submit"]').count() == 1)
        check('no script errors with legacy data', not errors, errors[:3])

        # ---------- 2. Pure functions ----------
        unit = pg.evaluate("""()=>({
          hex:cc('#2563eb'), short:cc('#abc'), rgba:cc('rgba(37, 99, 235, 0.5)'), cssl4:cc('rgb(37 99 235 / 50%)'),
          bad:[cc('blue'),cc('#12'),cc('rgb(300,0,0)'),cc('#GGGGGG')],
          svg:sanitizeSvg(`EVIL`),
          css:(()=>{const ev=JSON.parse(JSON.stringify(S.events[0]));ev.id='ev-test';
            ev.design.el.name={color:'red;}body{display:none',font:'x}*{',bg:{type:'image',img:{data:'javascript:alert(1)'}},border:{style:'solid;color:red'}};
            return designCss(ev)})(),
          badid:designCss({...S.events[0],id:'x"] *{display:none} ['})
        })""".replace('EVIL', EVIL_SVG.decode().replace('`', '')))
        check('hex colour parsed', unit['hex'] == '#2563EB', unit['hex'])
        check('short hex expanded', unit['short'] == '#AABBCC', unit['short'])
        check('rgba converted to 8-digit hex', unit['rgba'] == '#2563EB80', unit['rgba'])
        check('CSS level 4 rgb() syntax accepted', unit['cssl4'] == '#2563EB80', unit['cssl4'])
        check('invalid colours rejected', unit['bad'] == [None, None, None, None], unit['bad'])
        s = unit['svg'].lower()
        check('SVG sanitiser strips scripts, handlers, foreignObject, js and remote links',
              all(x not in s for x in ['<script', 'onload', 'onclick', 'foreignobject', 'javascript:', 'evil.example']) and '<rect' in s, s[:300])
        check('injected style values never reach CSS', all(x not in unit['css'] for x in ['display:none', 'javascript', 'x}*{', 'solid;color']), '')
        check('unsafe form id produces no CSS', unit['badid'] == '')

        # ---------- 3. Per-element styling isolation (Email vs Phone) ----------
        pg.click('#reset'); pg.wait_for_timeout(300)
        pg.evaluate("go('builder',{builderId:'ev-sports',btab:'design',pick:null})"); pg.wait_for_timeout(400)
        cs = lambda sel, prop: pg.evaluate(f"(()=>{{const e=document.querySelector({json.dumps(sel)});return e?getComputedStyle(e)[{json.dumps(prop)}]:null}})()")
        check('Email field has rounded blue border', cs('#prev [data-sid="email"] .qf-in', 'borderTopColor') == 'rgb(37, 99, 235)' and cs('#prev [data-sid="email"] .qf-in', 'borderTopLeftRadius') == '14px')
        check('Phone field is square with grey border', cs('#prev [data-sid="phone"] .qf-in', 'borderTopLeftRadius') == '0px' and cs('#prev [data-sid="phone"] .qf-in', 'borderTopColor') == 'rgb(154, 163, 181)')
        parent_before = cs('#prev [data-sid="parent"] .qf-in', 'borderTopColor')
        pg.click('#prev [data-sid="email"] .qf-in'); pg.wait_for_timeout(200)
        check('clicking an input in the preview selects it', pg.evaluate('U.pick') == 'email' and pg.locator('#prev [data-sid="email"].picked').count() == 1)
        check('element panel shows its controls', pg.locator('#c_e_email_border_color').count() == 1)
        pg.fill('#c_e_email_border_color', '#FF0000'); pg.wait_for_timeout(150)
        check('changing Email border updates the preview live', cs('#prev [data-sid="email"] .qf-in', 'borderTopColor') == 'rgb(255, 0, 0)')
        check('Phone and other inputs are unaffected', cs('#prev [data-sid="phone"] .qf-in', 'borderTopColor') == 'rgb(154, 163, 181)' and cs('#prev [data-sid="parent"] .qf-in', 'borderTopColor') == parent_before)
        pg.fill('#c_e_email_border_color', 'notacolour'); pg.wait_for_timeout(100)
        check('invalid code shows an error and keeps the last good colour', pg.locator('.cc.bad .cc-err').inner_text() != '' and cs('#prev [data-sid="email"] .qf-in', 'borderTopColor') == 'rgb(255, 0, 0)')

        # ---------- 4. Round colour picker ----------
        pg.click('[data-cpopen="e.email.border.color"]'); pg.wait_for_timeout(150)
        check('round swatch opens the colour picker', pg.locator('#cp').is_visible())
        pg.fill('#cp-txt', 'zzz'); pg.wait_for_timeout(50)
        check('picker rejects invalid codes', pg.locator('#cp-msg').inner_text() != '')
        pg.fill('#cp-txt', 'rgba(0, 128, 0, 0.5)'); pg.wait_for_timeout(400)
        check('RGBA code in picker updates the element in real time', cs('#prev [data-sid="email"] .qf-in', 'borderTopColor') == 'rgba(0, 128, 0, 0.5)')
        nb = pg.evaluate('S.brand.colors.length'); pg.click('#cp-save'); pg.wait_for_timeout(50)
        check('picker saves the colour to brand colours', pg.evaluate('S.brand.colors.length') == nb + 1 and pg.evaluate("S.brand.colors.includes('#00800080')"))
        pg.click('#cp [data-fmt="rgba"]'); check('picker shows RGBA format', pg.input_value('#cp-txt').startswith('rgba('))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        check('Escape closes the picker and records a recent colour', pg.locator('#cp').count() == 0 and pg.evaluate("S.recent[0]") == '#00800080')
        check('panel colour code updated from picker', pg.input_value('#c_e_email_border_color') == '#00800080')
        pg.screenshot(path=f'{SHOTS}/1-element-input.png')

        # ---------- 5. Button styling: independent Submit vs Next ----------
        pg.select_option('#el-pick', '__submit'); pg.wait_for_timeout(200)
        pg.fill('#c_e___submit_size', '20'); pg.wait_for_timeout(100)
        pg.click('[data-p="e.__submit.bg.type"][data-v="gradient"]'); pg.wait_for_timeout(150)
        check('Submit button gets a gradient', 'linear-gradient' in (cs('#prev [data-sid="__submit"]', 'backgroundImage') or ''))
        check('Submit font size applied', cs('#prev [data-sid="__submit"]', 'fontSize') == '20px')
        check('Next buttons are unaffected', cs('#prev [data-sid="__next"]', 'backgroundImage') == 'none' and cs('#prev [data-sid="__next"]', 'fontSize') == '16px')
        pg.click('#c_e___submit_radius_linked'); pg.wait_for_timeout(150)
        pg.fill('#c_e___submit_radius_tl', '30'); pg.wait_for_timeout(100)
        check('independent corner radius', cs('#prev [data-sid="__submit"]', 'borderTopLeftRadius') == '30px' and cs('#prev [data-sid="__submit"]', 'borderBottomRightRadius') == '2px')
        pg.click('[data-p="e.__submit.bg.type"][data-v="texture"]'); pg.wait_for_timeout(150)
        pg.click('[data-p="e.__submit.bg.tex"][data-v="stitch"]'); pg.wait_for_timeout(150)
        check('texture background applied', 'data:image/svg+xml' in (cs('#prev [data-sid="__submit"]', 'backgroundImage') or ''))
        pg.click('[data-action="pstate"][data-v="hover"]'); pg.wait_for_timeout(200)
        pg.fill('#c_e___submit_st_hover_color', '#123456'); pg.wait_for_timeout(400)
        check('hover state is previewed and styled', pg.locator('#prev [data-sid="__submit"].fs-hover').count() == 1 and cs('#prev [data-sid="__submit"]', 'color') == 'rgb(18, 52, 86)')
        pg.screenshot(path=f'{SHOTS}/2-button-states.png')
        pg.click('#ps-clear'); pg.wait_for_timeout(150)

        # ---------- 6. Artwork placement ----------
        pg.click('[data-sec="artwork"] > summary'); pg.wait_for_timeout(200)
        idx = pg.evaluate("cur().fields.findIndex(f=>f.id==='class')+1")
        pg.select_option('#ins-pos', str(idx))
        with pg.expect_file_chooser() as fc: pg.click('[data-action="insup"]')
        fc.value.set_files(files=[{'name': 'banner.png', 'mimeType': 'image/png', 'buffer': png(900, 300, (232, 99, 58))}]); pg.wait_for_timeout(600)
        new_id = pg.evaluate("U.pick")
        order = pg.evaluate("cur().fields.map(f=>f.id)")
        check('artwork inserted after the chosen question', order.index(new_id) == order.index('class') + 1, order)
        prev_blk = pg.evaluate(f"(()=>{{const f=document.querySelector('#prev [data-sid=\"{new_id}\"]');return f&&f.closest('.qf-blk').previousElementSibling.querySelector('[data-sid]').dataset.sid}})()")
        check('artwork is a real block in the form layout', prev_blk == 'class', prev_blk)
        check('artwork settings shown when selected', pg.locator(f'#c_img_{new_id}_w').count() == 1)
        pg.fill(f'#c_img_{new_id}_w', '60'); pg.wait_for_timeout(100)
        pg.click(f'[data-p="img.{new_id}.align"][data-v="right"]'); pg.wait_for_timeout(150)
        pg.fill(f'#c_img_{new_id}_alt', 'Event banner'); pg.wait_for_timeout(150)
        check('artwork width, alignment and alt text apply', pg.evaluate(f"""(()=>{{const f=document.querySelector('#prev [data-sid="{new_id}"]');return getComputedStyle(f).justifyContent==='flex-end'&&f.querySelector('img').alt==='Event banner'&&Math.round(f.querySelector('.qf-img-in').getBoundingClientRect().width/f.getBoundingClientRect().width*100)}})()""") == 60)
        # insert SVG from the preview's "+ Artwork" chip at the very top
        pg.hover('#prev .qf-blk[data-idx="0"]')
        with pg.expect_file_chooser() as fc: pg.click('#prev .qf-ins[data-ins="0"]')
        fc.value.set_files(files=[{'name': 'logo.svg', 'mimeType': 'image/svg+xml', 'buffer': EVIL_SVG}]); pg.wait_for_timeout(600)
        svg_id = pg.evaluate("U.pick")
        check('SVG artwork inserted at the beginning of the form', pg.evaluate("cur().fields[0].id") == svg_id)
        stored = pg.evaluate(f"Assets.get(cur().fields[0].img.src.asset)")
        dec = base64.b64decode(stored.split(',', 1)[1]).decode().lower()
        check('stored SVG is sanitised', '<script' not in dec and 'onload' not in dec and 'javascript' not in dec, dec[:200])
        pg.click('[data-action="imgdup"][data-fid="%s"]' % svg_id); pg.wait_for_timeout(300)
        check('artwork can be duplicated', pg.evaluate("cur().fields.filter(f=>f.type==='image').length") == 3)
        dup_id = pg.evaluate('U.pick')
        pg.click('[data-action="imgdel"][data-fid="%s"]' % dup_id); pg.wait_for_timeout(300)
        check('artwork can be deleted', pg.evaluate("cur().fields.filter(f=>f.type==='image').length") == 2)
        with pg.expect_file_chooser() as fc: pg.click('[data-action="insup"]')
        fc.value.set_files(files=[{'name': 'notes.txt', 'mimeType': 'text/plain', 'buffer': b'hello'}]); pg.wait_for_timeout(300)
        check('wrong file types are refused with a message', 'PNG, JPG, SVG or WebP' in pg.inner_text('#toast') and pg.evaluate("cur().fields.filter(f=>f.type==='image').length") == 2)
        pg.screenshot(path=f'{SHOTS}/3-artwork.png')

        # ---------- 7. Undo / redo ----------
        before = pg.evaluate("JSON.stringify(cur().design.el.email)")
        pg.evaluate("go('builder',{builderId:'ev-sports',btab:'design',pick:'email'})"); pg.wait_for_timeout(200)
        pg.fill('#c_e_email_border_color', '#000000'); pg.wait_for_timeout(1000)
        pg.click('#b-undo'); pg.wait_for_timeout(200)
        check('undo restores the previous style', pg.evaluate("JSON.stringify(cur().design.el.email)") == before)
        pg.click('#b-redo'); pg.wait_for_timeout(200)
        check('redo reapplies it', pg.evaluate("cur().design.el.email.border.color") == '#000000')
        pg.click('#b-undo'); pg.wait_for_timeout(200)

        # ---------- 8. Persistence: reload and reopen ----------
        pg.wait_for_timeout(500)
        pg.reload(); pg.wait_for_timeout(1200)
        check('builder reopens the same form', pg.evaluate('U.view') == 'builder' and pg.evaluate('U.builderId') == 'ev-sports')
        check('saved per-element styles reload', cs('#prev [data-sid="email"] .qf-in', 'borderTopColor') == 'rgba(0, 128, 0, 0.5)' and cs('#prev [data-sid="__submit"]', 'borderTopLeftRadius') == '30px')
        check('uploaded artwork reloads from file storage', pg.locator(f'#prev [data-sid="{new_id}"] img').count() == 1 and pg.locator(f'#prev [data-sid="{svg_id}"] img').count() == 1)

        # ---------- 9. Published form matches the preview ----------
        props = ['backgroundImage', 'borderTopLeftRadius', 'fontSize', 'color', 'fontFamily']
        prev_sub = {k: cs('#prev [data-sid="__submit"]', k) for k in props}
        prev_email = {k: cs('#prev [data-sid="email"] .qf-in', k) for k in ['borderTopColor', 'borderTopLeftRadius']}
        pg.click('#b-open'); pg.wait_for_timeout(500)
        live = '.fill-frame'
        check('live Submit button matches preview', {k: cs(f'{live} [data-sid="__submit"]', k) for k in props} == prev_sub)
        check('live Email field matches preview', {k: cs(f'{live} [data-sid="email"] .qf-in', k) for k in ['borderTopColor', 'borderTopLeftRadius']} == prev_email)
        check('live form shows the inserted artwork', pg.locator(f'{live} [data-sid="{new_id}"] img').count() == 1)
        check('only page 1 is visible', pg.locator(f'{live} .qf-page:not([hidden])').count() == 1)
        pg.click(f'{live} [data-nav="next"] >> visible=true'); pg.wait_for_timeout(200)
        check('Next checks required questions', pg.inner_text('#qe-student') == 'Please answer this question.' and pg.locator(f'{live} [data-sid="student"].invalid').count() == 1)
        check('error state colour applies', cs(f'{live} [data-sid="student"] .qf-in', 'borderTopColor') == 'rgb(229, 72, 77)')
        pg.fill('#q-student', 'Ava'); pg.click(f'{live} .qf-opt:has-text("Blue")')
        pg.click(f'{live} [data-nav="next"] >> visible=true'); pg.wait_for_timeout(300)
        check('Next moves to page 2', pg.evaluate("document.querySelector('.qf-page[data-page=\"1\"]').hidden") is False)
        pg.click(f'{live} [data-nav="prev"] >> visible=true'); pg.wait_for_timeout(300)
        check('Back returns to page 1', pg.evaluate("document.querySelector('.qf-page[data-page=\"0\"]').hidden") is False)
        pg.click(f'{live} [data-nav="next"] >> visible=true'); pg.wait_for_timeout(250)
        pg.click(f'{live} .qf-opt:has-text("Cap")'); pg.fill(f'{live} input[data-size="M"]', '1')
        pg.click(f'{live} [data-nav="next"] >> visible=true'); pg.wait_for_timeout(250)
        pg.fill('#q-parent', 'Nadia Reyes'); pg.fill('#q-phone', '+1 555 0100')
        pg.click(f'{live} .qf-submit'); pg.wait_for_timeout(400)
        check('multi-page form submits', pg.locator('.qf-done').count() == 1)
        pg.screenshot(path=f'{SHOTS}/4-live-done.png')

        # ---------- 10. Disabled-until-valid ----------
        pg.evaluate("go('builder',{builderId:'ev-sports',btab:'design'})"); pg.wait_for_timeout(200)
        pg.click('[data-sec="adv"] > summary'); pg.wait_for_timeout(150)
        pg.click('#c_adv_disableUntilValid'); pg.wait_for_timeout(200)
        pg.evaluate("go('fill',{fillId:'ev-sports',fillDone:null})"); pg.wait_for_timeout(300)
        check('Next is disabled until required answers are given', pg.evaluate("document.querySelector('.qf-page:not([hidden]) [data-nav=next]').disabled") is True)
        pg.fill('#q-student', 'Leo'); pg.click('.fill-frame .qf-opt:has-text("Red")'); pg.wait_for_timeout(100)
        check('Next enables once answered', pg.evaluate("document.querySelector('.qf-page:not([hidden]) [data-nav=next]').disabled") is False)

        # ---------- 11. Food Fest: sample artwork between questions; tracking uses design ----------
        pg.evaluate("go('builder',{builderId:'ev-food',btab:'design',pick:null})"); pg.wait_for_timeout(400)
        check('sample artwork sits between questions', pg.evaluate("(()=>{const f=document.querySelector('#prev [data-sid=styles]');return f.closest('.qf-blk').previousElementSibling.querySelector('[data-sid]').dataset.sid})()") == 'stitch')
        pg.screenshot(path=f'{SHOTS}/5-food-design.png')

        # ---------- 12. Phone width ----------
        m = ctx.new_page(); m.set_viewport_size({'width': 390, 'height': 844})
        m.on('pageerror', lambda e: errors.append(str(e)))
        m.goto(base + '/index.html'); m.wait_for_timeout(900)
        m.evaluate("go('builder',{builderId:'ev-sports',btab:'design',pick:'__submit'})"); m.wait_for_timeout(400)
        check('builder has no sideways scroll on a phone', m.evaluate('document.documentElement.scrollWidth') <= 390, m.evaluate('document.documentElement.scrollWidth'))
        m.click('[data-cpopen="e.__submit.color"]'); m.wait_for_timeout(150)
        box = m.evaluate("(()=>{const r=document.getElementById('cp').getBoundingClientRect();return [r.left,r.right,r.bottom]})()")
        check('colour picker fits the phone screen', box[0] >= 0 and box[1] <= 390 and box[2] <= 845, box)
        m.screenshot(path=f'{SHOTS}/6-phone-picker.png')
        m.keyboard.press('Escape')
        m.evaluate("go('fill',{fillId:'ev-food',fillDone:null})"); m.wait_for_timeout(300)
        check('live form has no sideways scroll on a phone', m.evaluate('document.documentElement.scrollWidth') <= 390)
        m.screenshot(path=f'{SHOTS}/7-phone-form.png', full_page=True)

        dark = b.new_context(viewport={'width': 1400, 'height': 950}, color_scheme='dark').new_page()
        dark.goto(base + '/index.html'); dark.wait_for_timeout(900)
        dark.evaluate("go('builder',{builderId:'ev-neon',btab:'design',pick:'name'})"); dark.wait_for_timeout(400)
        dark.screenshot(path=f'{SHOTS}/8-dark-neon.png')

        check('no script errors during the run', not errors, errors[:5])
        b.close()
    httpd.shutdown()
    passed = sum(1 for r in results if r[1])
    print(f'\n{passed}/{len(results)} checks passed')
    sys.exit(0 if passed == len(results) else 1)

if __name__ == '__main__':
    main()
