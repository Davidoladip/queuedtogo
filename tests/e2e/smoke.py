"""Smoke tests for the app without a reachable Supabase project.

Checks page rendering, redirects for signed-out visitors, form validation, open-redirect protection,
friendly errors when Supabase can't be reached, security headers and phone layout.

  npm run build && npm start   (in another terminal; or set APP_URL)
  python3 tests/e2e/smoke.py
"""
import os, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://localhost:3000")
SHOTS = os.environ.get("SHOTS", "/tmp/claude-0/app-shots")
os.makedirs(SHOTS, exist_ok=True)
results = []

def check(name, cond, detail=""):
    results.append(cond)
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"), flush=True)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None

def raw(path):
    opener = urllib.request.build_opener(NoRedirect, urllib.request.ProxyHandler({}))
    try:
        r = opener.open(BASE + path)
        return r.status, {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}

# Redirects and headers
s, h = raw("/w/some-business/forms")
check("signed-out visitors are sent from the workspace to sign in", s in (302, 307) and "/login?next=%2Fw%2Fsome-business%2Fforms" in h.get("location", ""), (s, h.get("location")))
s, h = raw("/onboarding")
check("onboarding needs sign-in", s in (302, 307) and h.get("location", "").startswith("/login"), (s, h.get("location")))
s, h = raw("/auth/confirm")
check("email link handler rejects links without a token", s in (302, 307) and "/login?error=link" in h.get("location", ""), (s, h.get("location")))
s, h = raw("/login")
check("security headers are sent", h.get("x-frame-options") == "DENY" and h.get("x-content-type-options") == "nosniff" and "x-powered-by" not in {k.lower() for k in h}, h)
s, _ = raw("/t/not-a-token")
check("malformed tracking links show not found", s == 404, s)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 860})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))

    pg.goto(BASE + "/"); 
    check("landing page offers sign-up and sign-in", pg.get_by_role("link", name="Create an account").count() == 1 and pg.get_by_role("link", name="Sign in").count() == 1)

    pg.goto(BASE + "/login?next=//evil.example/steal")
    check("open redirects are blocked", pg.locator('input[name="next"]').input_value() == "/")
    pg.goto(BASE + "/login?next=/w/acme/board")
    check("safe return path is kept", pg.locator('input[name="next"]').input_value() == "/w/acme/board")
    pg.get_by_role("button", name="Sign in").click(); pg.wait_for_timeout(1500)
    check("sign-in validates the email", "Enter a valid email address" in pg.inner_text("main"))
    check("sign-in asks for the password", "Enter your password" in pg.inner_text("main"))
    pg.fill("#f-email", "alice@example.com"); pg.fill("#f-password", "correct-horse")
    pg.get_by_role("button", name="Sign in").click(); pg.wait_for_timeout(4000)
    check("sign-in explains when the sign-in service can't be reached", "couldn't reach the sign-in service" in pg.inner_text("main"), pg.inner_text("main")[:300])
    check("the email is kept after an error", pg.locator("#f-email").input_value() == "alice@example.com")
    pg.screenshot(path=f"{SHOTS}/login.png")

    pg.goto(BASE + "/signup")
    pg.fill("#f-fullName", "Alice"); pg.fill("#f-email", "alice@example.com"); pg.fill("#f-password", "short")
    pg.get_by_role("button", name="Create account").click(); pg.wait_for_timeout(1500)
    check("sign-up requires 8+ character passwords", "Use at least 8 characters" in pg.inner_text("main"))
    check("invalid fields are marked for screen readers", pg.locator('#f-password[aria-invalid="true"]').count() == 1 and pg.locator("#f-password").get_attribute("aria-describedby") is not None)
    pg.screenshot(path=f"{SHOTS}/signup.png")

    pg.goto(BASE + "/forgot-password")
    pg.fill("#f-email", "alice@example.com"); pg.get_by_role("button", name="Send reset link").click(); pg.wait_for_timeout(4000)
    check("password reset reports an unreachable service", "couldn't reach the sign-in service" in pg.inner_text("main"), pg.inner_text("main")[:300])

    pg.goto(BASE + "/invite/" + "a" * 64)
    check("invitation page asks visitors to sign in with the invited email", "invited" in pg.inner_text("main") and pg.get_by_role("link", name="Sign in").get_attribute("href").startswith("/login?next=%2Finvite%2F"))

    pg.goto(BASE + "/t/" + "a" * 64); pg.wait_for_timeout(1000)
    check("tracking page shows a friendly error when the database is unreachable", "can't reach the service" in pg.inner_text("body") or "Something went wrong" in pg.inner_text("body"), pg.inner_text("body")[:200])

    m = b.new_page(viewport={"width": 375, "height": 760})
    for path in ["/login", "/signup", "/"]:
        m.goto(BASE + path)
        check(f"{path} has no sideways scroll on a phone", m.evaluate("document.documentElement.scrollWidth") <= 375)
    m.goto(BASE + "/signup"); m.screenshot(path=f"{SHOTS}/signup-phone.png")
    d = b.new_page(viewport={"width": 1280, "height": 860}, color_scheme="dark")
    d.goto(BASE + "/login"); d.screenshot(path=f"{SHOTS}/login-dark.png")

    check("no browser script errors", not errors, errors[:3])
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
