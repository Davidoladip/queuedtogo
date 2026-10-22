"""Browser tests for sending an order from the public form (Stage 6), against the development harness.
The harness runs the server's answer checks in the browser and returns pretend order numbers.
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/orders.py
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

def fill_order(pg, item="Cap"):
    pg.get_by_label("Your name").fill("Lena Ortiz")
    pg.get_by_label("Mobile number").fill("(555) 123-4567")
    pg.get_by_role("button", name="Next").click()
    pg.locator(".qf-opt", has_text=item).click()
    pg.get_by_label("Email").fill("Lena@Example.com")
    pg.locator('.qf-sizes input').nth(1).fill("2")
    pg.locator('input[name="__consent"]').check()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text and errors.append(m.text))

    pg.goto(BASE + "/dev/form")
    check("the form carries its version and a retry key", pg.locator('input[name="__v"]').input_value() == "1" and len(pg.locator('input[name="__k"]').input_value()) >= 16)
    check("the bot trap is hidden from people", pg.locator(".qf-hp").bounding_box()["x"] < -5000 and pg.locator(".qf-hp").get_attribute("aria-hidden") == "true")
    pg.get_by_label("Your name").fill("Lena Ortiz"); pg.get_by_label("Mobile number").fill("(555) 123-4567"); pg.get_by_role("button", name="Next").click()
    check("the text-updates box starts unticked (carrier rules)", not pg.locator('input[name="__consent"]').is_checked())
    check("the consent wording names the business and the costs", "Msg & data rates may apply" in pg.inner_text(".qf-check"))
    pg.goto(BASE + "/dev/form")
    fill_order(pg)
    pg.get_by_role("button", name="Place my order").click()
    check("the button shows it is sending", pg.get_by_role("button", name="Sending…").count() == 1 or pg.locator(".qf-done").count() == 1)
    pg.wait_for_selector(".qf-done")
    card = pg.inner_text(".qf-card")
    check("the thank-you screen shows the order number", "QTG-1001" in card and "You're in the queue" in card)
    check("the thank-you message is filled in", "We've got your order" in card or "Thanks" in card)
    check("the customer gets a tracking link", pg.locator(".qf-done a.lk").get_attribute("href").endswith("/t/" + "a" * 64))
    order = pg.evaluate("window.__lastOrder")
    check("answers are checked and cleaned before sending", order["customer"] == {"name": "Lena Ortiz", "email": "lena@example.com", "phone": "+15551234567", "channel": "sms"}, order["customer"])
    check("sizes are sent as quantities", any(a["type"] == "sizes" and a["value"] == {"M": 2} for a in order["answers"].values()), order["answers"])
    check("consent is recorded", order["consent"] is True)
    check("the job gets a summary", "Cap" in order["summary"], order["summary"])
    pg.screenshot(path=f"{SHOTS}/order-thanks.png", full_page=True)

    pg.get_by_role("button", name="Submit another order").click()
    check("'Submit another order' starts a fresh, empty form", pg.get_by_label("Your name").input_value() == "" and "Step 1 of 2" in pg.inner_text(".qf-step"))
    fill_order(pg)
    pg.get_by_role("button", name="Place my order").click()
    pg.wait_for_selector(".qf-done")
    check("the next order gets the next number", "QTG-1002" in pg.inner_text(".qf-card"))

    # A server-side rejection (answers changed in the page) is shown on the question
    pg.goto(BASE + "/dev/form")
    fill_order(pg)
    pg.evaluate("document.querySelector('.qf-opt input[value=\"Cap\"]').value = 'Free car'")
    pg.get_by_role("button", name="Place my order").click()
    pg.wait_for_selector(".qf-ferr:not(:empty)")
    check("answers the form doesn't offer are refused", "Choose one of the options." in pg.inner_text(".qf-page:not([hidden])") and pg.locator(".qf-done").count() == 0)
    check("the customer is told what to fix", "Check the highlighted answers." in pg.inner_text(".qf-card"))

    # Double click sends one order
    pg.goto(BASE + "/dev/form")
    fill_order(pg)
    btn = pg.get_by_role("button", name="Place my order")
    btn.dblclick()
    pg.wait_for_selector(".qf-done")
    check("a double click creates one order", "QTG-1001" in pg.inner_text(".qf-card"))

    # Ordering not switched on (no secret key on the server)
    pg.goto(BASE + "/dev/form?ordering=off")
    fill_order(pg)
    pg.get_by_role("button", name="Place my order").click()
    check("without the server key, the form says ordering isn't on (no fake order)", "isn't switched on" in pg.inner_text(".qf-card") and pg.locator(".qf-done").count() == 0)

    ph = b.new_page(viewport={"width": 390, "height": 844})
    ph.goto(BASE + "/dev/form")
    fill_order(ph)
    ph.get_by_role("button", name="Place my order").click()
    ph.wait_for_selector(".qf-done")
    check("the thank-you screen fits a phone", ph.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
    ph.screenshot(path=f"{SHOTS}/order-thanks-phone.png", full_page=True)

    check("no browser errors", not errors, errors[:5])
    b.close()

passed = sum(results)
print(f"\n{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
