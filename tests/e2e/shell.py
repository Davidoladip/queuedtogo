"""Workspace header on phones and desktop: account button position, centring and menu placement (dev harness)."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
passed = failed = 0

def check(name, cond, detail=""):
    global passed, failed
    if cond: passed += 1
    else:
        failed += 1
        print(f"FAIL: {name} {detail}")

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, q in [(390, "?orgs=2"), (360, ""), (1280, "?orgs=2")]:
        pg = b.new_page(viewport={"width": w, "height": 700}, is_mobile=w < 800, has_touch=w < 800)
        pg.goto(BASE + "/dev/shell" + q)
        av = pg.locator("summary.avatar")
        box = av.bounding_box()
        logo = pg.locator(".top-inner > a").first.bounding_box()
        check(f"{w}px: account button is a circle of equal sides", box and abs(box["width"] - box["height"]) < 0.5, box)
        off = pg.evaluate("()=>{const s=document.querySelector('summary.avatar span').getBoundingClientRect(),a=document.querySelector('summary.avatar').getBoundingClientRect();return Math.max(Math.abs(s.left+s.width/2-(a.left+a.width/2)),Math.abs(s.top+s.height/2-(a.top+a.height/2)))}")
        check(f"{w}px: initials are centred in the circle", off <= 1, off)
        if w < 800:
            check(f"{w}px: account button sits on the logo's row, at the right", abs((box["y"] + box["height"] / 2) - (logo["y"] + logo["height"] / 2)) < 8 and box["x"] + box["width"] > w - 40, (box, logo))
            check(f"{w}px: account button is a comfortable tap target", box["width"] >= 36, box)
        av.click()
        menu = pg.locator(".menu-pop").bounding_box()
        check(f"{w}px: account menu opens fully on screen", menu and menu["x"] >= 0 and menu["x"] + menu["width"] <= w, menu)
        pg.close()
    b.close()

print(f"{passed}/{passed + failed} header checks passed")
