"""Browser tests for the form builder and the public form renderer (Stage 5).

Runs against the development harness, which saves to memory instead of Supabase:
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/builder.py
"""
import os, re, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://localhost:3000")
SHOTS = os.environ.get("SHOTS", "/tmp/claude-0/app-shots")
os.makedirs(SHOTS, exist_ok=True)
results = []

def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"), flush=True)

def css_color(page, sel, prop="color"):
    return page.eval_on_selector(sel, f"e => getComputedStyle(e).{prop}")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1360, "height": 900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    # Google Fonts can't be reached from some test sandboxes; that isn't an app error.
    pg.on("console", lambda m: m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text and errors.append(m.text))

    # ------------------------------------------------------------ public renderer
    pg.goto(BASE + "/dev/form")
    check("public form shows the event title", pg.get_by_role("heading", name="Harbourfront Food Fest").count() == 1)
    check("public form shows date and venue", "pier 3, harbourfront" in pg.inner_text(".qf-eyebrow").lower() and "nov 7" in pg.inner_text(".qf-eyebrow").lower())
    check("theme colours are applied", css_color(pg, ".qf-card", "backgroundColor") == "rgb(255, 244, 226)")
    check("multi-page form starts on step 1", "Step 1 of 2" in pg.inner_text(".qf-step"))
    pg.get_by_role("button", name="Next").click()
    check("required questions block the next page", "This is required." in pg.inner_text(".qf-page:not([hidden])"), pg.inner_text(".qf-page:not([hidden])")[:200])
    check("the first invalid answer gets focus", pg.evaluate("document.activeElement && document.activeElement.className") == "qf-in")
    pg.get_by_label("Your name").fill("Lena Ortiz")
    pg.get_by_label("Mobile number").fill("12")
    pg.get_by_role("button", name="Next").click()
    check("phone numbers are checked", "Enter a valid mobile number" in pg.inner_text(".qf-page:not([hidden])"))
    pg.get_by_label("Mobile number").fill("(555) 123-4567")
    pg.get_by_role("button", name="Next").click()
    check("valid answers move to page 2", "Step 2 of 2" in pg.inner_text(".qf-step"))
    pg.get_by_role("button", name="Back").click()
    check("Back returns to page 1 with answers kept", pg.get_by_label("Your name").input_value() == "Lena Ortiz")
    pg.get_by_role("button", name="Next").click()
    pg.get_by_label("Email").fill("not-an-email")
    pg.get_by_role("button", name="Place my order").click()
    check("emails are checked", "Enter a valid email address" in pg.inner_text(".qf-page:not([hidden])"))
    pg.get_by_label("Email").fill("lena@example.com")
    pg.locator(".qf-opt", has_text="Cap").click()
    pg.get_by_role("button", name="Place my order").click()
    pg.wait_for_selector(".qf-done")
    check("submitting shows the thank-you screen with the order number", "You're in the queue" in pg.inner_text(".qf-card") and "QTG-1001" in pg.inner_text(".qf-card"))
    pg.goto(BASE + "/dev/form")
    check("consent checkbox mentions SMS and STOP", "SMS updates" in pg.inner_text(".qf-check") and "STOP" in pg.inner_text(".qf-check"))
    pg.screenshot(path=f"{SHOTS}/public-form.png", full_page=True)

    pg.goto(BASE + "/dev/form?gate=1")
    nxt = pg.get_by_role("button", name="Next")
    check("'disable until valid' holds Next until required answers are in", nxt.is_disabled())
    pg.get_by_label("Your name").fill("Lena")
    pg.get_by_label("Mobile number").fill("5551234567")
    check("Next turns on once required answers are filled", nxt.is_enabled())

    ph = b.new_page(viewport={"width": 390, "height": 844})
    ph.goto(BASE + "/dev/form")
    check("public form fits a phone without sideways scrolling", ph.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
    ph.screenshot(path=f"{SHOTS}/public-form-phone.png", full_page=True)
    ph.close()

    # ------------------------------------------------------------ builder
    pg.goto(BASE + "/dev/builder")
    check("builder shows the preview", pg.locator(".b-frame .qf-wrap").count() == 1)
    check("builder starts with all changes saved", "All changes saved" in pg.inner_text(".b-save"))
    check("undo is disabled before any change", pg.get_by_role("button", name="↶ Undo").is_disabled())

    # Edit a question from the preview
    pg.locator('.b-frame [data-sid$="__label"]', has_text="Your name").click()
    check("clicking a question in the preview opens it", pg.locator(".b-row.open").count() == 1)
    q = pg.locator(".b-row.open").get_by_label("Question")
    q.fill("Full name")
    check("the preview updates as you type", pg.locator(".b-frame .qf-label", has_text="Full name").count() == 1)
    pg.wait_for_timeout(1400)
    check("changes autosave", "All changes saved" in pg.inner_text(".b-save"), pg.inner_text(".b-save"))
    pg.get_by_role("button", name="↶ Undo").click()
    check("undo restores the old label", pg.locator(".b-frame .qf-label", has_text="Your name").count() == 1)
    pg.get_by_role("button", name="↷ Redo").click()
    check("redo reapplies it", pg.locator(".b-frame .qf-label", has_text="Full name").count() == 1)

    # Add a block
    n0 = pg.locator(".b-rows > li").count()
    pg.select_option("#b-add-type", "heading")
    pg.get_by_role("button", name="Add", exact=True).click()
    check("adding a block adds a row", pg.locator(".b-rows > li").count() == n0 + 1)
    check("the new heading shows in the preview", pg.locator(".b-frame .qf-h", has_text="Section heading").count() == 1)
    pg.locator(".b-row.open").get_by_role("button", name="Delete block").click()
    check("deleting removes it", pg.locator(".b-rows > li").count() == n0 and pg.locator(".b-frame .qf-h").count() == 0)

    # Options editor
    pg.locator(".b-frame .qf-opt", has_text="Hoodie").first.click()
    pg.locator(".b-row.open").get_by_role("button", name="Paste a list").click()
    opts = pg.locator(".b-row.open").get_by_label("Options (one per line)")
    opts.fill("T-shirt\nHoodie\nTote bag")
    check("options update the preview", pg.locator(".b-frame .qf-opt", has_text="Tote bag").count() == 1)
    pg.locator(".b-row.open").get_by_role("radio", name="List").click()
    check("options can show as a list", pg.locator(".b-frame .qf-opts.list").count() == 1)

    # Prefill and lock (Questions tab)
    pg.locator('.b-frame [data-sid$="__label"]', has_text="Mobile number").click()
    pg.locator(".b-row.open").get_by_label("Prefill and lock this answer").check()
    pg.locator(".b-row.open").get_by_label("Locked answer").fill("(555) 000-1111")
    locked = pg.locator(".b-frame input[type=tel]")
    check("a locked answer shows prefilled and can't be edited", locked.is_disabled() and locked.input_value() == "(555) 000-1111")
    pg.locator(".b-row.open").get_by_label("Prefill and lock this answer").uncheck()

    # Design tab: ten sections like the prototype
    SUB = '.b-frame [data-sid="__submit"]'
    pg.get_by_role("tab", name="Design").click()
    names = pg.eval_on_selector_all(".dsec > summary", "els => els.map(e => e.childNodes[0].textContent.trim())")
    check("design tab has the ten prototype sections plus heading artwork", names == ["Global theme", "Heading artwork", "Individual element styles", "Typography", "Buttons", "Text boxes and input fields",
        "Colours and brand palette", "Borders and corners", "Backgrounds and textures", "Artwork and images", "Advanced settings"], names)

    acc = pg.get_by_label("Buttons colour code", exact=True)
    acc.fill("#1D4ED8"); pg.wait_for_timeout(400)
    check("theme button colour restyles the submit button", css_color(pg, SUB, "backgroundColor") == "rgb(29, 78, 216)", css_color(pg, SUB, "backgroundColor"))
    check("button text switches to a readable colour", css_color(pg, SUB) == "rgb(255, 255, 255)")
    acc.fill("not a colour"); pg.wait_for_timeout(300)
    check("invalid colour codes are flagged and not applied", "not a colour code" in pg.inner_text(".dsec[open]") and css_color(pg, SUB, "backgroundColor") == "rgb(29, 78, 216)")
    acc.blur()
    check("contrast is checked for the theme", "Text on form" in pg.inner_text(".contrast"))

    # Round colour picker
    pg.locator(".dsec", has_text="Global theme").get_by_role("button", name=re.compile("^Buttons: .*Open colour picker")).click()
    check("colour picker opens", pg.get_by_role("dialog", name="Buttons colour picker").count() == 1)
    pg.get_by_role("dialog").get_by_role("button", name="Use #E8633A").first.click(); pg.wait_for_timeout(400)
    check("picking a brand colour applies it", css_color(pg, SUB, "backgroundColor") == "rgb(232, 99, 58)")
    hue = pg.get_by_role("dialog").get_by_label("Hue")
    hue.fill("200"); pg.wait_for_timeout(300)
    check("the hue slider changes the colour", css_color(pg, SUB, "backgroundColor") != "rgb(232, 99, 58)")
    pg.get_by_role("dialog").get_by_role("button", name="Use #E8633A").first.click()
    pg.keyboard.press("Escape")
    check("Escape closes the picker", pg.get_by_role("dialog").count() == 0)

    # Typography: font presets
    pg.locator(".dsec > summary", has_text="Typography").click()
    pg.locator(".fontpick button", has_text="Sporty").click()
    check("font style preset applies (Sporty uses uppercase headings)", css_color(pg, '.b-frame [data-sid="__title"]', "textTransform") == "uppercase")

    # Buttons: shared styles, gradient fill and interactive states
    pg.locator(".dsec > summary", has_text="Buttons").click()
    btns = pg.locator(".dsec", has_text="The settings below apply to every button")
    btns.get_by_role("button", name="Gradient", exact=True).click(); pg.wait_for_timeout(300)
    check("buttons can use a gradient fill", "linear-gradient" in css_color(pg, SUB, "backgroundImage"))
    btns.get_by_role("button", name="Solid", exact=True).click()
    btns.get_by_role("button", name="Hover", exact=True).click()
    check("choosing a state previews it on every button", "fs-hover" in pg.get_attribute(SUB, "class") and "Showing hover state" in pg.inner_text(".b-prev-bar"))
    btns.get_by_label("Background colour code", exact=True).last.fill("#0B7A3B"); pg.wait_for_timeout(300)
    check("hover colour shows on the previewed button", css_color(pg, SUB, "backgroundColor") == "rgb(11, 122, 59)")
    pg.get_by_role("button", name="Show default").click()
    check("Show default ends the state preview", "fs-hover" not in pg.get_attribute(SUB, "class"))
    pg.locator(".dsec > summary", has_text="Buttons").click()

    # Borders and corners
    pg.locator(".dsec > summary", has_text="Borders and corners").click()
    pg.locator(".dsec", has_text="Corner style for the whole form").get_by_role("button", name="Pill").first.click(); pg.wait_for_timeout(200)
    check("corner style changes buttons", css_color(pg, SUB, "borderTopLeftRadius") == "999px")
    pg.locator(".dsec > summary", has_text="Borders and corners").click()

    # Backgrounds and textures
    pg.locator(".dsec > summary", has_text="Backgrounds and textures").click()
    pg.locator(".sub", has_text="Page background").locator(".texbtn", has_text="Dots").click()
    check("page texture applies", "data:image/svg+xml" in css_color(pg, ".b-frame .qf-wrap", "backgroundImage"))
    pg.locator(".dsec > summary", has_text="Backgrounds and textures").click()

    # Individual element styles
    pg.locator('.b-frame [data-sid="__title"]').click()
    el = pg.locator(".dsec", has_text="Element ID")
    check("clicking the title opens its own style controls", el.count() == 1 and "Form title" in pg.inner_text(".elhead"))
    el.get_by_label("Text colour colour code", exact=True).fill("#C2185B"); pg.wait_for_timeout(200)
    check("per-element colour applies to the title only", css_color(pg, '.b-frame [data-sid="__title"]') == "rgb(194, 24, 91)" and css_color(pg, ".b-frame .qf-label") != "rgb(194, 24, 91)")
    el.get_by_label("Letter spacing").fill("0.2")
    check("letter spacing applies", css_color(pg, '.b-frame [data-sid="__title"]', "letterSpacing") != "normal")
    pg.locator('.b-frame [data-sid$="__label"]').first.click()
    el = pg.locator(".dsec", has_text="Element ID")
    el.get_by_role("button", name="All labels").click()
    el.get_by_label("Text colour colour code", exact=True).fill("#0B7A3B"); pg.wait_for_timeout(200)
    colors = pg.eval_on_selector_all(".b-frame .qf-label", "els => els.map(e => getComputedStyle(e).color)")
    check("'all labels' styles every label", len(colors) > 2 and all(c == "rgb(11, 122, 59)" for c in colors), colors)
    el.get_by_role("button", name="Reset Text colour").click()
    colors = pg.eval_on_selector_all(".b-frame .qf-label", "els => els.map(e => getComputedStyle(e).color)")
    check("reset removes the shared style", all(c != "rgb(11, 122, 59)" for c in colors))
    # Input box: padding, error state preview
    pg.locator('.b-frame .qf-field[data-kind="input"]').first.click()
    el = pg.locator(".dsec", has_text="Element ID")
    el.get_by_label("Inner padding left").fill("30"); pg.wait_for_timeout(200)
    check("inner padding applies to one input", css_color(pg, ".b-frame .qf-field[data-kind=input] .qf-in", "paddingLeft") == "30px")
    el.get_by_role("button", name="Error", exact=True).click()
    check("error state preview shows the message", "Please answer this question." in pg.inner_text(".b-frame .qf-field.fs-error"))
    pg.get_by_role("button", name="Show default").click()

    # Colours and brand palette
    pg.locator(".dsec > summary", has_text="Colours and brand palette").click()
    pg.wait_for_selector("text=Recently used")
    cols = pg.locator(".dsec", has_text="Brand colours")
    check("recently used colours are remembered", cols.locator(".dotrow").nth(1).locator(".dot-c").count() >= 1)
    cols.get_by_role("button", name="Remove #12306B from brand colours").click(); pg.wait_for_timeout(200)
    check("brand colours can be removed", cols.get_by_role("button", name="Copy #12306B").count() == 0)
    pg.locator(".dsec > summary", has_text="Colours and brand palette").click()

    # Artwork and images (uploads need Supabase; the harness reports that clearly)
    pg.locator(".dsec > summary", has_text="Artwork and images").click()
    pg.wait_for_selector("text=Place new artwork")
    check("artwork section offers a position for new artwork", pg.locator(".dsec", has_text="Place new artwork").locator("select option").count() > 3)
    pg.locator(".b-frame .qf-blk").nth(1).hover()
    check("'+ Artwork' appears between questions in the preview", pg.locator(".b-frame .qf-ins").count() > 3)
    pg.locator(".dsec > summary", has_text="Artwork and images").click()

    # Advanced: copy design, reset all
    pg.locator(".dsec > summary", has_text="Advanced settings").click()
    adv = pg.locator(".dsec", has_text="Start over")
    adv.get_by_role("button", name="Copy", exact=True).click(); pg.wait_for_timeout(400)
    check("copying another form's design applies its theme", css_color(pg, SUB, "backgroundColor") == "rgb(255, 201, 60)", css_color(pg, SUB, "backgroundColor"))
    adv.get_by_role("button", name="Reset all element styles").click()
    check("reset all asks for a second click", adv.get_by_role("button", name="Click again to remove all custom styles").count() == 1)
    adv.get_by_role("button", name="Click again to remove all custom styles").click()
    check("reset all removes per-element styles", css_color(pg, '.b-frame [data-sid="__title"]') != "rgb(194, 24, 91)")
    pg.get_by_role("button", name="↶ Undo").click()
    check("reset all can be undone", css_color(pg, '.b-frame [data-sid="__title"]') == "rgb(194, 24, 91)")
    adv.get_by_label("Disable Next and Submit until required questions are answered").check()

    # Phone preview
    pg.get_by_role("button", name="Phone").click()
    check("phone preview narrows the frame", pg.eval_on_selector(".b-frame", "e => e.getBoundingClientRect().width") <= 392)
    pg.get_by_role("button", name="Desktop").click()

    # Settings tab
    pg.get_by_role("tab", name="Settings").click()
    slug = pg.get_by_label("Form address")
    slug.fill("Food Fest!!")
    check("form address is cleaned as you type", slug.input_value() == "food-fest-")
    pg.wait_for_timeout(1300)
    check("an invalid address is explained", "lowercase letters" in pg.inner_text(".b-body"))
    slug.fill("food-fest-2026")
    pg.get_by_role("checkbox", name=re.compile("Ask customers for permission")).uncheck()
    check("turning off consent removes the checkbox from the form", pg.locator(".b-frame .qf-check").count() == 0)

    # Publish (demo mode: no server)
    pg.get_by_role("button", name="Publish form").click()
    pg.wait_for_selector(".notice.success")
    check("publishing confirms and marks the form live", "Published" in pg.inner_text(".notice.success") and pg.locator(".b-top .pill.good", has_text="Live").count() == 1)
    pg.get_by_role("tab", name="Settings").click()
    check("the public link uses the new address", "/f/demo/food-fest-2026" in pg.inner_text(".b-body"))
    pg.screenshot(path=f"{SHOTS}/builder.png", full_page=True)

    check("no browser errors", not errors, errors[:5])
    b.close()

passed = sum(results)
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
