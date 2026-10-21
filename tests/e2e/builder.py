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
    pg.locator(".qf-opt", has_text="Hoodie").click()
    pg.get_by_role("button", name="Place my order").click()
    check("submitting says ordering opens soon (no fake success)", "opens soon" in pg.inner_text(".qf-card") and "You're in the queue" not in pg.inner_text(".qf-card"))
    check("consent checkbox mentions SMS and STOP", "SMS updates" in pg.inner_text(".qf-check") and "STOP" in pg.inner_text(".qf-check"))
    pg.screenshot(path=f"{SHOTS}/public-form.png", full_page=True)

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
    opts = pg.locator(".b-row.open").get_by_label("Options (one per line)")
    opts.fill("T-shirt\nHoodie\nTote bag")
    check("options update the preview", pg.locator(".b-frame .qf-opt", has_text="Tote bag").count() == 1)
    pg.locator(".b-row.open").get_by_role("radio", name="List").click()
    check("options can show as a list", pg.locator(".b-frame .qf-opts.list").count() == 1)

    # Design tab
    pg.get_by_role("tab", name="Design").click()
    acc = pg.get_by_label("Accent (buttons)", exact=True)
    acc.fill("#1D4ED8"); pg.wait_for_timeout(400)
    check("accent colour restyles the submit button", css_color(pg, '.b-frame [data-sid="__submit"]', "backgroundColor") == "rgb(29, 78, 216)", css_color(pg, '.b-frame [data-sid="__submit"]', "backgroundColor"))
    check("button text switches to a readable colour", css_color(pg, '.b-frame [data-sid="__submit"]') == "rgb(255, 255, 255)")
    acc.fill("not a colour"); pg.wait_for_timeout(400)
    check("invalid colours are flagged and not applied", acc.get_attribute("aria-invalid") == "true" and css_color(pg, '.b-frame [data-sid="__submit"]', "backgroundColor") == "rgb(29, 78, 216)")
    pg.get_by_role("radio", name="Pill").click()
    check("corner shape changes buttons", css_color(pg, '.b-frame [data-sid="__submit"]', "borderTopLeftRadius") == "999px")
    pg.select_option("#" + pg.get_by_label("Page texture").get_attribute("id"), "dots")
    check("page texture applies", "data:image/svg+xml" in css_color(pg, ".b-frame .qf-wrap", "backgroundImage"))

    # Per-element styling
    pg.locator('.b-frame [data-sid="__title"]').click()
    check("clicking the title selects it for styling", "Form title" in pg.inner_text(".b-el-head"))
    pg.locator(".b-card", has_text="Selected element").get_by_label("Text colour", exact=True).fill("#C2185B")
    check("per-element colour applies to the title only", css_color(pg, '.b-frame [data-sid="__title"]') == "rgb(194, 24, 91)" and css_color(pg, ".b-frame .qf-label") != "rgb(194, 24, 91)")
    pg.locator('.b-frame [data-sid$="__label"]').first.click()
    sel = pg.locator(".b-card", has_text="Selected element")
    sel.get_by_role("radio", name="All question labels").click()
    sel.get_by_label("Text colour", exact=True).fill("#0B7A3B")
    colors = pg.eval_on_selector_all(".b-frame .qf-label", "els => els.map(e => getComputedStyle(e).color)")
    check("'apply to all' styles every label", len(colors) > 2 and all(c == "rgb(11, 122, 59)" for c in colors), colors)
    sel.get_by_role("button", name=re.compile("Reset all")).click()
    colors = pg.eval_on_selector_all(".b-frame .qf-label", "els => els.map(e => getComputedStyle(e).color)")
    check("reset removes the shared style", all(c != "rgb(11, 122, 59)" for c in colors))

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
