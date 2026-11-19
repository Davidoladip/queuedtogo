"""Browser tests for the Get paid page (connecting Stripe or Square), against the development harness.
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/payments.py
Stripe and Square aren't reached here; the harness swaps the server actions for stand-ins.
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
    def go(q):
        pg.goto(f"{BASE}/dev/payments{q}"); pg.wait_for_selector(".pay")

    go("?state=none")
    how = pg.locator(".pay-how").inner_text()
    check("explains the business is the seller", "You're the seller" in how and "your own Stripe or Square account" in how, how)
    check("shows QueuedToGo's fee", "1% of each paid ticket or order" in how, how)
    check("says selling isn't switched on yet", pg.get_by_text("opening business by business").count() == 1)
    check("offers both Stripe and Square", pg.get_by_role("button", name="Connect Stripe").count() == 1 and pg.get_by_role("button", name="Connect Square").count() == 1)
    pg.get_by_role("button", name="Connect Stripe").click(); pg.wait_for_selector(".notice.success")
    check("Connect Stripe starts Stripe's sign-up", "demo:stripe" in pg.locator(".notice.success").inner_text())
    pg.get_by_role("button", name="Connect Square").click(); pg.wait_for_selector(".notice.error")
    check("a Square problem is explained", "isn't available yet" in pg.locator(".notice.error").inner_text())

    go("?state=none&nosquare=1")
    check("Square is greyed out until it's set up", pg.get_by_role("button", name="Connect Square").is_disabled())

    go("?state=none&role=member")
    check("members can't connect an account", pg.get_by_role("button", name="Connect Stripe").is_disabled() and pg.get_by_text("Only owners and admins can connect").count() == 1)

    go("?state=pending")
    check("an unfinished sign-up says so", pg.get_by_text("Setting up").count() == 1 and pg.get_by_role("button", name="Continue setup with Stripe").count() == 1)
    check("lists what Stripe still needs in plain words", "accepting Stripe's terms" in pg.locator(".pay-req").inner_text())
    go("?state=restricted")
    req = pg.locator(".pay-req").inner_text()
    check("a restricted account lists the missing details", "Needs information" in pg.locator(".pay-acct").inner_text() and "a bank account for payouts" in req and "a photo of an ID document" in req, req)

    go("?state=active&allowed=1")
    acct = pg.locator(".pay-acct").inner_text()
    check("an active account is ready", "Ready to take payments" in acct and "payouts go to your bank" in acct, acct)
    check("no setup button once active", pg.get_by_role("button", name="Continue setup with Stripe").count() == 0)
    check("links to the business's own Stripe dashboard", (pg.get_by_role("link", name="Open Stripe dashboard").get_attribute("href") or "").startswith("https://dashboard.stripe.com/"))
    check("test mode is labelled", pg.get_by_text("Test mode: no real money moves.").count() == 1)
    check("no 'not switched on' notice when allowed", pg.get_by_text("opening business by business").count() == 0)
    pg.get_by_role("button", name="Disconnect").click()
    check("disconnecting asks first and explains", "Sales already made, refunds and payouts stay" in pg.locator(".pay-confirm").inner_text())
    pg.get_by_role("button", name="Keep it connected").click()
    check("you can back out", pg.locator(".pay-confirm").count() == 0)
    pg.get_by_role("button", name="Disconnect").click(); pg.get_by_role("button", name="Yes, disconnect").click(); pg.wait_for_selector(".notice.success")
    check("disconnect calls the action", "demo:disconnect" in pg.locator(".notice.success").inner_text())

    go("?state=active&role=admin")
    check("only the owner can disconnect", pg.get_by_role("button", name="Disconnect").count() == 0)
    go("?state=square&allowed=1")
    check("a Square account shows with its dashboard", "Square" in pg.locator("#pay-acct").inner_text() and pg.get_by_role("link", name="Open Square dashboard").count() == 1)
    go("?state=none&comped=1")
    check("comped businesses pay no QueuedToGo fee", "none (included with your plan)" in pg.locator(".pay-how").inner_text())

    pg.set_viewport_size({"width": 390, "height": 844}); go("?state=restricted")
    check("no sideways scrolling on a phone", pg.evaluate("document.documentElement.scrollWidth") <= 390)
    check("no page errors", not errors, errors)
    b.close()

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
