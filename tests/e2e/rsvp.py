"""Browser tests for RSVP mode (Stage 10): the RSVP form and thank-you screens, the guest's change page,
the guest list with door check-in, the printed list, and the builder's RSVP settings and styling.
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/rsvp.py
"""
import os, sys, time
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

def css(page, sel, prop):
    return page.eval_on_selector(sel, f"e => getComputedStyle(e)[{prop!r}]")

def fill_guest(pg, name="Ava Stone", email="ava@example.com"):
    pg.get_by_label("Your name").fill(name)
    pg.get_by_label("Email").fill(email)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text and errors.append(m.text))

    # ------------------------------------------------------------ the RSVP form
    pg.goto(BASE + "/dev/rsvp"); pg.wait_for_selector(".qf-form")
    opts = pg.locator(".qf-opt[data-rsvp]")
    check("the RSVP question shows yes, no and maybe as option buttons", opts.count() == 3 and [opts.nth(i).get_attribute("data-rsvp") for i in range(3)] == ["yes", "no", "maybe"])
    check("the answers are a radio group", pg.get_by_role("radiogroup", name="Will you be there?").count() == 1)
    check("RSVP forms don't ask for texting permission", pg.locator('input[name="__consent"]').count() == 0)
    check("the footer says it's an RSVP", "RSVP by Demo Business" in pg.inner_text(".qf-powered"))
    check("the submit button uses RSVP wording", pg.locator('[data-sid="__submit"]').inner_text() == "Send my RSVP")
    party = pg.get_by_label("How many people, including you?")
    check("the guest count box shows", party.is_visible())
    pg.locator('.qf-opt[data-rsvp="no"]').click()
    check("saying no hides the guest count", wait_until(lambda: not party.is_visible()))
    pg.locator('.qf-opt[data-rsvp="yes"]').click()
    check("saying yes shows it again", party.is_visible())

    pg.goto(BASE + "/dev/rsvp"); pg.wait_for_selector(".qf-form")
    fill_guest(pg)
    pg.get_by_role("button", name="Send my RSVP").click()
    check("a reply is required", wait_until(lambda: "This is required." in pg.inner_text('.qf-field[data-kind="choice"]')))
    pg.locator('.qf-opt[data-rsvp="yes"]').click()
    pg.get_by_label("How many people, including you?").fill("9")
    pg.get_by_role("button", name="Send my RSVP").click()
    check("too many guests is refused with the limit", wait_until(lambda: "Enter how many people are coming (1 to 4)." in pg.inner_text(".qf-form")))
    pg.get_by_label("How many people, including you?").fill("3")
    pg.get_by_role("button", name="Send my RSVP").click()
    pg.wait_for_selector(".qf-rsvp-done")
    done = pg.inner_text(".qf-rsvp-done")
    check("a yes shows the 'on the list' headline", "You're on the list!" in done, done)
    check("the thank-you message is personal", "Thanks, Ava! Your reply for Harbourfront Launch Party is saved." in done, done)
    check("the event time and place are shown", "Saturday, November 7 · 6:00 PM – 9:30 PM" in done and "Pier 3, Harbourfront" in done and "Party of 3" in done, done)
    check("guests can add it to their calendar", pg.get_by_role("link", name="Add to Google Calendar").count() == 1 and pg.get_by_role("link", name="Apple / Outlook calendar (.ics)").count() == 1)
    check("guests get a link to change their reply", pg.get_by_role("link", name="Change or cancel your RSVP").count() == 1)
    last = pg.evaluate("window.__lastRsvp")
    check("the server checks get yes and 3 people, and no texting consent", last["rsvp"] == {"status": "yes", "party": 3} and last["consent"] is False and last["customer"]["email"] == "ava@example.com", last)
    pg.screenshot(path=f"{SHOTS}/rsvp-yes.png", full_page=True)
    pg.get_by_role("button", name="Send another RSVP").click()
    check("another RSVP can be sent", wait_until(lambda: pg.locator(".qf-form").count() == 1))

    pg.goto(BASE + "/dev/rsvp?full=1"); pg.wait_for_selector(".qf-form")
    fill_guest(pg, "Eve Moss", "eve@example.com"); pg.locator('.qf-opt[data-rsvp="yes"]').click(); pg.get_by_role("button", name="Send my RSVP").click()
    pg.wait_for_selector(".qf-rsvp-done")
    check("when full, the guest is told they're on the waitlist", "You're on the waitlist" in pg.inner_text(".qf-rsvp-done") and "We'll email you if a place opens up." in pg.inner_text(".qf-rsvp-done"))
    check("waitlisted guests aren't offered a calendar entry", pg.get_by_role("link", name="Add to Google Calendar").count() == 0)

    pg.goto(BASE + "/dev/rsvp"); pg.wait_for_selector(".qf-form")
    fill_guest(pg, "Dee Lane", "dee@example.com"); pg.locator('.qf-opt[data-rsvp="no"]').click(); pg.get_by_role("button", name="Send my RSVP").click()
    pg.wait_for_selector(".qf-rsvp-done")
    check("a no is thanked, without event details or calendar", "Thanks for letting us know" in pg.inner_text(".qf-rsvp-done") and pg.locator(".qf-when").count() == 0 and pg.get_by_role("link", name="Add to Google Calendar").count() == 0)
    check("a no counts nobody", pg.evaluate("window.__lastRsvp.rsvp") == {"status": "no", "party": 0})

    pg.goto(BASE + "/dev/rsvp?nomaybe=1"); pg.wait_for_selector(".qf-form")
    check("an empty maybe hides that answer", pg.locator(".qf-opt[data-rsvp]").count() == 2 and pg.locator('.qf-opt[data-rsvp="maybe"]').count() == 0)
    pg.goto(BASE + "/dev/rsvp?closed=1"); pg.wait_for_selector(".qf-closed")
    check("after the deadline the form says RSVPs have closed", "RSVPs for this event have closed." in pg.inner_text(".qf-closed") and pg.locator(".qf-form").count() == 0)

    m = b.new_page(viewport={"width": 390, "height": 844}, has_touch=True)
    m.goto(BASE + "/dev/rsvp"); m.wait_for_selector(".qf-form")
    check("the RSVP form fits a phone screen", m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    m.close()

    # ------------------------------------------------------------ the guest's change page
    pg.goto(BASE + "/dev/rsvp/manage"); pg.wait_for_selector(".qf-rsvp-done")
    check("the change page shows the current reply", "Hi Ava, your reply: You're on the list! (2 people)" in pg.inner_text(".qf-rsvp-done"))
    check("it uses the form's design", pg.locator('.qf-wrap[data-qf] .qf-title[data-sid="__title"]').count() == 1 and css(pg, ".qf-wrap", "backgroundColor") != "rgba(0, 0, 0, 0)")
    check("the current answer and guest count are filled in", pg.locator('.qf-opt[data-rsvp="yes"] input').is_checked() and pg.get_by_label("How many people, including you?").input_value() == "2")
    pg.get_by_label("How many people, including you?").fill("6")
    pg.get_by_role("button", name="Save my reply").click()
    check("asking for more places than are free explains the limit", wait_until(lambda: "There's only room for 4 in your party right now." in pg.inner_text(".qf-form")))
    pg.get_by_label("How many people, including you?").fill("4")
    pg.get_by_role("button", name="Save my reply").click()
    check("a guest can bring more people", wait_until(lambda: "(4 people)" in pg.inner_text(".qf-rsvp-done")))
    pg.locator('.qf-opt[data-rsvp="no"]').click()
    pg.get_by_role("button", name="Save my reply").click()
    check("a guest can cancel", wait_until(lambda: "Your RSVP is cancelled." in pg.inner_text(".qf-form") and "Thanks for letting us know" in pg.inner_text(".qf-rsvp-done")))
    check("after cancelling there's no calendar button", pg.get_by_role("link", name="Add to Google Calendar").count() == 0)
    pg.screenshot(path=f"{SHOTS}/rsvp-manage.png", full_page=True)
    pg.goto(BASE + "/dev/rsvp/manage?closed=1"); pg.wait_for_selector(".qf-form")
    check("after the deadline the page explains guests can only cancel or bring fewer", "you can only cancel or bring fewer people" in pg.inner_text(".qf-form"))
    pg.goto(BASE + "/dev/rsvp/manage?locked=1"); pg.wait_for_selector(".qf-rsvp-done")
    check("when changes are off, there's no change form, just who to contact", pg.locator(".qf-form").count() == 0 and "contact Demo Business at hello@demo.example" in pg.inner_text(".qf-card"))

    # ------------------------------------------------------------ guest list and door check-in
    pg.goto(BASE + "/dev/guests"); pg.wait_for_selector(".qg-row")
    stats = pg.inner_text(".qg-stats")
    check("totals count people coming, against the limit", "4 / 10" in stats and "coming (2 replies)" in stats, stats)
    check("maybes, nos and the waitlist are counted separately", "maybe (1)" in stats and "can't come" in stats and "on the waitlist (1)" in stats, stats)
    check("check-in progress shows arrived of expected", "1 / 4" in pg.inner_text(".qg-stat.arrived"))
    check("guests are listed with their reply", pg.locator(".qg-row").count() == 5 and "Waitlist" in pg.locator('.qg-row[data-guest="Eve Moss"]').inner_text())
    check("other answers show with the guest", "Dietary needs: One vegan" in pg.locator('.qg-row[data-guest="Ava Stone"]').inner_text())
    pg.get_by_label("Search guests").fill("0142")
    check("guests can be found by the last 4 digits of their phone", pg.locator(".qg-row").count() == 1 and pg.locator('.qg-row[data-guest="Cy Park"]').count() == 1)
    pg.get_by_label("Search guests").fill("")
    pg.get_by_role("button", name="Check in Ava Stone").click()
    check("checking in a party says so", wait_until(lambda: "Ava Stone checked in (party of 3)." in pg.inner_text(".qg-note")))
    check("the arrived count includes the whole party", "4 / 4" in pg.inner_text(".qg-stat.arrived") and pg.locator('.qg-row.in[data-guest="Ava Stone"]').count() == 1)
    pg.get_by_role("button", name="Undo check-in for Ava Stone").click()
    check("a check-in can be undone", wait_until(lambda: "1 / 4" in pg.inner_text(".qg-stat.arrived")))
    check("waitlisted and 'no' guests can't be checked in", pg.locator('.qg-row[data-guest="Eve Moss"] button', has_text="Check in").count() == 0 and pg.locator('.qg-row[data-guest="Dee Lane"] button', has_text="Check in").count() == 0)
    pg.get_by_label("Show").select_option("waitlist")
    check("the list can be filtered to the waitlist", pg.locator(".qg-row").count() == 1)
    pg.get_by_label("Show").select_option("all")
    pg.once("dialog", lambda d: d.accept())
    pg.get_by_role("button", name="Remove Dee Lane").click()
    check("removing asks first, and a refusal is explained", wait_until(lambda: "Only owners and admins can remove guests." in pg.inner_text(".qg-note")))
    check("the CSV and print links are offered", pg.get_by_role("link", name="Download CSV").count() == 1 and pg.get_by_role("link", name="Print list").count() == 1)
    pg.screenshot(path=f"{SHOTS}/guests.png", full_page=True)
    pg.get_by_role("button", name="Door check-in").click()
    check("door mode hides remove buttons and shows guests coming", wait_until(lambda: pg.locator(".qg.door").count() == 1) and pg.get_by_role("button", name="Remove Ava Stone").count() == 0 and pg.locator(".qg-row").count() == 3)

    m = b.new_page(viewport={"width": 390, "height": 844}, has_touch=True)
    m.goto(BASE + "/dev/guests?door=1"); m.wait_for_selector(".qg.door")
    check("door mode opens ready to search", m.evaluate("document.activeElement && document.activeElement.classList.contains('qg-search')"))
    m.get_by_label("Search guests").fill("ava")
    m.get_by_role("button", name="Check in Ava Stone").tap()
    check("guests can be checked in by touch on a phone", wait_until(lambda: "checked in" in m.inner_text(".qg-note")))
    check("door mode fits a phone screen", m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    m.screenshot(path=f"{SHOTS}/guests-door-phone.png", full_page=True)
    m.close()

    pg.goto(BASE + "/dev/guests/print"); pg.wait_for_selector(".qg-print table")
    names = pg.eval_on_selector_all(".qg-print tbody tr td:nth-child(2)", "els => els.map(e => e.textContent)")
    check("the printed list has the guests coming or maybe, by name", names == ["Ava Stone", "Ben Ortiz", "Cy Park"], names)

    # ------------------------------------------------------------ builder: turning a form into an RSVP
    pg.goto(BASE + "/dev/builder"); pg.wait_for_selector(".b-frame .qf-wrap")
    pg.get_by_role("tab", name="Settings").click()
    pg.get_by_role("radio", name="An RSVP").click()
    check("switching to RSVP adds the RSVP question to the preview", wait_until(lambda: pg.locator(".b-frame .qf-opt[data-rsvp]").count() == 3))
    check("the submit button switches to RSVP wording", pg.locator('.b-frame [data-sid="__submit"]').inner_text() == "Send my RSVP")
    check("the texting checkbox disappears", pg.locator('.b-frame input[name="__consent"]').count() == 0)
    check("guest options appear", pg.get_by_label("Guest limit").count() == 1 and pg.get_by_label("Reply by (last day)").count() == 1 and pg.get_by_label("Starts at").count() == 1)
    check("the waitlist option needs a guest limit first", pg.get_by_label("When it's full, keep a waitlist").count() == 0)
    pg.get_by_label("Guest limit").fill("50")
    check("with a limit, a waitlist can be switched on", wait_until(lambda: pg.get_by_label("When it's full, keep a waitlist").count() == 1))
    pg.get_by_label("Headline when a guest says yes").fill("See you on the pier!")
    pg.get_by_role("button", name='Preview "yes"').click()
    check("the thank-you preview uses the business's headline", wait_until(lambda: "See you on the pier!" in pg.inner_text(".b-frame .qf-rsvp-done")))
    pg.get_by_label("Reply to preview").select_option("wait")
    check("each reply's screen can be previewed", wait_until(lambda: "You're on the waitlist" in pg.inner_text(".b-frame .qf-rsvp-done")))
    pg.get_by_role("button", name="Form", exact=True).click()
    pg.get_by_role("radio", name="An order form").click()
    check("switching back to an order form restores order wording", wait_until(lambda: pg.locator('.b-frame [data-sid="__submit"]').inner_text() == "Submit") and pg.locator('.b-frame input[name="__consent"]').count() == 1)

    # ------------------------------------------------------------ builder: the RSVP question and its styling
    pg.goto(BASE + "/dev/builder?rsvp=1"); pg.wait_for_selector(".b-frame .qf-wrap")
    pg.locator('.b-frame .qf-opt[data-rsvp="yes"]').click()
    row = pg.locator(".b-row.open")
    check("clicking an answer opens the RSVP question", row.count() == 1 and row.locator(".b-opt-key").count() == 3)
    check("the answers are fixed: no adding, moving or removing", row.get_by_role("button", name="+ Add option").count() == 0 and row.get_by_role("button", name="Remove option 1").count() == 0)
    check("the RSVP question has no 'required' switch (it always is)", row.get_by_label("Required").count() == 0)
    row.get_by_role("textbox", name="Wording for Yes").fill("Count me in!")
    check("answer wording updates the preview", wait_until(lambda: pg.locator('.b-frame .qf-opt[data-rsvp="yes"]').inner_text() == "Count me in!"))
    row.get_by_role("textbox", name="Wording for Maybe").fill("")
    check("emptying maybe removes it from the preview", wait_until(lambda: pg.locator(".b-frame .qf-opt[data-rsvp]").count() == 2))
    row.get_by_label("Guest count question").fill("Total in your group?")
    check("the guest count question can be reworded", wait_until(lambda: pg.locator(".b-frame .qf-party").inner_text().startswith("Total in your group?")))
    row.get_by_label("Most people per reply (including the guest)").fill("1")
    check("with 1 person per reply, the guest count box goes", wait_until(lambda: pg.locator(".b-frame .qf-party").count() == 0))
    row.get_by_label("Most people per reply (including the guest)").fill("6")
    check("the add-block menu won't offer a second RSVP question", pg.locator("#b-add-type option", has_text="RSVP").count() == 0)
    # Each answer is its own styleable option
    row.locator(".b-opt").first.get_by_role("button", name="Artwork, colours and style for Count me in!").click()
    row.locator(".b-opt.open").get_by_role("button", name="Style this option in Design →").click()
    pg.wait_for_selector("text=This option only")
    el = pg.locator(".dsec", has_text="Element ID")
    YES = '.b-frame .qf-opt[data-rsvp="yes"] > span'
    NO = '.b-frame .qf-opt[data-rsvp="no"] > span'
    el.get_by_label("Background colour colour code", exact=True).fill("#2E7D32"); pg.wait_for_timeout(300)
    check("the yes answer can have its own colour", css(pg, YES, "backgroundColor") == "rgb(46, 125, 50)" and css(pg, NO, "backgroundColor") != "rgb(46, 125, 50)")
    pg.locator(".b-frame .qf-party .qf-in").click()
    check("the guest count box is its own styleable element", wait_until(lambda: "guest count box" in pg.inner_text(".elhead")))
    el = pg.locator(".dsec", has_text="Element ID")
    el.get_by_label("Inner padding left").fill("24"); pg.wait_for_timeout(250)
    check("the guest count box takes its own style", css(pg, ".b-frame .qf-party .qf-in", "paddingLeft") == "24px")
    pg.screenshot(path=f"{SHOTS}/rsvp-builder.png", full_page=True)

    check("no browser errors", not errors, errors[:5])
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
