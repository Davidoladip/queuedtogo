"""Browser tests for the public homepage and the demo forms (signed out).
  npm run build && npm start      (QTG_DEV_HARNESS isn't needed)
  python3 tests/e2e/home.py
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://localhost:3000")
SHOTS = os.environ.get("SHOTS", "/tmp/claude-0/app-shots")
os.makedirs(SHOTS, exist_ok=True)
results = []

def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"), flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1366, "height": 860})
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(BASE + "/")

    check("page title", pg.title() == "QueuedToGo: order forms and updates for live events", pg.title())
    check("one main heading", pg.locator("h1").count() == 1 and "Take orders at your event" in pg.inner_text("h1"))
    desc = pg.locator('meta[name="description"]').get_attribute("content") or ""
    check("search description", "QR-code form" in desc, desc)
    check("share image", (pg.locator('meta[property="og:image"]').get_attribute("content") or "").endswith("/og.png"))
    check("Start free goes to sign-up", pg.get_by_role("link", name="Start free").first.get_attribute("href") == "/signup")
    check("second button jumps to the real event forms", pg.get_by_role("link", name="See real event forms").get_attribute("href") == "#examples")
    check("sign in link", pg.get_by_role("link", name="Sign in").first.get_attribute("href") == "/login")
    for anchor in ("#how", "#examples", "#invitations", "#pricing"):
        check(f"menu link {anchor} has a target", pg.locator(anchor).count() == 1)
    stage = pg.get_by_role("img", name="An order, QTG-1042")
    check("the animation is described for screen readers", stage.count() == 1)
    pg.wait_for_timeout(5200)
    mover_x = pg.locator(".hm-mover").bounding_box()["x"]; ready_x = pg.locator(".hm-col").nth(2).bounding_box()["x"]
    check("the order ends up in Ready", abs(mover_x - ready_x - 10) < 3, (mover_x, ready_x))
    check("the ready text arrives", float(pg.locator(".hm-sms-2").evaluate("e => getComputedStyle(e).opacity")) == 1)
    check("steps are an ordered list", pg.locator("ol.hm-steps > li").count() == 3)

    imgs = pg.locator("main img")
    for i in range(imgs.count()):
        imgs.nth(i).scroll_into_view_if_needed()
    pg.wait_for_timeout(800)
    broken = pg.evaluate("[...document.querySelectorAll('main img')].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.alt)")
    check("all screenshots load", imgs.count() == 5 and not broken, (imgs.count(), broken))
    check("every screenshot has a description", all(len(imgs.nth(i).get_attribute("alt") or "") > 20 for i in range(imgs.count())))

    plans = pg.locator(".hm-plan")
    prices = [plans.nth(i).locator(".hm-price b").inner_text() for i in range(plans.count())]
    check("plan prices match the app", prices == ["$0", "$29", "$69", "$139"], prices)
    annual = [plans.nth(i).locator(".hm-annual").inner_text() for i in range(plans.count())]
    check("annual prices on the homepage", annual[1:] == ["or $290 a year (2 months free)", "or $690 a year (2 months free)", "or $1,390 a year (2 months free)"], annual)
    check("trial buttons", pg.get_by_role("link", name="Try Pro free for 14 days").count() == 1)
    passes = pg.locator(".hm-pass-line").inner_text()
    check("event pass prices", all(x in passes for x in ("$29 for up to 100 guests", "$49 for up to 300 guests", "$69 for unlimited guests")), passes)
    first = pg.locator(".hm-faq details").first
    first.locator("summary").click()
    check("questions open", first.get_attribute("open") is not None and "browser" in first.inner_text())
    check("contact and legal links in the footer", pg.locator('footer a[href="/terms"]').count() == 1 and pg.locator('footer a[href="/privacy"]').count() == 1
          and pg.locator('footer a[href="mailto:hello@threadtogo.com"]').count() == 1)
    pg.keyboard.press("Home"); pg.mouse.move(0, 0)
    pg.goto(BASE + "/"); pg.keyboard.press("Tab")
    check("skip link comes first", pg.evaluate("document.activeElement.textContent") == "Skip to content")
    pg.screenshot(path=f"{SHOTS}/home-desktop.png", full_page=True)

    # Reduced motion: the final state shows straight away
    rm = b.new_context(viewport={"width": 1366, "height": 860}, reduced_motion="reduce").new_page()
    rm.goto(BASE + "/")
    mx = rm.locator(".hm-mover").bounding_box()["x"]; rx = rm.locator(".hm-col").nth(2).bounding_box()["x"]
    check("with reduced motion the order is already in Ready", abs(mx - rx - 10) < 3, (mx, rx))
    check("with reduced motion the text is already there", float(rm.locator(".hm-sms-2").evaluate("e => getComputedStyle(e).opacity")) == 1)

    # Phone
    ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    ph.goto(BASE + "/"); ph.wait_for_timeout(5200)
    check("no sideways scrolling on a phone", ph.evaluate("document.documentElement.scrollWidth") <= 390)
    check("menu links are hidden on a phone but Start free stays", not ph.locator(".hm-nav").is_visible() and ph.locator(".hm-top .hm-btn").is_visible())
    m = ph.locator(".hm-mover").bounding_box(); r = ph.locator(".hm-col").nth(2).bounding_box()
    check("on a phone the order ends inside Ready", m["x"] >= r["x"] and m["x"] + m["width"] <= r["x"] + r["width"] + 1, (m, r))
    phone = ph.locator(".hm-phone").bounding_box()
    check("the phone doesn't cover the moving order", phone["y"] >= m["y"] + m["height"] - 1, (phone, m))
    ph.screenshot(path=f"{SHOTS}/home-phone.png", full_page=True)

    # The real event forms, shown live in phone frames
    frames = pg.locator(".hm-device iframe")
    check("two real forms in phone frames", frames.count() == 2)
    frames.first.scroll_into_view_if_needed()
    f1 = pg.frame_locator(".hm-device iframe").first
    check("Style and Sip loads inside its frame", f1.locator(".qf-title").inner_text(timeout=10000) == "Style and Sip")
    check("no demo strip inside the frame", f1.locator(".demo-bar").count() == 0)
    f2 = pg.frame_locator(".hm-device iframe").nth(1)
    check("the live-embroidery form loads inside its frame", f2.locator(".qf-title").inner_text(timeout=10000) == "LIVE EMBROIDERY FORM")
    check("frames have titles for screen readers", all("working demo" in (frames.nth(i).get_attribute("title") or "") for i in range(2)))
    hdr = pg.request.get(BASE + "/demo?frame=1").headers
    check("demo pages may be framed by this site only", hdr.get("x-frame-options") == "SAMEORIGIN" and "frame-ancestors 'self'" in hdr.get("content-security-policy", ""), hdr)
    hdr = pg.request.get(BASE + "/login").headers
    check("every other page refuses to be framed", hdr.get("x-frame-options") == "DENY" and "frame-ancestors 'none'" in hdr.get("content-security-policy", ""), hdr)
    hdr = pg.request.get(BASE + "/demonstration-not-a-demo").headers
    check("only the demo paths are framable", hdr.get("x-frame-options") == "DENY", hdr)

    # Demo order forms: work like real ones, save nothing
    posts = []
    pg.on("request", lambda r: posts.append(r.url) if r.method == "POST" else None)
    pg.goto(BASE + "/demo")
    check("demo says nothing is saved", "nothing you type is saved or sent" in pg.inner_text(".demo-bar"))
    check("the demo is the real Style and Sip form", pg.inner_text(".qf-title") == "Style and Sip")
    pg.get_by_role("button", name="Submit").click()
    check("demo checks answers like a real form", pg.locator(".qf-ferr:not(:empty)").count() >= 1)
    pg.get_by_label("Your name").fill("Lena Ortiz"); pg.get_by_label("Mobile number").fill("(555) 123-4567"); pg.get_by_label("Email").fill("lena@example.com")
    pg.get_by_role("button", name="Submit").click()
    pg.wait_for_selector(".qf-done")
    card = pg.inner_text(".qf-card")
    check("demo shows the real thank-you screen", "QTG-1042" in card and "Tote bag" in card, card)
    check("demo sends nothing to the server", not posts, posts)
    pg.locator(".qf-done a.lk").click()
    pg.wait_for_url("**/demo/track")
    check("demo tracking page", "In production" in pg.inner_text("main") and "QTG-1042" in pg.inner_text("h1") and "threadtogo" in pg.inner_text("main").lower())

    pg.goto(BASE + "/demo/embroidery")
    pg.get_by_label("Your Name").fill("Ada Byron"); pg.get_by_label("Mobile Number").fill("(555) 987-6543"); pg.get_by_label("Email").fill("ada@example.com")
    pg.get_by_label("Personalization").fill("ADA")
    pg.locator(".qf-opt", has_text="BLUE").click(); pg.locator(".qf-opt", has_text="VARSITY").click(); pg.locator(".qf-opt", has_text="GOLD").click()
    pg.get_by_role("button", name="SUBMIT").click()
    pg.wait_for_selector(".qf-done")
    check("the live-embroidery demo takes an order", "QTG-1042" in pg.inner_text(".qf-card"))
    check("the live-embroidery demo sends nothing to the server", not posts, posts)

    # Demo invitation
    pg.goto(BASE + "/demo/invitation")
    pg.get_by_role("button", name="Tap the seal to open").click()
    pg.get_by_role("button", name="Accept your invitation").click(timeout=8000)
    pg.get_by_label("Your name").fill("Ava Stone"); pg.get_by_label("Email").fill("ava@example.com")
    pg.locator('.qf-opt[data-rsvp="yes"]').click()
    pg.get_by_role("button", name="Send my RSVP").click()
    pg.wait_for_selector(".qf-done")
    check("demo invitation takes an RSVP", "Ava" in pg.inner_text(".qf-card"))
    check("demo invitation sends nothing to the server", not posts, posts)
    check("demo pages aren't indexed", "noindex" in (pg.locator('meta[name="robots"]').get_attribute("content") or ""))

    check("no page errors", not errors, errors)
    b.close()

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
