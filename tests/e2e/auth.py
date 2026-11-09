"""Browser tests for the new look of the sign-in, sign-up and other signed-out pages.
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/auth.py
(Sign-in/sign-up against Supabase itself is covered by smoke.py and by hand.)
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
    pg = b.new_page(viewport={"width": 1366, "height": 860})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))

    pg.goto(BASE + "/login?signed_out=1")
    check("sign-in has one main heading", pg.locator("h1").count() == 1 and pg.inner_text("h1") == "Sign in")
    check("the logo links home", pg.locator(".au-top a.brand").get_attribute("href") == "/")
    check("side panel shows on desktop", pg.locator(".au-panel").is_visible() and "Welcome back." in pg.inner_text(".au-panel"))
    check("friendlier signed-out message", "You've signed out. See you at the next event." in pg.inner_text("main"))
    pw = pg.locator("#f-password")
    check("password starts hidden", pw.get_attribute("type") == "password")
    btn = pg.get_by_role("button", name="Show password")
    btn.click()
    check("Show reveals the password", pw.get_attribute("type") == "text" and pg.get_by_role("button", name="Hide password").get_attribute("aria-pressed") == "true")
    pg.get_by_role("button", name="Hide password").click()
    check("Hide hides it again", pw.get_attribute("type") == "password")
    check("show/hide doesn't submit the form", pg.url.endswith("/login?signed_out=1"))
    check("forgot-password link", pg.get_by_role("link", name="Forgot your password?").get_attribute("href") == "/forgot-password")
    check("link to sign-up", pg.get_by_role("link", name="Create a free account").get_attribute("href") == "/signup")
    check("footer links", pg.locator('.au-legal a[href="/privacy"]').count() == 1 and pg.locator('.au-legal a[href="/terms"]').count() == 1)
    pg.goto(BASE + "/login?next=/w/acme/board")
    check("safe return path still carried to sign-up", pg.get_by_role("link", name="Create a free account").get_attribute("href") == "/signup?next=%2Fw%2Facme%2Fboard")

    pg.goto(BASE + "/signup")
    rule = pg.locator(".au-rule")
    check("password rule shown", rule.inner_text() == "At least 8 characters" and "ok" not in (rule.get_attribute("class") or ""))
    check("the rule is read out with the password field", rule.get_attribute("id") in (pg.locator("#f-password").get_attribute("aria-describedby") or ""))
    pg.fill("#f-password", "short")
    check("rule not met yet", "ok" not in (rule.get_attribute("class") or ""))
    pg.fill("#f-password", "long enough")
    check("rule ticks once met", "ok" in (rule.get_attribute("class") or "") and rule.inner_text().startswith("✓"))
    check("privacy note under the button", "only email you about your account" in pg.inner_text("main"))
    check("sign-up panel shows the steps and the trial", pg.locator(".au-steps li").count() == 3 and "14-day free trial" in pg.inner_text(".au-panel"))

    pg.goto(BASE + "/dev/check-inbox")
    main = pg.inner_text("main")
    check("check-your-inbox names the address", "Check your inbox" in main and "alice@example.com" in main and "spam" in main)
    check("resend button", pg.get_by_role("button", name="Send the link again").count() == 1)

    pg.goto(BASE + "/forgot-password")
    check("forgot-password uses the new layout", pg.locator(".au-panel").is_visible() and pg.get_by_role("link", name="Back to sign in").get_attribute("href") == "/login")
    pg.goto(BASE + "/invite/" + "a" * 64)
    check("invitation uses the new layout", pg.inner_text("h1") == "You've been invited" and "Your team, one board." in pg.inner_text(".au-panel"))
    r = pg.goto(BASE + "/no-such-page")
    check("not-found page", r.status == 404 and "couldn't find that page" in pg.inner_text("h1") and pg.locator(".au-panel").count() == 0)

    m = b.new_page(viewport={"width": 375, "height": 760}, is_mobile=True, has_touch=True)
    for path in ["/login", "/signup", "/forgot-password", "/invite/" + "a" * 64, "/dev/check-inbox"]:
        m.goto(BASE + path)
        check(f"{path} fits a phone, panel hidden", m.evaluate("document.documentElement.scrollWidth") <= 375 and not m.locator(".au-panel").is_visible() if m.locator(".au-panel").count() else m.evaluate("document.documentElement.scrollWidth") <= 375)
    m.goto(BASE + "/signup")
    check("inputs are 16px so phones don't zoom in", m.evaluate("getComputedStyle(document.querySelector('#f-email')).fontSize") == "16px")

    check("no page errors", not errors, errors)
    b.close()

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
