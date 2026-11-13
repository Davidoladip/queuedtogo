"""Browser tests for the Billing page (plans, usage and event passes), against the development harness.
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/billing.py
Stripe itself is not reached here: the harness swaps the server actions for stand-ins. The Stripe logic
(webhooks, plan sync, passes) is covered by src/lib/billing.test.ts and the database rules by test:db.
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
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))

    def go(q):
        pg.goto(f"{BASE}/dev/billing{q}")
        pg.wait_for_selector(".bl")

    # Free plan
    go("?state=free")
    check("shows the current plan", pg.locator("#bl-now").inner_text().startswith("Free"))
    cards = pg.locator(".bl-plan")
    check("four plans", cards.count() == 4, cards.count())
    prices = [cards.nth(i).locator(".bl-price b").inner_text() for i in range(4)]
    check("priced $0 / $29 / $69 / $139", prices == ["$0", "$29", "$69", "$139"], prices)
    check("first-timers are offered the free trial", pg.get_by_role("button", name="Start 14-day free trial").count() == 3)
    check("trial needs a card note", "needs a card" in pg.locator("section[aria-labelledby=bl-plans]").inner_text())
    m = pg.get_by_role("meter", name="Replies")
    check("reply usage meter", m.get_attribute("aria-valuenow") == "47" and m.get_attribute("aria-valuemax") == "50")
    check("nearly-full meter is highlighted", "near" in (pg.locator(".bl-meter").nth(2).get_attribute("class") or ""))
    check("texts show as not included on Free", "Not on this plan" in pg.locator(".bl-meter").nth(3).inner_text())
    pg.screenshot(path=f"{SHOTS}/billing-free.png", full_page=True)
    pg.get_by_role("article", name="Pro plan").get_by_role("button").click()
    pg.wait_for_selector(".notice.success")
    check("choosing a plan calls the plan action", "demo:plan-pro" in pg.locator(".notice.success").inner_text())

    # Event passes
    sel = pg.locator(".bl-select select")
    check("pass form picker lists RSVP forms", sel.locator("option").count() == 2)
    check("three pass sizes priced $29 / $49 / $69", [pg.locator(".bl-passcard .bl-price b").nth(i).inner_text() for i in range(3)] == ["$29", "$49", "$69"])
    pg.get_by_role("article", name="Up to 100 guests pass").get_by_role("button").click()
    pg.wait_for_function("document.querySelector('.notice.success')?.textContent.includes('pass-100')")
    check("buying a pass calls the pass action", True)
    sel.select_option(label="Dr. Funmi's Golden Experience (2026-12-12)")
    check("a form's current pass (and smaller ones) show as included",
          pg.get_by_role("article", name="Up to 300 guests pass").get_by_text("Included").count() == 1
          and pg.get_by_role("article", name="Up to 100 guests pass").get_by_text("Included").count() == 1
          and pg.get_by_role("article", name="Unlimited guests pass").get_by_role("button").count() == 1)
    pg.get_by_role("article", name="Unlimited guests pass").get_by_role("button").click()
    pg.wait_for_selector(".notice.error")
    check("a failed purchase shows a clear error", "payment service" in pg.locator(".notice.error").inner_text())
    check("active passes list usage", "41 of 300 replies" in pg.locator(".bl-active").inner_text())

    # Trial
    go("?state=trial")
    check("trial end date shown", "Free trial until November 23, 2026" in pg.locator(".bl-current").inner_text(), pg.locator(".bl-current").inner_text())
    check("current paid plan is marked", pg.get_by_role("article", name="Pro plan").get_by_text("Your plan").count() == 1)
    check("other plans offer a switch", pg.get_by_role("button", name="Switch to Events").count() == 1)
    check("manage billing is offered", pg.get_by_role("button", name="Manage billing").count() == 1)
    check("unlimited replies show no limit", "no limit" in pg.locator(".bl-meter").nth(2).inner_text())

    go("?state=cancelling")
    check("cancelled plan says when it ends", "then move to Free" in pg.locator(".bl-current").inner_text())
    pg.get_by_role("button", name="Resume plan").click()
    pg.wait_for_selector(".notice.success")
    check("a cancelled plan can be resumed", "demo:resume" in pg.locator(".notice.success").inner_text())

    # Annual billing
    go("?state=free")
    tg = pg.get_by_role("radiogroup", name="Billing period")
    check("monthly is picked first", tg.get_by_role("radio", name="Monthly").get_attribute("aria-checked") == "true")
    tg.get_by_role("radio", name="Annual 2 months free").click()
    yearly = [cards.nth(i).locator(".bl-price b").inner_text() for i in range(4)]
    check("annual prices are $290 / $690 / $1,390", yearly == ["$0", "$290", "$690", "$1,390"], yearly)
    check("annual shows the monthly cost and saving", "$57.50 a month · save $138 a year" in pg.get_by_role("article", name="Pro plan").inner_text())
    pg.get_by_role("article", name="Pro plan").get_by_role("button").click()
    pg.wait_for_selector(".notice.success")
    check("choosing annual asks for the yearly price", "demo:plan-pro-year" in pg.locator(".notice.success").inner_text())
    go("?state=annual")
    check("an annual plan shows its yearly price", "$290/year" in pg.locator("#bl-now").inner_text() and "billed yearly" in pg.locator(".bl-current").inner_text(), pg.locator(".bl-current").inner_text())
    check("the toggle opens on the business's own period", pg.get_by_role("radio", name="Annual 2 months free").get_attribute("aria-checked") == "true")
    check("the annual plan is marked as theirs", pg.get_by_role("article", name="Starter plan").get_by_text("Your plan").count() == 1)
    pg.get_by_role("radio", name="Monthly").click()
    check("same plan, other period offers a switch", pg.get_by_role("article", name="Starter plan").get_by_role("button", name="Switch to monthly").count() == 1)
    go("?state=booked")
    check("a booked change is shown with its date", "Moves to Starter monthly on November 30, 2026" in pg.locator(".bl-current").inner_text(), pg.locator(".bl-current").inner_text())
    pg.get_by_role("radio", name="Monthly").click()
    check("the booked plan shows when it starts", pg.get_by_role("article", name="Starter plan").get_by_text("Starts November 30, 2026").count() == 1)
    go("?state=pastdue")
    err = pg.locator(".notice.error").inner_text()
    check("failed payment warning shows Stripe's reason", "didn't go through" in err and "insufficient funds" in err, err)
    pg.get_by_role("button", name="Update card").click()
    pg.wait_for_selector(".notice.success")
    check("Update card opens Stripe's billing page", "demo:card" in pg.locator(".notice.success").inner_text())

    # Comped (ThreadToGo)
    go("?state=comped")
    t = pg.locator(".bl-current").inner_text()
    check("comped business sees it's included at no charge", "included at no charge" in t and "Events" in t and "$139" not in t, t)
    check("comped business has nothing to buy", pg.locator(".bl-plan button").count() == 0 and pg.get_by_role("button", name="Manage billing").count() == 0)
    check("says when plan limits are off", pg.get_by_text("Plan limits aren't switched on yet").count() == 1)
    pg.screenshot(path=f"{SHOTS}/billing-comped.png", full_page=True)

    # Not connected / members
    go("?state=free&off=1")
    check("explains payments aren't on yet", pg.get_by_text("Payments aren't switched on yet").count() == 1)
    check("buttons are disabled until Stripe is connected", all(pg.locator(".bl-plan button").nth(i).is_disabled() for i in range(3)) and pg.locator(".bl-passcard button").first.is_disabled())
    go("?state=active&member=1")
    check("members see billing but can't change it", pg.get_by_text("Only owners and admins can change billing.").count() == 1 and pg.locator(".bl-plan button").first.is_disabled()
          and pg.get_by_role("button", name="Manage billing").count() == 0)
    go("?state=free&norsvp=1")
    check("explains how to get an RSVP form for a pass", pg.get_by_text("You don't have an RSVP form yet").count() == 1)

    # Return from checkout
    go("?state=trial&checkout=plan")
    check("thanks after checkout", pg.get_by_text("Thanks! Your plan is active.").count() == 1)
    go("?checkout=cancelled")
    check("cancelled checkout message", pg.get_by_text("Nothing was charged").count() == 1)

    # Phone width
    pg.set_viewport_size({"width": 390, "height": 844})
    go("?state=free")
    sw = pg.evaluate("document.documentElement.scrollWidth")
    check("no sideways scrolling on a phone", sw <= 390, sw)
    pg.screenshot(path=f"{SHOTS}/billing-phone.png", full_page=True)

    check("no page errors", not errors, errors)
    b.close()

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
