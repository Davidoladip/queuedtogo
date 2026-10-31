"""Browser tests for the cover page (an opening page with a button that opens the form), against the
development harness.
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/cover.py
"""
import os, struct, sys, time, zlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://localhost:3000")
SHOTS = os.environ.get("SHOTS", "/tmp/claude-0/app-shots")
os.makedirs(SHOTS, exist_ok=True)
results = []

def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"), flush=True)

def wait_until(fn, timeout=6):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return True
        except Exception:
            pass
        time.sleep(0.2)
    return False

def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

CARD = {"name": "invitation.png", "mimeType": "image/png", "buffer": png(600, 400, (196, 160, 90))}
css = lambda page, sel, prop: page.eval_on_selector(sel, f"e => getComputedStyle(e)[{prop!r}]")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text and errors.append(m.text))

    # ------------------------------------------------------------ guests: invitation first, then the RSVP form
    pg.goto(BASE + "/dev/rsvp?cover=1"); pg.wait_for_selector(".qf-cover")
    check("the link opens on the cover page, not the form", pg.locator(".qf-form").count() == 0)
    cov = pg.inner_text(".qf-cover")
    check("the cover shows the heading, the event and the message", "You're invited!" in cov and "SAT, NOV 7" in cov.upper() and "Join us for Harbourfront Launch Party." in cov, cov)
    check("line breaks in the message are kept", css(pg, ".qf-cover-p", "whiteSpace") == "pre-line")
    check("the cover is a labelled section", pg.get_by_role("region", name="You're invited!").count() == 1)
    pg.screenshot(path=f"{SHOTS}/cover.png", full_page=True)
    pg.get_by_role("button", name="Accept your invitation").click()
    check("pressing the button opens the RSVP form", wait_until(lambda: pg.locator(".qf-form").count() == 1) and pg.locator(".qf-cover").count() == 0)
    check("focus moves to the form, for keyboard and screen-reader users", pg.evaluate("document.activeElement && document.activeElement.classList.contains('qf-head-t')"))
    pg.get_by_label("Your name").fill("Ava Stone"); pg.get_by_label("Email").fill("ava@example.com"); pg.locator('.qf-opt[data-rsvp="yes"]').click()
    pg.get_by_role("button", name="Send my RSVP").click()
    check("the RSVP still sends as normal", wait_until(lambda: "You're on the list!" in pg.inner_text(".qf-card")))
    pg.goto(BASE + "/dev/rsvp?cover=1&closed=1"); pg.wait_for_selector(".qf-closed")
    check("a closed form skips the cover and says it's closed", pg.locator(".qf-cover").count() == 0)
    pg.goto(BASE + "/dev/rsvp"); pg.wait_for_selector(".qf-form")
    check("forms without a cover open straight to the form", pg.locator(".qf-cover").count() == 0)
    m = b.new_page(viewport={"width": 390, "height": 844}, has_touch=True)
    m.goto(BASE + "/dev/rsvp?cover=1"); m.wait_for_selector(".qf-cover")
    check("the cover fits a phone screen", m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    m.get_by_role("button", name="Accept your invitation").tap()
    check("the button works by touch", wait_until(lambda: m.locator(".qf-form").count() == 1))
    m.close()

    # ------------------------------------------------------------ builder: adding and styling a cover
    pg.goto(BASE + "/dev/builder?rsvp=1"); pg.wait_for_selector(".b-frame .qf-wrap")
    pg.get_by_role("tab", name="Settings").click()
    pg.get_by_label("Show a cover page first").check()
    check("switching the cover on shows it in the preview", wait_until(lambda: pg.locator(".b-frame .qf-cover").count() == 1))
    check("RSVP forms get invitation wording", pg.locator('.b-frame [data-sid="__ctitle"]').inner_text() == "You're invited!" and pg.locator('.b-frame [data-sid="__cbtn"]').inner_text() == "Accept your invitation")
    pg.get_by_label("Cover heading").fill("Bisi & Fola's Baby Celebration")
    pg.get_by_label("Button text").fill("Open my invitation")
    pg.get_by_label("Cover message").fill("Please join us on {date}.\nLove, the family")
    check("the cover wording updates the preview", wait_until(lambda: pg.locator('.b-frame [data-sid="__ctitle"]').inner_text() == "Bisi & Fola's Baby Celebration"
        and pg.locator('.b-frame [data-sid="__cbtn"]').inner_text() == "Open my invitation" and "Please join us on Sat, Nov 7." in pg.inner_text(".b-frame .qf-cover-p")))
    card = pg.locator(".b-card", has_text="Cover page")
    card.locator("input[type=file]").set_input_files(CARD)
    check("invitation artwork can be uploaded to the cover", wait_until(lambda: pg.locator('.b-frame .qf-cover [data-sid="__cart"] img').count() == 1, 10))
    pg.get_by_role("button", name="Form", exact=True).click()
    check("the preview can switch between cover and form", wait_until(lambda: pg.locator(".b-frame .qf-cover").count() == 0 and pg.locator(".b-frame .qf-form").count() == 1))
    pg.get_by_role("button", name="Cover", exact=True).click()
    check("…and back to the cover", wait_until(lambda: pg.locator(".b-frame .qf-cover").count() == 1))
    pg.locator('.b-frame [data-sid="__ctitle"]').click()
    check("clicking the cover heading keeps you in Settings", pg.get_by_role("tab", name="Settings").get_attribute("aria-selected") == "true")
    card.get_by_role("button", name="Style the cover in Design →").click()
    pg.wait_for_selector(".elhead")
    check("the cover heading has its own style controls", "Cover page · heading" in pg.inner_text(".elhead"))
    el = pg.locator(".dsec", has_text="Element ID")
    el.get_by_label("Text colour colour code", exact=True).fill("#7B1FA2"); pg.wait_for_timeout(300)
    check("the cover heading can be coloured on its own", css(pg, '.b-frame [data-sid="__ctitle"]', "color") == "rgb(123, 31, 162)")
    pg.locator('.b-frame [data-sid="__cbtn"]').click()
    check("the cover button is its own styleable element", wait_until(lambda: "Cover page · button" in pg.inner_text(".elhead")))
    el = pg.locator(".dsec", has_text="Element ID")
    el.get_by_label("Background colour colour code", exact=True).fill("#C9A227"); pg.mouse.move(5, 5); pg.wait_for_timeout(300)
    check("the cover button takes its own colour", css(pg, '.b-frame [data-sid="__cbtn"]', "backgroundColor") == "rgb(201, 162, 39)")
    pg.locator('.b-frame [data-sid="__cart"]').click()
    check("the cover artwork has its own controls", wait_until(lambda: "Cover page · artwork" in pg.inner_text(".elhead")))
    pg.locator(".dsec", has_text="Element ID").get_by_role("button", name="Instead of heading").click()
    check("the artwork can replace the heading (for a ready-made invitation card)", wait_until(lambda: pg.locator('.b-frame [data-sid="__ctitle"]').count() == 0 and pg.locator(".b-frame .qf-cover h2.qf-vh").inner_text() == "Bisi & Fola's Baby Celebration"))
    pg.screenshot(path=f"{SHOTS}/cover-builder.png", full_page=True)
    pg.get_by_role("tab", name="Settings").click()
    pg.get_by_role("radio", name="An order form").click()
    check("switching to an order form swaps default cover wording only", wait_until(lambda: pg.get_by_label("Button text").input_value() == "Open my invitation"))

    pg.goto(BASE + "/dev/builder"); pg.wait_for_selector(".b-frame .qf-wrap")
    pg.get_by_role("tab", name="Settings").click()
    pg.get_by_label("Show a cover page first").check()
    check("order forms get welcome wording", wait_until(lambda: pg.locator('.b-frame [data-sid="__cbtn"]').inner_text() == "Start your order"))

    # ------------------------------------------------------------ luxury invitation finish
    pg.goto(BASE + "/dev/rsvp?cover=lux"); pg.wait_for_selector(".qf-cover")
    check("the luxury look has a double gold frame", pg.locator(".qf-cover.qf-cover-frame-double").count() == 1 and css(pg, ".qf-cover", "paddingTop") != "0px")
    check("the heading has a gold foil finish", pg.locator(".qf-cover.qf-cover-foil").count() == 1 and pg.eval_on_selector('[data-sid="__ctitle"]', "e => getComputedStyle(e).webkitTextFillColor") == "rgba(0, 0, 0, 0)")
    check("the heading uses an elegant script font", "Pinyon Script" in css(pg, '[data-sid="__ctitle"]', "fontFamily"))
    check("there's a subtle sparkle, hidden from screen readers", pg.locator(".qf-sparkles[aria-hidden=true] .qf-spark").count() >= 10)
    check("ivory card, gold button, black page", css(pg, ".qf-card", "backgroundColor") == "rgb(251, 247, 238)" and "linear-gradient" in css(pg, '[data-sid="__cbtn"]', "backgroundImage") and css(pg, ".qf-wrap", "backgroundColor") == "rgb(20, 18, 16)")
    pg.screenshot(path=f"{SHOTS}/cover-luxury.png", full_page=True)
    pg.get_by_role("button", name="Accept your invitation").click()
    check("pressing the button parts the card to reveal the form", wait_until(lambda: pg.locator(".qf-doors .qf-cover-door").count() == 2, 2) and pg.locator(".qf-form").count() == 1)
    pg.wait_for_timeout(650); pg.screenshot(path=f"{SHOTS}/cover-unveil.png")
    check("the opening finishes and leaves just the form", wait_until(lambda: pg.locator(".qf-doors").count() == 0, 3) and pg.locator(".qf-form").is_visible())
    rm = b.new_page(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
    rm.goto(BASE + "/dev/rsvp?cover=lux"); rm.wait_for_selector(".qf-cover")
    rm.get_by_role("button", name="Accept your invitation").click()
    check("with reduced motion, the form opens without the animation", wait_until(lambda: rm.locator(".qf-form").count() == 1) and rm.locator(".qf-doors").count() == 0)
    rm.close()

    pg.goto(BASE + "/dev/builder?rsvp=1"); pg.wait_for_selector(".b-frame .qf-wrap")
    pg.get_by_role("tab", name="Settings").click()
    pg.get_by_label("Show a cover page first").check()
    pg.get_by_role("button", name="Apply this look").click()
    check("one click applies the luxury look to the preview", wait_until(lambda: css(pg, ".b-frame .qf-card", "backgroundColor") == "rgb(251, 247, 238)") and pg.locator(".b-frame .qf-cover-frame-double").count() == 1)
    check("…and switches the finish settings on", pg.get_by_label("Gold foil heading").is_checked() and pg.get_by_label("Subtle sparkle").is_checked())
    pg.get_by_role("button", name="Play the opening").click()
    check("the opening can be played in the preview", wait_until(lambda: pg.locator(".b-frame .qf-doors").count() == 1, 3))
    check("…and the preview ends on the form", wait_until(lambda: pg.locator(".b-frame .qf-doors").count() == 0 and pg.locator(".b-frame .qf-form").count() == 1, 4))
    pg.get_by_role("button", name="Cover", exact=True).click()
    pg.get_by_label("Subtle sparkle").uncheck()
    check("each finish can be switched off", wait_until(lambda: pg.locator(".b-frame .qf-sparkles").count() == 0))
    pg.get_by_role("button", name="Undo").click(); pg.get_by_role("button", name="Undo").click()
    check("the look can be undone", wait_until(lambda: css(pg, ".b-frame .qf-card", "backgroundColor") != "rgb(251, 247, 238)"))

    # ------------------------------------------------------------ stylish fonts
    pg.goto(BASE + "/dev/builder?rsvp=1"); pg.wait_for_selector(".b-frame .qf-wrap")
    pg.get_by_role("tab", name="Design").click()
    pg.locator(".dsec > summary", has_text="Typography").click()
    check("there are more font styles to pick from", wait_until(lambda: pg.locator(".fontpick button").count() >= 17))
    pg.locator(".fontpick button", has_text="Romantic").click()
    check("a script font style changes the form title", wait_until(lambda: "Great Vibes" in css(pg, '.b-frame [data-sid="__title"]', "fontFamily")))
    check("the body uses the style's body font", "Cormorant Garamond" in css(pg, ".b-frame .qf-label", "fontFamily"))
    check("only the fonts in use are requested from Google Fonts", pg.evaluate("[...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href.includes('Great+Vibes') && !l.href.includes('Bebas'))"))
    pg.locator('.b-frame [data-sid="__title"]').click()
    el = pg.locator(".dsec", has_text="Element ID")
    groups = el.get_by_label("Font", exact=True).locator("optgroup")
    check("the element font list is grouped (serif, script and more)", groups.count() == 6 and "Script and handwritten" in [groups.nth(i).get_attribute("label") for i in range(groups.count())])
    el.get_by_label("Font", exact=True).select_option("pinyon")
    check("one element can use its own stylish font", wait_until(lambda: "Pinyon Script" in css(pg, '.b-frame [data-sid="__title"]', "fontFamily")) and "Pinyon Script" not in css(pg, ".b-frame .qf-label", "fontFamily"))
    check("the picker shows a sample in the chosen font", "Pinyon Script" in css(pg, ".font-sample", "fontFamily"))
    pg.screenshot(path=f"{SHOTS}/fonts-builder.png", full_page=True)

    check("no browser errors", not errors, errors[:5])
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
