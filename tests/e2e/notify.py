"""Browser and webhook tests for customer text updates (Stage 8), against the development harness.
  QTG_DEV_HARNESS=1 npm run build && QTG_DEV_HARNESS=1 npm start
  python3 tests/e2e/notify.py
Webhook checks (signatures) need the server started with test Twilio settings (no real account,
nothing is ever sent):
  QTG_DEV_HARNESS=1 TWILIO_ACCOUNT_SID=AC<32 hex> TWILIO_AUTH_TOKEN=<32+ chars> TWILIO_MESSAGING_SERVICE_SID=MG<32 hex> npm start
  TWILIO_TEST=1 python3 tests/e2e/notify.py
"""
import base64, hashlib, hmac, os, sys, time
from urllib.parse import urlencode
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://localhost:3000")
SITE = os.environ.get("SITE_URL", "http://localhost:3000")
SHOTS = os.environ.get("SHOTS", "/tmp/claude-0/app-shots")
TWILIO = os.environ.get("TWILIO_TEST") == "1"
AC = "AC" + "a" * 32
TOKEN = "t" * 32
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

def sign(url, params, token=TOKEN):
    data = url + "".join(k + params[k] for k in sorted(params))
    return base64.b64encode(hmac.new(token.encode(), data.encode(), hashlib.sha1).digest()).decode()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text and "403" not in m.text and errors.append(m.text))
    pg.request.post(BASE + "/dev/notifications/control")

    if not TWILIO:
        pg.goto(BASE + "/dev/notifications"); pg.wait_for_selector(".qn-rule")
        conn = pg.inner_text(".qn-conn")
        check("the page says plainly that Twilio isn't connected", "Not connected to Twilio yet" in conn)
        check("it lists the missing settings by name only", "TWILIO_ACCOUNT_SID" in conn and "TWILIO_AUTH_TOKEN" in conn and "TWILIO_MESSAGING_SERVICE_SID" in conn)
        pg.get_by_label("Your mobile number").fill("(555) 123-4567")
        check("test texts can't be sent until Twilio is connected", pg.get_by_role("button", name="Send test").is_disabled())

        sw = pg.get_by_role("checkbox", name="Text customers when their order reaches a stage")
        check("texting starts switched off", not sw.is_checked())
        sw.check()
        check("an owner can switch texting on", wait_until(lambda: "Texting is on" in pg.inner_text(".qn")))
        pg.reload(); pg.wait_for_selector(".qn-rule")
        check("the texting switch is saved", pg.get_by_role("checkbox", name="Text customers when their order reaches a stage").is_checked())

        check("each stage has its own message", pg.locator(".qn-rule").count() == 4)
        check("stages can be off", not pg.get_by_label("Text the customer at Quality check").is_checked())
        prev = pg.locator('.qn-rule[data-stage="New order"] .qn-preview').inner_text()
        check("the preview fills in the details", "Hi Lena, we have your order QTG-1042" in prev and "Demo Business" in prev, prev)
        check("the preview adds the opt-out line", prev.rstrip().endswith("Reply STOP to opt out."), prev)
        check("the preview counts the texts it will use", "Preview · 1 text" in prev or "Preview · 2 texts" in prev, prev)

        box = pg.get_by_label("Message for In production")
        box.fill("Hi {nickname}, order {order} is being made.")
        rule = pg.locator('.qn-rule[data-stage="In production"]')
        check("unknown placeholders are flagged", "Unknown placeholder {nickname}" in rule.inner_text())
        check("a message with unknown placeholders can't be saved", rule.get_by_role("button", name="Save").is_disabled())
        box.fill("Good news {name}! Order {order} is on the machine now. - {business}")
        rule.get_by_role("button", name="Save").click()
        check("a stage's message can be changed", wait_until(lambda: "In production saved." in pg.inner_text(".qn")))
        pg.reload(); pg.wait_for_selector(".qn-rule")
        check("the new message is saved", pg.get_by_label("Message for In production").input_value() == "Good news {name}! Order {order} is on the machine now. - {business}")

        qc = pg.locator('.qn-rule[data-stage="Quality check"]')
        pg.get_by_label("Message for Quality check").fill("")
        pg.get_by_label("Text the customer at Quality check").check()
        check("a stage can't be switched on without a message", qc.get_by_role("button", name="Save").is_disabled())
        qc.get_by_role("button", name="Undo").click()
        check("changes can be undone before saving", not pg.get_by_label("Text the customer at Quality check").is_checked() and "quality checks" in pg.get_by_label("Message for Quality check").input_value())

        log = pg.locator(".qn-log li")
        check("the log lists recent updates", log.count() == 3)
        check("the log shows delivered, not-sent and failed texts", pg.locator('.qn-log li[data-status="delivered"] .pill').inner_text() == "Delivered"
              and pg.locator('.qn-log li[data-status="skipped"] .pill').inner_text() == "Not sent" and pg.locator('.qn-log li[data-status="failed"] .pill').inner_text() == "Failed")
        check("the log says why a text wasn't sent", "didn't agree to order updates" in pg.inner_text(".qn-log") and "The number doesn't exist." in pg.inner_text(".qn-log"))
        check("numbers are shortened in the log", "•••• 4567" in pg.inner_text(".qn-log") and "+15551234567" not in pg.content())
        check("log entries link to their job", pg.locator(".qn-log a", has_text="QTG-1001").get_attribute("href") == "/dev/board/00000000-0000-4000-8c00-000000000001")
        pg.screenshot(path=f"{SHOTS}/notify.png", full_page=True)

        pg.goto(BASE + "/dev/notifications?role=member"); pg.wait_for_selector(".qn-rule")
        check("members can see the settings but not change them",
              pg.get_by_role("checkbox", name="Text customers when their order reaches a stage").is_disabled()
              and pg.get_by_label("Message for New order").is_disabled() and pg.get_by_role("button", name="Save").count() == 0)

        pg.request.post(BASE + "/dev/board/control", data={"action": "reset"})
        pg.goto(BASE + "/dev/board/00000000-0000-4000-8c00-000000000001"); pg.wait_for_selector("text=Texts to the customer")
        sec = pg.locator("section", has=pg.locator("#txts")).inner_text()
        check("the job page lists the texts sent about it", "Delivered" in sec and "Hi Lena, we have your order QTG-1001" in sec)

        m = b.new_page(viewport={"width": 390, "height": 844})
        m.goto(BASE + "/dev/notifications"); m.wait_for_selector(".qn-rule")
        check("the page fits a phone", m.evaluate("document.documentElement.scrollWidth") <= 390)
        m.screenshot(path=f"{SHOTS}/notify-phone.png", full_page=True)

        # Webhooks refuse everything while Twilio isn't set up.
        r = pg.request.post(BASE + "/api/twilio/status", form={"MessageSid": "SM" + "1" * 32, "MessageStatus": "delivered"})
        check("delivery webhooks are refused when Twilio isn't set up", r.status == 403)
    else:
        pg.goto(BASE + "/dev/notifications"); pg.wait_for_selector(".qn-rule")
        check("with Twilio settings present the page shows it's connected", "Connected to Twilio" in pg.inner_text(".qn-conn"))
        check("no Twilio setting is shown on the page", AC not in pg.content() and TOKEN not in pg.content())
        pg.get_by_label("Your mobile number").fill("(555) 123-4567")
        check("test texts can then be sent", not pg.get_by_role("button", name="Send test").is_disabled())

        url = SITE + "/api/twilio/status"
        params = {"AccountSid": AC, "MessageSid": "SM" + "1" * 32, "MessageStatus": "delivered"}
        r = pg.request.post(BASE + "/api/twilio/status", headers={"X-Twilio-Signature": sign(url, params), "Content-Type": "application/x-www-form-urlencoded"}, data=urlencode(params))
        check("a correctly signed delivery update is accepted", r.status == 204, r.status)
        r = pg.request.post(BASE + "/api/twilio/status", headers={"X-Twilio-Signature": sign(url, params, "x" * 32), "Content-Type": "application/x-www-form-urlencoded"}, data=urlencode(params))
        check("a delivery update signed with the wrong key is refused", r.status == 403, r.status)
        forged = dict(params, MessageStatus="failed")
        r = pg.request.post(BASE + "/api/twilio/status", headers={"X-Twilio-Signature": sign(url, params), "Content-Type": "application/x-www-form-urlencoded"}, data=urlencode(forged))
        check("a delivery update changed after signing is refused", r.status == 403, r.status)
        other = dict(params, AccountSid="AC" + "b" * 32)
        r = pg.request.post(BASE + "/api/twilio/status", headers={"X-Twilio-Signature": sign(url, other), "Content-Type": "application/x-www-form-urlencoded"}, data=urlencode(other))
        check("updates for another Twilio account are refused", r.status == 403, r.status)
        r = pg.request.post(BASE + "/api/twilio/status", data=urlencode(params), headers={"Content-Type": "application/x-www-form-urlencoded"})
        check("unsigned delivery updates are refused", r.status == 403, r.status)

        iurl = SITE + "/api/twilio/inbound"
        ip = {"AccountSid": AC, "From": "+15551234567", "To": "+18885550100", "Body": "STOP", "MessageSid": "SM" + "2" * 32}
        r = pg.request.post(BASE + "/api/twilio/inbound", headers={"X-Twilio-Signature": sign(iurl, ip), "Content-Type": "application/x-www-form-urlencoded"}, data=urlencode(ip))
        check("a signed STOP reply is accepted with an empty reply", r.status == 200 and "<Response></Response>" in r.text() and "xml" in r.headers.get("content-type", ""))
        r = pg.request.post(BASE + "/api/twilio/inbound", headers={"Content-Type": "application/x-www-form-urlencoded"}, data=urlencode(ip))
        check("unsigned replies are refused", r.status == 403)

    check("no browser errors", not errors, errors[:3])
    b.close()

passed = sum(results)
print(f"\n{passed}/{len(results)} notification checks passed")
sys.exit(0 if passed == len(results) else 1)
