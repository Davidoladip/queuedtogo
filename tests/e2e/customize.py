"""Browser tests for the design upgrade: option styles, heading artwork, question/option artwork,
colour swatches and editable customer messages.

Runs against the development harness (in-memory saves and an in-memory image store):
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/customize.py
"""
import os, re, sys, struct, zlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://localhost:3000")
SHOTS = os.environ.get("SHOTS", "/tmp/claude-0/app-shots")
os.makedirs(SHOTS, exist_ok=True)
results = []

def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"), flush=True)

def png(w, h, rgb):
    """A small solid-colour PNG, built by hand so the test needs no image library."""
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

LOGO = {"name": "logo.png", "mimeType": "image/png", "buffer": png(400, 200, (232, 99, 58))}
LOGO2 = {"name": "logo2.png", "mimeType": "image/png", "buffer": png(300, 300, (18, 48, 107))}
SHIRT = {"name": "shirt.png", "mimeType": "image/png", "buffer": png(240, 240, (20, 120, 90))}

def css(page, sel, prop):
    return page.eval_on_selector(sel, f"e => getComputedStyle(e).{prop}")

def wait_img(page, sel):
    page.wait_for_function(f"() => {{ const i = document.querySelector({sel!r}); return i && i.complete && i.naturalWidth > 0; }}", timeout=10000)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1360, "height": 900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text and errors.append(m.text))

    # ------------------------------------------------------------ customer form: option colour swatches
    pg.goto(BASE + "/dev/form")
    pg.get_by_label("Your name").fill("Lena")
    pg.get_by_label("Mobile number").fill("5551234567")
    pg.get_by_role("button", name="Next").click()
    check("option swatches show beneath their option", pg.locator(".qf-optw .qf-sw .qf-sw-dot").count() == 3)
    check("swatch names can be shown", "Black" in pg.inner_text(".qf-optw .qf-sw"))
    dot = pg.locator(".qf-optw .qf-sw-dot").first
    check("swatches are round by default", css(pg, ".qf-optw .qf-sw-dot", "borderTopLeftRadius") == "50%" and dot.bounding_box()["width"] == dot.bounding_box()["height"])
    pg.locator(".qf-opt", has_text="Hoodie").click()
    pg.get_by_label("Email").fill("lena@example.com")
    pg.get_by_role("button", name="Place my order").click()
    check("a required colour must be chosen for the picked option", "Choose a colour for Hoodie." in pg.inner_text(".qf-page:not([hidden])"))
    pg.get_by_role("radio", name="Red (#C62828)").check()
    picked = pg.evaluate("() => { const fd = new FormData(document.querySelector('.qf-form')); return [...fd.entries()].filter(([k]) => k.endsWith('__color')).map(([k, v]) => v); }")
    check("the chosen colour is part of the customer's answers", picked == ["Red (#C62828)"], picked)
    pg.get_by_role("button", name="Place my order").click()
    pg.wait_for_selector(".qf-done")
    check("with the colour chosen, the order goes through", "You're in the queue" in pg.inner_text(".qf-card"))

    # ------------------------------------------------------------ builder: options editor
    pg.goto(BASE + "/dev/builder")
    pg.locator(".b-frame .qf-opt", has_text="Hoodie").first.click()
    row = pg.locator(".b-row.open")
    check("options are edited one per row", row.locator(".b-opt").count() == 3)
    row.get_by_role("button", name="+ Add option").click()
    row.get_by_role("textbox", name="option 4", exact=True).fill("Tote bag")
    check("a new option appears in the preview", pg.locator(".b-frame .qf-opt", has_text="Tote bag").count() == 1)
    row.get_by_role("button", name="Move option 2 up").click()
    labels = pg.eval_on_selector_all(".b-frame .qf-opts:has(.qf-optw) > *", "els => els.map(e => e.innerText.split('\\n')[0].trim())")
    check("moving an option keeps its colour swatches with it", labels[:2] == ["Hoodie", "T-shirt"] and pg.locator(".b-frame .qf-optw", has_text="Hoodie").count() == 1, labels)

    # Option artwork and swatches
    row.get_by_role("button", name="Artwork, colours and style for T-shirt").click()
    row.locator(".b-opt.open input[type=file]").first.set_input_files(SHIRT)
    pg.wait_for_selector(".b-frame .qf-opt .qf-art-blk img")
    wait_img(pg, ".b-frame .qf-opt .qf-art-blk img")
    check("option artwork uploads and shows inside the option", pg.locator(".b-frame .qf-opt", has_text="T-shirt").locator("img").count() == 1)
    row.locator(".b-opt.open").get_by_role("button", name="+ Add colour swatches").click()
    check("option swatches can be added", pg.locator(".b-frame .qf-optw", has_text="T-shirt").locator(".qf-sw-dot").count() == 3)
    sw = row.locator(".b-opt.open .b-sw-ed")
    sw.get_by_label("Colour 1", exact=True).fill("#FF00AA"); pg.wait_for_timeout(200)
    first_dot = pg.locator(".b-frame .qf-optw", has_text="T-shirt").locator(".qf-sw-dot").first
    check("a swatch's colour is set with a HEX code", first_dot.evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(255, 0, 170)")
    sw.get_by_role("button", name="Move colour 1 down").click()
    check("swatches can be reordered", pg.locator(".b-frame .qf-optw", has_text="T-shirt").locator(".qf-sw-dot").nth(1).evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(255, 0, 170)")
    sw.get_by_role("button", name="+ Add colour").click()
    check("swatches can be added one at a time", pg.locator(".b-frame .qf-optw", has_text="T-shirt").locator(".qf-sw-dot").count() == 4)
    sw.get_by_role("button", name="Remove colour 4").click()
    check("swatches can be removed", pg.locator(".b-frame .qf-optw", has_text="T-shirt").locator(".qf-sw-dot").count() == 3)

    # ------------------------------------------------------------ design: one option / question / form
    row.locator(".b-opt.open").get_by_role("button", name="Style this option in Design →").click()
    el = pg.locator(".dsec", has_text="Element ID")
    pg.wait_for_selector("text=This option only")
    check("'Style this option' opens its own controls in Design", "option “T-shirt”" in pg.inner_text(".elhead"))
    TSHIRT = '.b-frame .qf-opt:has-text("T-shirt") > span'
    CAP = '.b-frame .qf-opt:has-text("Cap") > span'
    el.get_by_label("Background colour colour code", exact=True).fill("#FFD54F"); pg.wait_for_timeout(300)
    check("one option can have its own background", css(pg, TSHIRT, "backgroundColor") == "rgb(255, 213, 79)" and css(pg, CAP, "backgroundColor") != "rgb(255, 213, 79)")
    el.get_by_role("button", name="All options in this question").click()
    el.get_by_label("Text colour colour code", exact=True).fill("#6A1B9A"); pg.wait_for_timeout(300)
    check("a style can apply to all options in the question", css(pg, CAP, "color") == "rgb(106, 27, 154)")
    el.get_by_label("Background colour colour code", exact=True).fill("#E0F7FA"); pg.wait_for_timeout(300)
    check("the question style keeps the option's own override", css(pg, TSHIRT, "backgroundColor") == "rgb(255, 213, 79)" and css(pg, CAP, "backgroundColor") == "rgb(224, 247, 250)")
    el.get_by_role("button", name="Stacked").click(); pg.wait_for_timeout(200)
    check("options can be stacked vertically", css(pg, ".b-frame .qf-field:has(.qf-optw) .qf-opts", "flexDirection") == "column")
    el.get_by_label("Space between options").fill("20"); pg.wait_for_timeout(200)
    check("spacing between options is adjustable", css(pg, ".b-frame .qf-field:has(.qf-optw) .qf-opts", "rowGap") == "20px")
    el.get_by_role("button", name="All option buttons in the form").click()
    el.get_by_label("Border colour colour code", exact=True).fill("#00897B"); pg.wait_for_timeout(300)
    check("a form-wide option style applies", css(pg, CAP, "borderTopColor") == "rgb(0, 137, 123)")
    el.get_by_role("button", name="This option only").click()
    el.get_by_label("Show a shadow").check(); pg.wait_for_timeout(200)
    check("an option can have a shadow", css(pg, TSHIRT, "boxShadow") != "none" and css(pg, CAP, "boxShadow") == "none")
    el.get_by_role("spinbutton", name=re.compile(r"^Opacity")).last.fill("60"); pg.wait_for_timeout(200)
    check("an option's opacity is adjustable", css(pg, TSHIRT, "opacity") == "0.6")
    el.get_by_role("button", name="Selected", exact=True).click()
    check("the selected state previews on that option", pg.locator(".b-frame .qf-opt.fs-selected", has_text="T-shirt").count() == 1)
    pg.get_by_role("button", name="Show default").click()
    el.get_by_role("button", name="Reset this option").click(); pg.wait_for_timeout(200)
    check("resetting the option returns it to the question style", css(pg, TSHIRT, "backgroundColor") == "rgb(224, 247, 250)" and css(pg, TSHIRT, "opacity") == "1")

    # Option artwork styling from the preview
    pg.locator('.b-frame .qf-opt:has-text("T-shirt") .qf-art-blk').click()
    pg.wait_for_selector("text=Position and spacing")
    check("clicking option artwork opens its styling", "artwork" in pg.inner_text(".elhead"))
    el = pg.locator(".dsec", has_text="Element ID")
    el.get_by_role("button", name="Left of text").click(); pg.wait_for_timeout(200)
    check("option artwork can sit beside the text", pg.locator(".b-frame .qf-opt-c.left").count() == 1)

    # ------------------------------------------------------------ heading artwork
    pg.get_by_role("tab", name="Questions").click()
    pg.locator(".b-card > summary", has_text="Form heading").click()
    head = pg.locator(".b-card", has_text="Heading artwork")
    head.locator("input[type=file]").set_input_files(LOGO)
    pg.wait_for_selector(".b-frame .qf-head .qf-art-blk img")
    wait_img(pg, ".b-frame .qf-head .qf-art-blk img")
    check("heading artwork uploads and shows with the heading", pg.locator(".b-frame .qf-head img").count() == 1)
    check("the upload has a preview in the editor", head.locator(".b-art img").count() == 1)
    head.get_by_role("radio", name="Left").first.click()
    check("heading artwork can sit left of the heading", pg.locator(".b-frame .qf-head-left").count() == 1)
    head.get_by_role("radio", name="Below").first.click()
    check("heading artwork can sit below the heading", pg.locator(".b-frame .qf-head-below").count() == 1)
    pg.locator(".b-frame .qf-head .qf-art-blk").click()
    head.get_by_role("button", name="More artwork styling in Design →").click()
    pg.wait_for_selector("text=Maximum width")
    el = pg.locator(".dsec", has_text="Element ID")
    el.get_by_label("Maximum width").fill("90"); pg.wait_for_timeout(200)
    check("maximum width applies", css(pg, ".b-frame .qf-head .qf-art-in", "maxWidth") in ("min(100%, 90px)", "90px"), css(pg, ".b-frame .qf-head .qf-art-in", "maxWidth"))
    el.get_by_label("Maximum width").fill("0")
    el.get_by_label("Border width").fill("3"); pg.wait_for_timeout(200)
    el.get_by_label("Border colour colour code", exact=True).fill("#C2185B"); pg.wait_for_timeout(200)
    check("artwork border applies", css(pg, ".b-frame .qf-head .qf-art-in", "borderTopWidth") == "3px" and css(pg, ".b-frame .qf-head .qf-art-in", "borderTopColor") == "rgb(194, 24, 91)")
    el.get_by_label("Padding left").fill("12"); pg.wait_for_timeout(200)
    check("artwork padding applies", css(pg, ".b-frame .qf-head .qf-art-in", "paddingLeft") == "12px")
    w0 = pg.locator(".b-frame .qf-head .qf-art-in").bounding_box()["width"]
    h = pg.locator(".b-frame .qf-rsz").bounding_box()
    pg.mouse.move(h["x"] + 7, h["y"] + 7); pg.mouse.down(); pg.mouse.move(h["x"] + 47, h["y"] + 20, steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
    w1 = pg.locator(".b-frame .qf-head .qf-art-in").bounding_box()["width"]
    check("dragging the handle resizes the artwork", w1 > w0 + 30, (w0, w1))
    check("drag resizing updates the width setting", int(el.get_by_label("Width", exact=True).input_value()) >= 150)
    nat = pg.eval_on_selector(".b-frame .qf-head img", "i => Math.abs(i.getBoundingClientRect().height / i.getBoundingClientRect().width - 0.5) < 0.02")
    check("proportions are kept by default", nat)
    el.locator("input[type=file]").first.set_input_files(LOGO2)
    pg.wait_for_function("() => { const i = document.querySelector('.b-frame .qf-head img'); return i && i.complete && Math.abs(i.naturalWidth - i.naturalHeight) < 2; }", timeout=10000)
    check("heading artwork can be replaced", True)
    pg.get_by_role("button", name="↶ Undo").click()
    pg.wait_for_function("() => { const i = document.querySelector('.b-frame .qf-head img'); return i && i.complete && i.naturalWidth === 2 * i.naturalHeight; }", timeout=10000)
    check("replacing artwork can be undone", True)
    el.get_by_role("button", name="Remove", exact=True).click()
    check("heading artwork can be removed", pg.locator(".b-frame .qf-head img").count() == 0)
    pg.get_by_role("button", name="↶ Undo").click()
    check("removal can be undone (the image file is kept)", pg.locator(".b-frame .qf-head img").count() == 1)

    # ------------------------------------------------------------ question artwork and swatches
    pg.get_by_role("tab", name="Questions").click()
    pg.locator('.b-frame [data-sid$="__label"]', has_text="Your name").click()
    q = pg.locator(".b-row.open")
    q.locator(".b-sub > summary", has_text="Artwork for this question").click()
    q.locator(".b-sub", has_text="Artwork for this question").locator("input[type=file]").set_input_files(SHIRT)
    pg.wait_for_selector('.b-frame .qf-field[data-kind="input"] .qf-art-blk img')
    check("a question can have its own artwork", pg.locator('.b-frame .qf-field[data-kind="input"]').first.locator("img").count() == 1)
    q.locator(".b-sub", has_text="Artwork for this question").get_by_role("radio", name="Below").click()
    order = pg.eval_on_selector('.b-frame .qf-field[data-kind="input"]', "f => [...f.children].map(c => c.className.split(' ')[0])")
    check("question artwork can sit below the question", order.index("qf-art-blk") > order.index("qf-in"), order)
    q.locator(".b-sub > summary", has_text="Colour swatches under this question").click()
    q.get_by_role("button", name="+ Add colour swatches").click()
    check("a question can have colour swatches beneath it", pg.locator('.b-frame .qf-field[data-kind="input"]').first.locator(".qf-sw-dot").count() == 3)
    q.get_by_label("Customers pick a colour").uncheck()
    check("swatches can be display-only", pg.locator('.b-frame .qf-field[data-kind="input"]').first.locator(".qf-sw input").count() == 0)

    # Swatch styling in Design
    pg.get_by_role("tab", name="Design").click()
    pg.locator('.b-frame .qf-field[data-kind="input"]').first.locator(".qf-sw").click()
    pg.wait_for_selector("text=Keep swatches round")
    el = pg.locator(".dsec", has_text="Element ID")
    el.get_by_label("Swatch size", exact=True).last.fill("40"); pg.wait_for_timeout(200)
    check("swatch size is adjustable", css(pg, '.b-frame .qf-field[data-kind="input"] .qf-sw-dot', "width") == "40px")
    el.get_by_label("Keep swatches round").uncheck(); pg.wait_for_timeout(200)
    check("swatches stay round unless changed on purpose", css(pg, '.b-frame .qf-field[data-kind="input"] .qf-sw-dot', "borderTopLeftRadius") != "50%")
    el.get_by_role("button", name="Centre").first.click(); pg.wait_for_timeout(200)
    check("swatch alignment is adjustable", css(pg, '.b-frame .qf-field[data-kind="input"] .qf-sw', "justifyContent") == "center")

    # ------------------------------------------------------------ settings: customer messages
    pg.get_by_role("tab", name="Settings").click()
    thanks = pg.get_by_label("Thank-you message")
    thanks.fill("Thanks from {business}! Your order {order_number} is in. {oops}")
    prev = pg.locator(".b-msg-prev").first
    check("the thank-you message shows a filled-in preview", "Thanks from Demo Business! Your order QTG-1001 is in." in prev.inner_text())
    check("unknown placeholders are flagged", "{oops} isn't a placeholder" in pg.inner_text(".b-body"))
    pg.get_by_role("button", name="Show the thank-you screen in the preview").click()
    check("the customer's thank-you screen uses the edited message", "Your order QTG-1001 is in." in pg.inner_text(".b-frame .qf-done"))
    pg.get_by_role("button", name="Form", exact=True).click()
    consent = pg.get_by_label("Permission checkbox text")
    check("the permission text shows the current message", consent.input_value() == "Send me {channel} updates about my order. Reply STOP to opt out.")
    consent.fill("Yes, text {business} order updates to me.")
    check("the edited permission text appears on the form", "Yes, text Demo Business order updates to me." in pg.inner_text(".b-frame .qf-check"))
    check("missing opt-out wording for texts is flagged", "Reply STOP" in pg.inner_text(".b-body") and "US rules" in pg.inner_text(".b-body"))
    pg.locator(".b-card", has_text="Messages customers see").get_by_role("button", name="Reset to the default message").last.click()
    check("the permission text can be reset to the default", "Send me SMS updates about my order. Reply STOP to opt out." in pg.inner_text(".b-frame .qf-check"))
    pg.wait_for_timeout(1300)
    check("changes autosave", "All changes saved" in pg.inner_text(".b-save"))
    pg.screenshot(path=f"{SHOTS}/customize-builder.png", full_page=True)

    # ------------------------------------------------------------ phone layout
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.wait_for_timeout(300)
    check("the builder fits a phone without sideways scrolling", pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    pg.screenshot(path=f"{SHOTS}/customize-phone.png", full_page=True)

    check("no browser errors", not errors, errors[:5])
    b.close()

passed = sum(results)
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
