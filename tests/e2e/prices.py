"""Browser tests for prices and ticket types (Stage 10, step 2), against the development harness.
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/prices.py
The form harness runs the server's own answer checks and pricing in the browser, so the total on screen is
compared with what the server would charge.
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://localhost:3000")
results = []
def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"), flush=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))

    # ------------------------------------------------------------ the public form
    pg.goto(f"{BASE}/dev/form?sample=paid"); pg.wait_for_selector(".qf-tickets")
    rows = pg.locator(".qf-tt")
    check("each ticket type is listed with its price", rows.count() == 3 and "$25" in rows.nth(0).inner_text() and "$60" in rows.nth(1).inner_text(), rows.all_inner_texts())
    check("a type whose sales ended says so and can't be bought", "Sales have ended" in rows.nth(2).inner_text() and rows.nth(2).locator("input").get_attribute("readonly") is not None)
    check("the priced add-on shows its price", "$18" in pg.locator(".qf-opt", has_text="Event tee").inner_text())
    total = pg.locator(".qf-total")
    check("the total starts at zero", "$0.00" in total.inner_text() and "Your total appears here" in total.inner_text(), total.inner_text())
    check("the seller and refund policy are shown before paying", "Paid securely to Demo Business" in total.inner_text() and "contact the organizer" in total.inner_text())

    pg.fill('input[name="a1f0c3d2-1111-4a1a-8a1a-000000000001"]', "Ada Lovelace")
    pg.fill('input[name="a1f0c3d2-1111-4a1a-8a1a-000000000002"]', "ada@example.com")
    pg.locator(".qf-tt").nth(0).locator("input").fill("2")
    pg.locator(".qf-tt").nth(1).locator("input").fill("1")
    pg.locator(".qf-opt", has_text="Event tee").click()
    t = total.inner_text()
    check("the total adds up as the guest chooses", "General admission × 2" in t and "$50.00" in t and "VIP" in t and "$60.00" in t and "Event tee" in t and "$18.00" in t, t)
    check("the booking fee is its own line (2% of $128 = $2.56)", "Booking fee" in t and "$2.56" in t, t)
    check("the total includes the fee", "$130.56" in pg.locator(".qf-total-sum").inner_text(), pg.locator(".qf-total-sum").inner_text())

    pg.locator(".qf-tt").nth(1).locator("input").fill("5")
    pg.get_by_role("button", name="Continue to payment").click(); pg.wait_for_selector(".qf-ferr:not(:empty)")
    check("the limit per order is enforced", "up to 4 VIP tickets per order" in pg.locator(".qf-field.invalid .qf-ferr").inner_text())
    pg.locator(".qf-tt").nth(1).locator("input").fill("1")
    # A tampered total or price sent with the form has no effect on what's charged.
    pg.evaluate("""() => { const f = document.querySelector('form.qf-form');
      for (const [n, v] of [['__total', '1'], ['price', '0']]) { const i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; f.appendChild(i); } }""")
    pg.get_by_role("button", name="Continue to payment").click()
    pg.wait_for_url("**/dev/stop?checkout=13056", timeout=10000)
    check("a paid order goes on to the payment page for the server's total", "checkout=13056" in pg.url, pg.url)
    last = pg.evaluate("() => JSON.parse(sessionStorage.getItem('qtg:lastOrder'))")
    q = last["quote"]
    check("the server prices the order the same as the screen, to the cent", q["subtotal"] == 12800 and q["fee"] == 256 and q["total"] == 13056, q)
    check("tickets are counted by type id", [l.get("ticket") for l in q["lines"] if l.get("ticket")] == ["tt_general01", "tt_vip000001"], q["lines"])
    ans = last["answers"]
    check("the answers record what was bought", ans["a1f0c3d2-1111-4a1a-8a1a-000000000003"]["value"] == {"General admission": 2, "VIP": 1}, ans)

    pg.goto(f"{BASE}/dev/form?sample=paid&fee=business"); pg.wait_for_selector(".qf-tickets")
    pg.locator(".qf-tt").nth(0).locator("input").fill("1")
    t = pg.locator(".qf-total").inner_text()
    check("when the business pays the fee, buyers see only the prices", "Booking fee" not in t and "$25.00" in pg.locator(".qf-total-sum").inner_text(), t)

    pg.goto(f"{BASE}/dev/form?sample=paid"); pg.wait_for_selector(".qf-tickets")
    pg.fill('input[name="a1f0c3d2-1111-4a1a-8a1a-000000000001"]', "Ada"); pg.fill('input[name="a1f0c3d2-1111-4a1a-8a1a-000000000002"]', "ada@example.com")
    pg.get_by_role("button", name="Continue to payment").click(); pg.wait_for_selector(".qf-ferr:not(:empty)")
    check("at least one ticket is needed", "Choose at least one ticket." in pg.locator(".qf-field.invalid .qf-ferr").inner_text())

    pg.goto(f"{BASE}/dev/form"); pg.wait_for_selector(".qf-form")
    check("forms without prices show no total", pg.locator(".qf-total").count() == 0)

    pg.goto(f"{BASE}/dev/form?sample=paid&left=low"); pg.wait_for_selector(".qf-tickets")
    rows = pg.locator(".qf-tt")
    check("a nearly sold-out type shows how many are left", "3 left" in rows.nth(0).inner_text(), rows.nth(0).inner_text())
    check("the box allows no more than are left", rows.nth(0).locator("input").get_attribute("max") == "3")
    check("a sold-out type says so and can't be bought", "Sold out" in rows.nth(1).inner_text() and rows.nth(1).locator("input").get_attribute("readonly") is not None)

    # ------------------------------------------------------------ the builder
    pg.goto(f"{BASE}/dev/builder"); pg.wait_for_selector(".b-rows")
    opts = pg.locator("#b-add-type option").all_inner_texts()
    check("without payments switched on, there's no Tickets block", not any("Tickets" in o for o in opts), opts)
    pg.locator(".b-row-main", has_text="What would you like?").click()
    check("and no price boxes on options", pg.locator(".b-price").count() == 0)

    pg.goto(f"{BASE}/dev/builder?pay=allowed"); pg.wait_for_selector(".b-rows")
    check("once allowed, the Tickets block can be added", any("Tickets" in o for o in pg.locator("#b-add-type option").all_inner_texts()))
    pg.locator(".b-row-main", has_text="What would you like?").click()
    check("options get price boxes", pg.locator(".b-price").count() == 3)
    pg.get_by_label("Price of Hoodie").fill("45")
    pg.wait_for_timeout(150)
    hoodie = pg.locator(".qf-opt", has_text="Hoodie").first.inner_text()
    check("a price shows on the preview straight away", "$45" in hoodie, hoodie)
    pg.get_by_label("Price of Cap").fill("12.5x")
    check("a mistyped price is flagged", pg.locator(".b-price.bad").count() == 1)
    pg.get_by_label("Price of Cap").fill("12.50")
    check("and clears when fixed", pg.locator(".b-price.bad").count() == 0 and "$12.50" in pg.locator(".qf-opt", has_text="Cap").first.inner_text())
    pg.get_by_role("button", name="Move option 2 up").click()
    pg.wait_for_timeout(100)
    check("a price stays with its option when moved", pg.get_by_label("Price of Hoodie").input_value() == "45" and pg.get_by_label("Price of T-shirt").input_value() == "")
    check("the builder explains publishing waits for approval", pg.get_by_text("once your payment account is approved").count() >= 1)

    pg.select_option("#b-add-type", "tickets"); pg.get_by_role("button", name="Add", exact=True).click()
    pg.wait_for_selector(".qf-tickets")
    check("a new Tickets block starts with one $25 type", "General admission" in pg.locator(".qf-tt").first.inner_text() and "$25" in pg.locator(".qf-tt").first.inner_text())
    pg.get_by_role("button", name="+ Add ticket type").click()
    pg.get_by_label("ticket type 2", exact=True).fill("VIP")
    pg.get_by_label("Price of VIP").fill("60")
    pg.get_by_role("button", name="Quantity, limit and sales end for VIP").click()
    pg.get_by_label("How many are available").fill("20")
    pg.get_by_label("Most per order").fill("4")
    pg.wait_for_timeout(150)
    check("ticket types show on the preview", pg.locator(".qf-tt").count() == 2 and "$60" in pg.locator(".qf-tt").nth(1).inner_text())
    check("limits apply to the preview's box", pg.locator(".qf-tt").nth(1).locator("input").get_attribute("max") == "4")
    pg.get_by_role("tab", name="Settings").click() if pg.get_by_role("tab", name="Settings").count() else pg.get_by_role("button", name="Settings").click()
    pg.wait_for_selector("#payments")
    pay = pg.locator("#payments").inner_text()
    check("Settings has a Payments section with the fee on this plan", "2% of each sale" in pay and "Booking fee" in pay, pay)
    check("it warns the form can't be published yet", "Get paid" in pay)
    pg.get_by_label("Refund policy shown before payment").select_option("until")
    check("no RSVP warning on an order form", "RSVP forms can't take payments" not in pg.locator("#payments").inner_text())
    pg.get_by_label("Days before the event").fill("3")
    pg.wait_for_timeout(150)
    check("the refund policy wording follows the choice", "until 3 days before the event" in pg.locator("#payments").inner_text())

    pg.goto(f"{BASE}/dev/builder?pay=ready&comped=1&sample=paid"); pg.wait_for_selector(".b-rows")
    pg.get_by_role("tab", name="Settings").click() if pg.get_by_role("tab", name="Settings").count() else pg.get_by_role("button", name="Settings").click()
    pg.wait_for_selector("#payments")
    pay = pg.locator("#payments").inner_text()
    check("a comped business is told it pays no booking fee", "pays no QueuedToGo booking fee" in pay and "Get paid" not in pay, pay)

    pg.set_viewport_size({"width": 390, "height": 844})
    pg.goto(f"{BASE}/dev/form?sample=paid"); pg.wait_for_selector(".qf-tickets")
    sw = pg.evaluate("() => document.documentElement.scrollWidth")
    check("the ticket list fits a phone screen", sw <= 390, sw)

    check("no page errors", not errors, errors)
    b.close()

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
