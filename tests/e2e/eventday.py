"""Browser tests for the event-day tools (Stage 9): pickup screen, daily summary, printable tickets
and labels, and the CSV export, against the development harness.
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/eventday.py
"""
import csv, io, os, sys, time
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

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text and errors.append(m.text))
    pg.request.post(BASE + "/dev/board/control", data={"action": "reset"})

    # ------------------------------------------------------------ pickup
    pg.goto(BASE + "/dev/event/pickup"); pg.wait_for_selector(".qe-search")
    check("the search box is ready to type into", pg.evaluate("document.activeElement && document.activeElement.classList.contains('qe-search')"))
    check("the full phone number never reaches the page", "5551234567" not in pg.content())
    s = pg.get_by_label("Find an order")
    s.fill("QTG-1001")
    hit = pg.locator('.qe-hit[data-job="1001"]')
    check("an order can be found by its number", pg.locator(".qe-hit").count() == 1 and "Lena Ortiz" in hit.inner_text() and "Hoodie" in hit.inner_text())
    s.fill("sam")
    check("an order can be found by name", pg.locator(".qe-hit").count() == 1 and pg.locator('.qe-hit[data-job="1002"]').count() == 1)
    s.fill("4567")
    check("orders can be found by the last 4 digits of the phone", pg.locator(".qe-hit").count() >= 3)
    s.fill("nobody")
    check("no match says so plainly", "No orders match" in pg.inner_text(".qe"))
    s.fill("1001")
    pg.locator('.qe-hit[data-job="1001"]').get_by_role("button", name="Mark collected").click()
    check("an order can be marked collected", wait_until(lambda: "QTG-1001 marked as collected." in pg.inner_text(".qe")))
    check("the search clears, ready for the next customer", wait_until(lambda: s.input_value() == ""))
    s.fill("1001")
    check("a collected order shows as collected", wait_until(lambda: "Collected ✓" in pg.locator('.qe-hit[data-job="1001"]').inner_text()))
    s.fill("1004")
    check("orders already finished show as collected", "Collected ✓" in pg.locator('.qe-hit[data-job="1004"]').inner_text() and pg.locator('.qe-hit[data-job="1004"] button').count() == 0)
    pg.screenshot(path=f"{SHOTS}/event-pickup.png", full_page=True)
    m = b.new_page(viewport={"width": 390, "height": 844}, has_touch=True)
    m.goto(BASE + "/dev/event/pickup"); m.wait_for_selector(".qe-search"); m.get_by_label("Find an order").fill("sam")
    check("the pickup screen fits a phone, with large buttons", m.evaluate("document.documentElement.scrollWidth") <= 390
          and m.locator('.qe-hit[data-job="1002"] button').bounding_box()["height"] >= 44)

    # ------------------------------------------------------------ summary
    pg.request.post(BASE + "/dev/board/control", data={"action": "reset"})
    pg.goto(BASE + "/dev/event/summary"); pg.wait_for_selector(".qe-stats")
    stats = [x.inner_text() for x in pg.locator(".qe-stat b").all()]
    check("the summary counts open, due today and overdue jobs", stats[:3] == ["3", "1", "1"], stats)
    make = pg.locator("section", has=pg.locator("#tomake")).inner_text()
    rows = [[c.inner_text() for c in r.locator("td,th").all()] for r in pg.locator("section:has(#tomake) tr").all()]
    check("it adds up what to make across open orders", ["Hoodie · Red", "2"] in rows and ["Cap", "1"] in rows and ["What would you like?", "3"] in rows, rows)
    check("it adds up sizes", ["M", "3"] in rows and ["L", "1"] in rows and ["Sizes", "4"] in rows, rows)
    check("finished orders aren't counted as still to make", "T-shirt" not in make)
    check("overdue and due-today orders are listed", "QTG-1002" in pg.locator("section", has=pg.locator("#od")).inner_text() and "QTG-1003" in pg.locator("section", has=pg.locator("#dt")).inner_text())

    # ------------------------------------------------------------ print
    pg.goto(BASE + "/dev/event/print?kind=tickets"); pg.wait_for_selector(".qe-ticket")
    check("one ticket per open order", pg.locator(".qe-ticket").count() == 3)
    t = pg.locator('.qe-ticket[data-job="1001"]')
    check("tickets show the number, customer and answers", "QTG-1001" in t.inner_text() and "Lena Ortiz" in t.inner_text() and "M × 2" in t.inner_text() and "(555) 123-4567" in t.inner_text())
    check("tickets carry a QR code that opens the job", t.locator(".qr svg").count() == 1)
    check("tickets print on 4x6 pages", "size: 4in 6in" in pg.content())
    pg.emulate_media(media="print")
    check("the printout has no app buttons", pg.locator(".no-print:visible").count() == 0)
    pg.emulate_media(media="screen")
    pg.goto(BASE + "/dev/event/print?kind=labels"); pg.wait_for_selector(".qe-label")
    check("labels: one per open order on a letter sheet", pg.locator(".qe-label").count() == 3 and "size: letter" in pg.content())
    lb = pg.locator('.qe-label[data-job="1003"]').bounding_box()
    check("labels are the Avery 5160 size (2.625 x 1 in)", abs(lb["width"] - 252) < 2 and abs(lb["height"] - 96) < 2, lb)
    pg.screenshot(path=f"{SHOTS}/event-labels.png")

    # ------------------------------------------------------------ CSV
    r = pg.request.get(BASE + "/dev/event/export")
    body = r.body().decode("utf-8")
    check("the export downloads as a CSV file", r.status == 200 and "attachment" in r.headers.get("content-disposition", "") and body.startswith("﻿"))
    rows = list(csv.reader(io.StringIO(body.lstrip("﻿"))))
    check("the export has every order with its answers", len(rows) == 5 and rows[0][:5] == ["Order", "Placed", "Form", "Stage", "Customer"] and "What would you like?" in rows[0])
    check("spreadsheet formulas in answers are neutralised", any("'=SUM(A1) please" in c for c in sum(rows, [])))

    check("no browser errors", not errors, errors[:3])
    b.close()

passed = sum(results)
print(f"\n{passed}/{len(results)} event-day checks passed")
sys.exit(0 if passed == len(results) else 1)
