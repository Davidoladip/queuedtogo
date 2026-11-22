"""Event forms board, template gallery and template looks in the builder (dev harness)."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
passed = failed = 0

def check(name, cond, detail=""):
    global passed, failed
    if cond: passed += 1
    else:
        failed += 1
        print(f"FAIL: {name} {detail}")

with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------------------------------------------------------------- the board
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.goto(BASE + "/dev/forms")
    cards = pg.locator(".fgrid > .fcard:not(.fcard-new)")
    check("every form shows as a flyer card", cards.count() == 12 and pg.locator(".fgrid .fly").count() == 12, cards.count())
    first = cards.first
    check("a card shows its title, status and order count", first.locator(".fcard-title").inner_text() == "Holiday Makers Market" and first.locator(".fly-badge").inner_text() == "Live" and "orders" in first.locator(".fcard-nums").inner_text())
    wed = cards.filter(has_text="Amara & Daniel")
    check("RSVP forms count replies and link to guests", "replies" in wed.locator(".fcard-nums").inner_text() and wed.get_by_role("link", name="Guests").count() == 1)
    check("each flyer is drawn in its own colours", len({pg.evaluate("e => getComputedStyle(e).getPropertyValue('--fp')", el.element_handle()) for el in pg.locator(".fgrid .fly").all()}) >= 8)
    fonts = {pg.evaluate("e => getComputedStyle(e).fontFamily", el.element_handle()) for el in pg.locator(".fgrid .fly-title").all()}
    check("and in its own title typeface", len(fonts) >= 7, fonts)
    clipped = pg.evaluate("""() => [...document.querySelectorAll('.fgrid .fly-title')].filter(t => t.scrollHeight > t.clientHeight + 2).map(t => t.textContent)""")
    check("no flyer title is cut off", clipped == [], clipped)
    check("live forms offer Open form in a new tab", first.get_by_role("link", name="Open form").get_attribute("target") == "_blank")
    check("the board ends with a New event form tile", pg.locator(".fcard-new a").get_attribute("href").endswith("/forms/new"))
    check("flyers are hidden from screen readers (the text says it all)", pg.locator(".fgrid .fcard-art").first.get_attribute("aria-hidden") == "true")
    pg.goto(BASE + "/dev/forms?empty=1")
    check("with no forms, an invitation shows three example templates", pg.locator(".fempty h2").inner_text() == "Make your first event form" and pg.locator(".fempty-fan .fly").count() == 3)
    check("each example opens the gallery on that template", pg.locator(".fempty-fan a").first.get_attribute("href").endswith("/forms/new?template=market-stall") and pg.get_by_role("link", name="Market stall template").count() == 1)
    pg.close()
    m = b.new_page(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True)
    m.goto(BASE + "/dev/forms")
    boxes = [c.bounding_box() for c in m.locator(".fgrid > .fcard").all()[:2]]
    check("phones show two flyers per row", abs(boxes[0]["y"] - boxes[1]["y"]) < 2 and boxes[0]["width"] < 190, boxes)
    m.close()

    # ---------------------------------------------------------------- the gallery
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.goto(BASE + "/dev/forms/new")
    heads = pg.locator(".tpl-group-head h2").all_inner_texts()
    check("templates are grouped by what the event needs", heads == ["Take orders", "Sell tickets", "Collect RSVPs", "Start from scratch"], heads)
    check("ten templates, each a flyer with a name and description", pg.locator(".tpl-tile").count() == 10 and pg.locator(".tpl-tile .tpl-blurb").count() == 10)
    check("before choosing, the panel invites you to pick one", "Pick a template to preview it" in pg.locator(".tpl-panel").inner_text())
    pg.locator(".tpl-tile", has_text="Food truck").click()
    check("choosing a template marks it as chosen", pg.locator(".tpl-tile", has_text="Food truck").get_attribute("aria-pressed") == "true")
    check("the panel names it and offers the event name field", pg.locator(".tpl-panel-head h2").inner_text() == "Food truck" and pg.get_by_label("Event name").get_attribute("placeholder") == "e.g. Harbourfront Food Fest")
    check("the template is sent with the form", pg.locator('.tpl-create input[name="template"]').get_attribute("value") == "food-truck")
    check("a live preview shows the template working", pg.locator(".tpl-phone .qf-wrap").count() == 1 and pg.locator(".tpl-phone", has_text="What are you having?").count() == 1)
    pg.locator(".tpl-tile", has_text="Wedding").click()
    check("the wedding preview opens with its sealed envelope", pg.locator(".tpl-phone .qf-env-seal").count() == 1)
    pg.locator(".tpl-phone .qf-env-seal").click(); pg.wait_for_timeout(2600)
    check("tapping the seal opens the invitation in the preview", pg.locator(".tpl-phone .qf-cover, .tpl-phone .qf-form").count() >= 1)
    pg.get_by_role("button", name="Use a blank form").click()
    check("a blank form is offered too", pg.locator(".tpl-panel-head h2").inner_text() == "Blank form" and pg.locator('.tpl-create input[name="template"]').get_attribute("value") == "blank")
    pg.goto(BASE + "/dev/forms/new?template=concert-night")
    check("a template can be preselected from a link", pg.locator(".tpl-panel-head h2").inner_text() == "Concert night" and pg.locator(".tpl-phone .qf-tt").count() == 2)
    pg.close()
    m = b.new_page(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True)
    m.goto(BASE + "/dev/forms/new")
    check("on phones the preview stays hidden until you choose", not m.locator(".tpl-panel").is_visible())
    m.locator(".tpl-tile", has_text="Birthday party").click()
    pb = m.locator(".tpl-panel").bounding_box()
    check("choosing opens the preview as a full-screen sheet", m.locator(".tpl-panel").is_visible() and pb["width"] >= 389 and pb["y"] <= 0.5, pb)
    m.get_by_role("button", name="Back to templates").click()
    check("Back to templates closes it", not m.locator(".tpl-panel").is_visible())
    m.locator(".tpl-tile", has_text="Merch table").click(); m.keyboard.press("Escape")
    check("Escape closes it too", not m.locator(".tpl-panel").is_visible())
    m.close()

    # ---------------------------------------------------------------- template looks in the builder
    pg = b.new_page(viewport={"width": 1400, "height": 900})
    pg.goto(BASE + "/dev/builder")
    pg.get_by_role("tab", name="Design").click()
    chips = pg.locator(".looks-row .look-chip")
    check("the builder offers every template's look", chips.count() == 10, chips.count())
    before = pg.evaluate("() => getComputedStyle(document.querySelector('.b-frame .qf-wrap')).backgroundColor")
    qcount = pg.locator(".b-rows > li").count()
    chips.filter(has_text="Food truck").click(); pg.wait_for_timeout(300)
    after = pg.evaluate("() => getComputedStyle(document.querySelector('.b-frame .qf-wrap')).backgroundColor")
    check("applying a look changes the form's colours", after != before and after == "rgb(215, 38, 30)", (before, after))
    check("the questions are left alone", pg.locator(".b-rows > li").count() == qcount)
    pg.get_by_role("button", name="↶ Undo").click(); pg.wait_for_timeout(200)
    check("Undo brings the old look back", pg.evaluate("() => getComputedStyle(document.querySelector('.b-frame .qf-wrap')).backgroundColor") == before)
    pg.close()
    b.close()

print(f"{passed}/{passed + failed} template checks passed")
