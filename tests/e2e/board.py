"""Browser tests for the production board, job page and stage editor (Stage 7), against the
development harness. The harness keeps jobs in memory and follows the database's rules.
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/board.py
"""
import os, re, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://localhost:3000")
SHOTS = os.environ.get("SHOTS", "/tmp/claude-0/app-shots")
os.makedirs(SHOTS, exist_ok=True)
results = []

def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"), flush=True)

def col(pg, name):
    return pg.locator("section.col", has=pg.locator(".col-head", has_text=name))

def card(pg, num):
    return pg.locator(f'.ticket[data-job="{num}"]')

def col_of(pg, num):
    return card(pg, num).locator("xpath=ancestor::section[contains(@class,'col')]").get_attribute("aria-label")

def wait_until(fn, timeout=8):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return True
        except Exception:
            pass
        time.sleep(0.2)
    return False

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1400, "height": 900})
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text and errors.append(m.text))
    reset = lambda: pg.request.post(BASE + "/dev/board/control", data={"action": "reset"})
    teammate = lambda job, stage: pg.request.post(BASE + "/dev/board/control", data={"action": "teammate-move", "job": job, "stage": stage}).json()["ok"]

    # ------------------------------------------------------------------ board overview
    reset()
    pg.goto(BASE + "/dev/board")
    pg.wait_for_selector(".ticket")
    check("the board shows every stage as a column", pg.locator("section.col").count() == 6)
    stats = [pg.locator(".stat b").nth(i).inner_text() for i in range(4)]
    check("the summary counts open, due today, overdue and unassigned jobs", stats == ["3", "1", "1", "2"], stats)
    order = [t.get_attribute("data-job") for t in col(pg, "New order").locator(".ticket").all()]
    check("urgent jobs are listed first", order == ["1002", "1001"], order)
    c2 = card(pg, 1002).inner_text()
    check("cards show overdue, priority and the update channel", "Overdue" in c2 and "Urgent" in c2 and "SMS" in c2)
    check("cards show the assignee", "Finn Member" in card(pg, 1003).inner_text() and "Unassigned" in card(pg, 1001).inner_text())
    check("finished jobs are marked done", "Done" in card(pg, 1004).inner_text() and "SMS · off" in card(pg, 1004).inner_text())
    check("finished jobs have no move button", card(pg, 1004).locator(".t-next").count() == 0)
    pg.screenshot(path=f"{SHOTS}/board-start.png", full_page=True)

    # ------------------------------------------------------------------ moving
    card(pg, 1001).get_by_role("button", name="Move to Artwork approval →").click()
    check("the move button moves the card straight away", wait_until(lambda: col_of(pg, 1001) == "Artwork approval", 3))
    check("a message confirms the move", wait_until(lambda: "QTG-1001 moved to Artwork approval" in pg.locator(".toast").inner_text(), 3))
    pg.reload(); pg.wait_for_selector(".ticket")
    check("the move is saved", col_of(pg, 1001) == "Artwork approval")

    card(pg, 1001).drag_to(col(pg, "In production"))
    check("a card can be dragged to another stage", wait_until(lambda: col_of(pg, 1001) == "In production", 4))
    wait_until(lambda: "QTG-1001 moved to In production" in pg.locator(".toast").inner_text(), 4)
    pg.reload(); pg.wait_for_selector(".ticket")
    check("the dragged move is saved", col_of(pg, 1001) == "In production")

    # two people moving the same job
    check("(a teammate moves QTG-1002 on another device)", teammate(1002, "Quality check"))
    card(pg, 1002).get_by_role("button", name="Move to Artwork approval →").click()
    check("a move based on an out-of-date board is refused", wait_until(lambda: "Someone else just moved this job to Quality check" in pg.locator(".toast.bad").inner_text(), 4))
    check("the board then shows where the job really is", wait_until(lambda: col_of(pg, 1002) == "Quality check", 6))

    # updates from teammates appear without reloading
    check("(a teammate moves QTG-1003)", teammate(1003, "Ready for collection"))
    check("the board refreshes itself with teammates' changes", wait_until(lambda: col_of(pg, 1003) == "Ready for collection", 12))

    # keyboard
    btn = card(pg, 1003).get_by_role("button", name="Move to Completed →")
    btn.focus(); pg.keyboard.press("Enter")
    check("cards can be moved with the keyboard", wait_until(lambda: col_of(pg, 1003) == "Completed", 4))
    check("moving to a final stage marks the job done", wait_until(lambda: "Done" in card(pg, 1003).inner_text(), 3))
    check("moves are announced to screen readers", wait_until(lambda: "QTG-1003 moved to Completed" in (pg.locator('p[role="status"][aria-live="polite"]').text_content() or ""), 3))

    # ------------------------------------------------------------------ filters
    pg.get_by_label("Show jobs for").select_option("me")
    check("'My jobs' shows only my jobs", pg.locator(".ticket").count() == 0)
    pg.get_by_label("Show jobs for").select_option("none")
    check("'Unassigned' hides assigned jobs", pg.locator(".ticket").count() == 3 and card(pg, 1003).count() == 0)
    pg.get_by_label("Show jobs for").select_option("all")
    pg.get_by_label("Search jobs").fill("qtg-1002")
    check("search finds an order by number", pg.locator(".ticket").count() == 1 and card(pg, 1002).count() == 1)
    pg.get_by_label("Search jobs").fill("ortiz")
    check("search finds an order by customer name", pg.locator(".ticket").count() == 1 and card(pg, 1001).count() == 1)
    pg.get_by_label("Search jobs").fill("")

    # ------------------------------------------------------------------ job page
    reset()
    pg.goto(BASE + "/dev/board"); pg.wait_for_selector(".ticket")
    card(pg, 1001).get_by_role("link", name="Open order QTG-1001").click()
    pg.wait_for_selector("text=Work on this job")
    check("a card opens its job page", "Order QTG-1001" in pg.inner_text("h1") and "Lena Ortiz" in pg.inner_text("body"))
    check("the job page shows the customer and their consent", "lena@example.com" in pg.inner_text("body") and "Agreed" in pg.inner_text("body"))
    check("the job page shows the tracking link", pg.get_by_role("link", name="Open the tracking page ↗").get_attribute("href").endswith("/t/" + "a" * 64))
    pg.get_by_label("Assigned to").select_option(label="Finn Member")
    check("a job can be assigned", wait_until(lambda: "Assigned to Finn Member." in pg.inner_text(".panel-head"), 4))
    check("assigning is recorded in the history", wait_until(lambda: "Grace Owner · Assigned to Finn Member" in pg.inner_text(".events"), 4))
    pg.get_by_label("Priority").select_option(label="Urgent")
    check("the priority can be set", wait_until(lambda: pg.get_by_label("Priority").input_value() == "2", 4))
    pg.get_by_label("Due date").fill("2026-12-24")
    check("the due date can be changed", wait_until(lambda: "Due date set to Thu, Dec 24" in pg.inner_text(".events"), 4))
    check("the add-note button waits for some text", pg.get_by_role("button", name="Add note").is_disabled())
    pg.get_by_label("Internal note").fill("Customer wants gold thread")
    pg.get_by_role("button", name="Add note").click()
    check("notes are added to the activity", wait_until(lambda: "Note: Customer wants gold thread" in pg.inner_text(".events"), 4))
    check("the note box clears after adding", wait_until(lambda: pg.get_by_label("Internal note").input_value() == "", 3))
    pg.get_by_role("button", name="Edit title and summary").click()
    pg.get_by_label("Title").fill("Food Fest · Lena Ortiz (rush)")
    pg.get_by_role("button", name="Save details").click()
    check("the title can be edited", wait_until(lambda: "Edited the job details" in pg.inner_text(".events"), 4))
    pg.get_by_label("Stage").select_option(label="In production")
    check("the stage can be changed from the job page", wait_until(lambda: "Moved from New order to In production" in pg.inner_text(".events"), 4))
    pg.get_by_role("button", name="Mark complete").click()
    check("'Mark complete' moves the job to the final stage", wait_until(lambda: pg.locator(".pill.good", has_text="Done").count() == 1, 4))
    pg.get_by_role("button", name=re.compile("Reopen")).click()
    check("a finished job can be reopened", wait_until(lambda: pg.get_by_label("Stage").input_value() != "" and "Moved from Completed to Ready for collection" in pg.inner_text(".events"), 4))
    pg.screenshot(path=f"{SHOTS}/board-job.png", full_page=True)
    pg.get_by_role("link", name="← Production board").click()
    pg.wait_for_selector(".ticket")
    check("the board shows the job's new details", col_of(pg, 1001) == "Ready for collection" and "Finn Member" in card(pg, 1001).inner_text() and "Urgent" in card(pg, 1001).inner_text())

    # ------------------------------------------------------------------ stage editor
    pg.get_by_role("link", name="Edit stages").click()
    pg.wait_for_selector(".stage-row")
    check("the first stage can't be made final", pg.locator(".stage-row").first.get_by_label("Final stage").is_disabled())
    check("stages with jobs can't be deleted", pg.get_by_role("button", name="Delete New order").is_disabled())
    pg.get_by_label("Name of stage 4").fill("QC")
    pg.locator('.stage-row[data-stage-row="Quality check"]').get_by_role("button", name="Save").click()
    check("a stage can be renamed", wait_until(lambda: "QC saved." in pg.inner_text(".panel") and pg.get_by_label("Name of stage 4").input_value() == "QC", 4))
    pg.get_by_label("New stage name").fill("Embroidering")
    pg.get_by_role("button", name="Add stage").click()
    check("a stage can be added at the end", wait_until(lambda: pg.get_by_label("Name of stage 7").input_value() == "Embroidering", 4))
    pg.get_by_role("button", name="Move Embroidering up").click()
    check("a stage can be moved up", wait_until(lambda: pg.get_by_label("Name of stage 6").input_value() == "Embroidering", 4))
    pg.get_by_role("button", name="Move Embroidering up").click()
    wait_until(lambda: pg.get_by_label("Name of stage 5").input_value() == "Embroidering", 4)
    pg.get_by_role("button", name="Delete Artwork approval").click()
    pg.get_by_role("button", name="Delete Artwork approval").last.click()
    check("an empty stage can be deleted after confirming", wait_until(lambda: pg.locator('.stage-row[data-stage-row="Artwork approval"]').count() == 0, 4))
    pg.screenshot(path=f"{SHOTS}/board-stages.png", full_page=True)
    pg.goto(BASE + "/dev/board"); pg.wait_for_selector(".ticket")
    heads = [h.inner_text().split("\n")[0].strip() for h in pg.locator(".col-head").all()]
    check("the board uses the new stages and order", heads == ["New order", "In production", "QC", "Embroidering", "Ready for collection", "Completed"], heads)

    pg.goto(BASE + "/dev/board/stages?role=member"); pg.wait_for_selector(".stage-row")
    check("members see the stages but can't change them", pg.get_by_role("button", name="Add stage").count() == 0 and pg.locator(".stage-row button", has_text="Delete").count() == 0 and pg.get_by_label("Name of stage 1").is_disabled())

    # ------------------------------------------------------------------ phone
    reset()
    m = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    m.on("pageerror", lambda e: errors.append(str(e)))
    m.goto(BASE + "/dev/board"); m.wait_for_selector(".ticket")
    check("the page doesn't scroll sideways on a phone", m.evaluate("document.documentElement.scrollWidth") <= 390)
    m.locator('.ticket[data-job="1001"]').get_by_role("button", name="Move to Artwork approval →").tap()
    check("jobs can be moved by tapping on a phone", wait_until(lambda: m.locator('.ticket[data-job="1001"]').locator("xpath=ancestor::section[contains(@class,'col')]").get_attribute("aria-label") == "Artwork approval", 4))
    m.goto(BASE + "/dev/board/" + "00000000-0000-4000-8c00-000000000001"); m.wait_for_selector("text=Work on this job")
    check("the job page fits a phone", m.evaluate("document.documentElement.scrollWidth") <= 390)
    m.screenshot(path=f"{SHOTS}/board-job-phone.png", full_page=True)

    check("no browser errors", not errors, errors[:3])
    b.close()

passed = sum(results)
print(f"\n{passed}/{len(results)} board checks passed")
sys.exit(0 if passed == len(results) else 1)
