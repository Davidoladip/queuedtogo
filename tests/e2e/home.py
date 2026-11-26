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
    check("one main heading that says what QueuedToGo is", pg.locator("h1").count() == 1 and pg.inner_text("h1") == "Personalized Digital Invitation And Live Guest Experience Platform", pg.inner_text("h1"))
    check("no fine print under the hero buttons", pg.locator(".hm-hero .hm-fine").count() == 0)
    cta = pg.locator(".hm-hero .hm-cta a")
    check("the hero buttons are How it works and Try the builder", cta.all_inner_texts() == ["How it works", "Try the builder"], cta.all_inner_texts())
    check("How it works jumps to the how-it-works section, Try the builder to sign-up", cta.nth(0).get_attribute("href") == "#how" and cta.nth(1).get_attribute("href") == "/signup")
    check("the lede sums up what it does", all(x in pg.inner_text(".hm-lede") for x in ["live activation form", "ticketed event", "personalized digital invitation", "real-time text notifications"]))
    lg = pg.locator(".hm-top .brand")
    check("the logo arrow comes after the name", lg.locator(".brand-mark").bounding_box()["x"] > lg.locator(".brand-name").bounding_box()["x"] + lg.locator(".brand-name").bounding_box()["width"] - 1)
    desc = pg.locator('meta[name="description"]').get_attribute("content") or ""
    check("search description", "QR-code form" in desc, desc)
    check("share image", (pg.locator('meta[property="og:image"]').get_attribute("content") or "").endswith("/og.png"))
    check("the header's Start building goes to sign-up", pg.locator(".hm-top").get_by_role("link", name="Start building").get_attribute("href") == "/signup")
    check("sign in link", pg.get_by_role("link", name="Sign in").first.get_attribute("href") == "/login")
    for anchor in ("#how", "#examples", "#invitations", "#pricing"):
        check(f"menu link {anchor} has a target", pg.locator(anchor).count() == 1)
    reel = pg.locator(".hm-hero .hm-stage .hr")
    check("the moving cards sit in the hero's picture spot, beside the headline", reel.count() == 1 and abs(reel.bounding_box()["y"] - pg.locator(".hm-hero-copy").bounding_box()["y"]) < 160, reel.bounding_box() if reel.count() else None)
    check("the cards sit in a single row", pg.locator(".hr-window").count() == 1 and len({round(c.bounding_box()["y"]) for c in pg.locator(".hr-list:not(.hr-copy) .hr-card").all()}) == 1)
    cards_h = pg.locator(".hr-card").first.bounding_box()["height"]
    check("the cards are sized to fill the picture spot", cards_h >= 280 and pg.locator(".hr-card").first.bounding_box()["width"] >= 290, cards_h)
    check("screen readers get the six cards once (the looping copy is hidden)", pg.locator(".hr-window .hr-list:not([aria-hidden])").count() == 1 and pg.locator(".hr-list[aria-hidden=true] .hr-card").count() == 6)
    check("steps are an ordered list (three per experience)", pg.locator("ol.hm-steps").count() == 3 and pg.locator("ol.hm-steps > li").count() == 9)

    imgs = pg.locator("main img")
    for i in range(imgs.count()):
        imgs.nth(i).scroll_into_view_if_needed()
    pg.wait_for_timeout(800)
    broken = pg.evaluate("[...document.querySelectorAll('main img')].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.alt)")
    check("all screenshots load", imgs.count() == 5 and not broken, (imgs.count(), broken))
    check("every screenshot has a description", all(len(imgs.nth(i).get_attribute("alt") or "") > 20 for i in range(imgs.count())))

    plans = pg.locator(".hm-plan")
    prices = [plans.nth(i).locator(".hm-price b").inner_text() for i in range(plans.count())]
    check("three paid plans and no Free plan", prices == ["$29", "$69", "$139"], prices)
    annual = [plans.nth(i).locator(".hm-annual").inner_text() for i in range(plans.count())]
    check("annual prices on the homepage", annual == ["or $290 a year (2 months free)", "or $690 a year (2 months free)", "or $1,390 a year (2 months free)"], annual)
    body = pg.inner_text("body").lower()
    check("no free trial or Free plan offered anywhere on the page", not any(x in body for x in ("14-day", "free for 14 days", "start free", "no card needed", "free plan,")), [x for x in ("14-day", "free for 14 days", "start free", "no card needed", "free plan,") if x in body])
    check("plan buttons say Choose and go to sign-up", pg.get_by_role("link", name="Choose Pro").get_attribute("href") == "/signup")
    passes = pg.locator(".hm-pass-list").inner_text()
    check("event pass prices and texts", all(x in passes for x in ("$59", "$99", "$149", "300 texts included", "900 texts included", "2,000 texts included")), passes)
    check("passes work for any kind of form", "orders, tickets or RSVPs" in pg.inner_text(".hm-passes-copy"))
    check("the pricing intro says building is free", "Build and test your forms for free" in pg.inner_text("#pricing .hm-sub"))
    first = pg.locator(".hm-faq details").first
    first.locator("summary").click()
    check("questions open", first.get_attribute("open") is not None and "browser" in first.inner_text())
    check("contact and legal links in the footer", pg.locator('footer a[href="/terms"]').count() == 1 and pg.locator('footer a[href="/terms-of-service"]').count() == 1 and pg.locator('footer a[href="/privacy"]').count() == 1
          and pg.locator('footer a[href="mailto:hello@threadtogo.com"]').count() == 1)
    pg.keyboard.press("Home"); pg.mouse.move(0, 0)
    pg.goto(BASE + "/"); pg.keyboard.press("Tab")
    check("skip link comes first", pg.evaluate("document.activeElement.textContent") == "Skip to content")
    pg.screenshot(path=f"{SHOTS}/home-desktop.png", full_page=True)

    # Reduced motion: the final state shows straight away
    rm = b.new_context(viewport={"width": 1366, "height": 860}, reduced_motion="reduce").new_page()
    rm.goto(BASE + "/")
    a0 = rm.evaluate("() => document.querySelector('.hr-window').scrollLeft"); rm.wait_for_timeout(700)
    check("with reduced motion the cards stand still", rm.evaluate("() => document.querySelector('.hr-window').scrollLeft") == a0)

    # Phone
    ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    ph.goto(BASE + "/"); ph.wait_for_timeout(5200)
    check("no sideways scrolling on a phone", ph.evaluate("document.documentElement.scrollWidth") <= 390)
    check("menu links are hidden on a phone but Start building stays", not ph.locator(".hm-nav").is_visible() and ph.locator(".hm-top .hm-btn").is_visible())
    hb = ph.locator(".hm-stage").bounding_box(); cb = ph.locator(".hm-hero-copy").bounding_box()
    check("on a phone the moving cards come after the headline and buttons", hb["y"] >= cb["y"] + cb["height"] - 1, (hb, cb))
    ph.screenshot(path=f"{SHOTS}/home-phone.png", full_page=True)

    # One working sample form per template, shown live in phone frames
    check("sample forms heading", pg.inner_text("#hm-ex") == "Sample forms for every kind of event")
    frames = pg.locator(".hm-device iframe")
    check("one sample form for each of the 10 templates", frames.count() == 10, frames.count())
    srcs = [frames.nth(i).get_attribute("src") for i in range(frames.count())]
    check("each frame shows a different template", len(set(srcs)) == 10 and all(x.startswith("/demo/template/") for x in srcs), srcs)
    kinds = pg.locator(".hm-ex-item figcaption small").all_inner_texts()
    check("orders, tickets and RSVPs are all represented", {"Take orders", "Sell tickets", "Collect RSVPs"} <= set(kinds), kinds)
    frames.first.scroll_into_view_if_needed()
    f1 = pg.frame_locator(".hm-device iframe").first
    check("the first sample loads inside its frame", len(f1.locator(".qf-title").inner_text(timeout=10000)) > 0)
    check("no demo strip inside the frame", f1.locator(".demo-bar").count() == 0)
    check("frames have titles for screen readers", all("working demo" in (frames.nth(i).get_attribute("title") or "") for i in range(10)))
    rowl = pg.locator(".hm-ex-row")
    x0 = rowl.evaluate("e => e.scrollLeft")
    pg.click("button[aria-label='Next sample form']"); pg.wait_for_timeout(900)
    x1 = rowl.evaluate("e => e.scrollLeft")
    check("the Next arrow scrolls to more samples", x1 > x0, (x0, x1))
    pg.click("button[aria-label='Previous sample form']"); pg.wait_for_timeout(900)
    check("the Previous arrow scrolls back", rowl.evaluate("e => e.scrollLeft") < x1)
    rowl.evaluate("e => e.scrollLeft = e.scrollWidth"); pg.wait_for_timeout(1000)
    fl = pg.frame_locator(".hm-device iframe").last
    check("the last sample loads when scrolled to", len(fl.locator(".qf-title").first.inner_text(timeout=15000)) > 0)
    hdr = pg.request.get(BASE + "/demo?frame=1").headers
    # The page policy goes out enforced or report-only (CSP_ENFORCE); X-Frame-Options blocks framing either way.
    csp = hdr.get("content-security-policy", "") or hdr.get("content-security-policy-report-only", "")
    check("demo pages may be framed by this site only", hdr.get("x-frame-options") == "SAMEORIGIN" and "frame-ancestors 'self'" in csp and "frame-ancestors 'none'" not in csp, csp)
    hdr = pg.request.get(BASE + "/login").headers
    check("every other page refuses to be framed", hdr.get("x-frame-options") == "DENY" and "frame-ancestors 'none'" in (hdr.get("content-security-policy", "") or hdr.get("content-security-policy-report-only", "")), hdr)
    pol = hdr.get("content-security-policy", "") + " " + hdr.get("content-security-policy-report-only", "")
    check("pages carry a script policy with a per-request nonce", "'nonce-" in pol and "object-src 'none'" in pol, pol[:200])
    hdr = pg.request.get(BASE + "/demonstration-not-a-demo").headers
    check("only the demo paths are framable", hdr.get("x-frame-options") == "DENY", hdr)

    # How it works: summary, three experiences as tabs, and what's included
    pg.goto(BASE + "/")
    how = pg.locator("#how")
    check("How it works opens with a summary of the whole platform", all(x in how.locator(".hw-sum").inner_text() for x in ["order form", "ticketed event", "digital invitation", "text updates"]))
    tabs = how.get_by_role("tab")
    check("three experiences, as tabs", tabs.all_inner_texts() == ["Live event forms", "Ticketed events", "Digital invitations"], tabs.all_inner_texts())
    check("the first is shown first, with three steps", tabs.nth(0).get_attribute("aria-selected") == "true" and how.locator(".hw-panel:not([hidden]) .hm-steps li").count() == 3 and "Build your order form" in how.locator(".hw-panel:not([hidden])").inner_text())
    tabs.nth(1).click()
    check("choosing Ticketed events shows its steps", "Set up your tickets" in how.locator(".hw-panel:not([hidden])").inner_text() and tabs.nth(1).get_attribute("aria-selected") == "true" and how.locator(".hw-panel:not([hidden])").count() == 1)
    tabs.nth(1).focus(); pg.keyboard.press("ArrowRight")
    check("arrow keys move between tabs", tabs.nth(2).get_attribute("aria-selected") == "true" and "Design your invitation" in how.locator(".hw-panel:not([hidden])").inner_text() and pg.evaluate("() => document.activeElement.id") == "hw-tab-invites")
    pg.keyboard.press("Home")
    check("Home goes back to the first", tabs.nth(0).get_attribute("aria-selected") == "true")
    check("every step's text is in the page for search engines, even on hidden tabs", how.locator(".hw-panel .hm-steps li").count() == 9)
    inc = how.locator(".hw-inc-list li b").all_inner_texts()
    check("what every experience includes is listed", len(inc) == 5 and "Event-day tools" in inc, inc)

    # Hero summary and ticket sales
    pg.goto(BASE + "/")
    does = pg.locator(".hr-list:not(.hr-copy) .hr-card b").all_inner_texts()
    check("the hero cards sum up everything QueuedToGo does", does == ["Take orders", "Sell tickets", "Send invitations", "Track every order", "Keep people posted", "Run the day"], does)
    check("each item has an illustration", pg.locator(".hr-list:not(.hr-copy) .hr-art svg").count() == 6)

    pg.mouse.move(5, 5)
    pos = lambda: pg.evaluate("() => document.querySelector('.hr-window').scrollLeft")
    pg.wait_for_timeout(400); a = pos(); pg.wait_for_timeout(800); b2 = pos()
    check("the cards scroll by themselves", b2 > a + 10, (a, b2))
    pg.get_by_role("button", name="Pause the moving cards").click()
    a = pos(); pg.wait_for_timeout(700); b2 = pos()
    check("Pause stops them, and says so", abs(a - b2) < 0.5 and pg.locator(".hr-toggle").get_attribute("aria-pressed") == "true" and "Play" in pg.locator(".hr-toggle").inner_text(), (a, b2))
    a = pos(); pg.get_by_role("button", name="Next card").click(); pg.wait_for_timeout(600)
    cw = pg.locator(".hr-card").first.bounding_box()["width"]
    check("the Next arrow moves along one card", abs(pos() - a - (cw + 22)) < 3 or pos() < a, (a, pos(), cw))
    a = pos(); pg.get_by_role("button", name="Previous card").click(); pg.wait_for_timeout(600)
    check("the Previous arrow moves back one card", abs((a - pos()) - (cw + 22)) < 3 or pos() > a, (a, pos()))
    win = pg.locator(".hr-window"); bb = win.bounding_box()
    a = pos(); pg.mouse.move(bb["x"] + bb["width"] * .7, bb["y"] + bb["height"] / 2); pg.mouse.down()
    pg.mouse.move(bb["x"] + bb["width"] * .3, bb["y"] + bb["height"] / 2, steps=6); pg.mouse.up()
    check("the cards can be dragged with a mouse", pos() > a + 100, (a, pos()))
    a = pos(); pg.mouse.wheel(260, 0); pg.wait_for_timeout(300)
    check("…and scrolled with a trackpad or wheel", pos() > a + 100 or pos() < a, (a, pos()))
    win.focus(); a = pos(); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(300)
    check("…and with the arrow keys once focused", pos() != a, (a, pos()))
    check("the scroll area is a labelled region", win.get_attribute("role") == "region" and win.get_attribute("aria-labelledby") == "hr-h" and win.get_attribute("tabindex") == "0")
    pg.evaluate("() => { const w = document.querySelector('.hr-window'); const L = document.querySelector('.hr-list').offsetWidth; w.scrollLeft = L + 40; }"); pg.wait_for_timeout(200)
    check("it loops seamlessly: scrolling past the end comes round to the start", pos() < pg.evaluate("() => document.querySelector('.hr-list').offsetWidth"), pos())
    pg.get_by_role("button", name="Play the moving cards").click(); pg.mouse.move(5, 5)
    pg.wait_for_timeout(3800); a = pos(); pg.wait_for_timeout(600)
    check("Play starts it again (after a short rest following manual scrolling)", pos() > a + 5, (a, pos()))
    cards_h = pg.locator(".hr").bounding_box()["height"]; copy_h = pg.locator(".hm-hero-copy").bounding_box()["height"]
    check("the carousel is sized to match the headline column", abs(cards_h - copy_h) < copy_h * 0.25, (cards_h, copy_h))
    rm = b.new_page(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
    rm.goto(BASE + "/")
    rp = lambda: rm.evaluate("() => document.querySelector('.hr-window').scrollLeft")
    rm.wait_for_timeout(300); a = rp(); rm.wait_for_timeout(900)
    check("with reduced motion the cards never move by themselves, but can still be scrolled", abs(rp() - a) < 0.5 and not rm.locator(".hr-toggle").is_visible() and rm.get_by_role("button", name="Next card").is_visible(), (a, rp()))
    rm.close()
    check("the menu links to tickets", pg.locator('.hm-nav a[href="#tickets"]').count() == 1)
    tix = pg.locator("#tickets")
    check("a section explains hosting paid events and selling tickets", tix.get_by_role("heading", name="Host paid events and sell tickets").count() == 1 and "Stripe or Square" in tix.inner_text())
    check("the ticket section states the booking fee range", "0.5% to 3%" in tix.inner_text(), tix.inner_text()[-200:])
    check("the FAQ answers whether you can sell tickets", pg.get_by_text("Can I sell tickets to a paid event?").count() == 1)

    # Legal pages: Terms of Service with the clauses that matter, linked from the footer and the sitemap
    pg.goto(BASE + "/terms-of-service")
    tos = pg.locator("article").inner_text()
    check("Terms of Service page states auto-renewal, cancellation, arbitration and the class waiver",
          all(x in tos for x in ["renew automatically", "cancel online at any time", "binding individual arbitration", "No class actions", "Opting out", "Limitation of liability", "Copyright complaints"]), tos[:200])
    check("Terms of Service names the operator and governing law", "ThreadToGo LLC" in tos and "laws of the State of Maryland" in tos)
    pg.goto(BASE + "/privacy")
    pv = pg.locator("article").inner_text()
    check("privacy policy lists every provider that handles personal data", all(x in pv for x in ["Stripe", "Square", "Twilio", "Supabase", "Vercel", "Google", "Cloudflare"]), pv[:200])
    check("privacy policy covers cookies, children and state privacy rights", all(x in pv for x in ["Cookies", "Children", "Appeal", "do not sell"]), pv[:200])
    pg.goto(BASE + "/")

    # Search engines: robots.txt, sitemap, structured data, and private pages kept out of results
    import json as _json, re as _re
    txt = pg.request.get(BASE + "/robots.txt").text()
    check("robots.txt allows the site, blocks API routes and points to the sitemap", "Allow: /" in txt and "Disallow: /api/" in txt and "Sitemap: " in txt and "Disallow: /\n" not in txt, txt)
    sm = pg.request.get(BASE + "/sitemap.xml").text()
    check("sitemap lists the public pages and no private ones", all(f"/{p}</loc>" in sm for p in ["", "signup", "privacy", "terms", "terms-of-service"]) and "/w/" not in sm and "/demo" not in sm, sm[:300])
    home = pg.request.get(BASE + "/").text()
    m = _re.search(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', home, _re.S)
    types = [g["@type"] for g in _json.loads(m.group(1))["@graph"]] if m else []
    check("homepage has Organization, WebSite, SoftwareApplication and FAQPage data", types == ["Organization", "WebSite", "SoftwareApplication", "FAQPage"], types)
    check("homepage has a canonical link and a description", 'rel="canonical"' in home and 'name="description"' in home)
    check("homepage is indexable", "noindex" not in home and not pg.request.get(BASE + "/").headers.get("x-robots-tag"))
    for path in ["/w/anything", "/f/a/b", "/t/x", "/r/x", "/pay/x", "/onboarding", "/forgot-password", "/demo"]:
        check(f"{path} is kept out of search results", pg.request.get(BASE + path, max_redirects=0).headers.get("x-robots-tag") == "noindex")

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

    # Every template's sample form works full screen
    keys = ["market-stall","live-personalisation","food-truck","merch-table","concert-night","workshop","wedding","birthday","baby-shower","community"]
    ok = []
    for k in keys:
        r = pg.request.get(BASE + f"/demo/template/{k}")
        ok.append(r.status == 200 and "noindex" in r.text())
    check("all 10 template demo pages load and are not indexed", all(ok), ok)
    check("an unknown template is a 404", pg.request.get(BASE + "/demo/template/nope").status == 404)
    pg.goto(BASE + "/demo/template/food-truck")
    check("template demo says it's a sample and nothing is saved", "Food truck template" in pg.inner_text(".demo-bar") and "nothing you type is saved" in pg.inner_text(".demo-bar"))
    check("template demo links back to more samples", pg.locator(".demo-bar a[href='/#examples']").count() == 1)
    posts2 = []
    pg.on("request", lambda r: posts2.append(r.url) if r.method == "POST" else None)
    pg.locator(".qf-card button[type=submit]").last.click()
    pg.wait_for_timeout(800)
    check("template demo checks answers like a real form", pg.locator(".qf-ferr:not(:empty)").count() >= 1)
    check("template demo sends nothing to the server", not posts2, posts2)

    check("no page errors", not errors, errors)
    b.close()

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
