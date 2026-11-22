"""Workspace header on phones and desktop: account button position, centring and menu placement (dev harness)."""
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
    for w, q in [(390, "?orgs=2"), (360, ""), (1280, "?orgs=2")]:
        pg = b.new_page(viewport={"width": w, "height": 700}, is_mobile=w < 800, has_touch=w < 800)
        pg.goto(BASE + "/dev/shell" + q)
        av = pg.locator("summary.avatar")
        box = av.bounding_box()
        logo = pg.locator(".top-inner > a").first.bounding_box()
        check(f"{w}px: account button is a circle of equal sides", box and abs(box["width"] - box["height"]) < 0.5, box)
        off = pg.evaluate("()=>{const s=document.querySelector('summary.avatar span').getBoundingClientRect(),a=document.querySelector('summary.avatar').getBoundingClientRect();return Math.max(Math.abs(s.left+s.width/2-(a.left+a.width/2)),Math.abs(s.top+s.height/2-(a.top+a.height/2)))}")
        check(f"{w}px: initials are centred in the circle", off <= 1, off)
        if w < 800:
            check(f"{w}px: account button sits on the logo's row, at the right", abs((box["y"] + box["height"] / 2) - (logo["y"] + logo["height"] / 2)) < 8 and box["x"] + box["width"] > w - 40, (box, logo))
            check(f"{w}px: account button is a comfortable tap target", box["width"] >= 36, box)
        av.click()
        menu = pg.locator(".menu-pop").bounding_box()
        check(f"{w}px: account menu opens fully on screen", menu and menu["x"] >= 0 and menu["x"] + menu["width"] <= w, menu)
        pg.close()
    # Profile picture: upload a photo (cropped square), remove it, upload a wide logo (fitted whole)
    from io import BytesIO
    from PIL import Image, ImageDraw
    Image.new("RGB", (900, 1600), (30, 120, 200)).save("/tmp/qtg-photo.jpg", quality=90)
    logo = Image.new("RGBA", (1200, 400), (0, 0, 0, 0)); ImageDraw.Draw(logo).rectangle([0, 150, 1199, 250], fill=(200, 30, 30, 255)); logo.save("/tmp/qtg-logo.png")
    pg = b.new_page(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True)
    pg.goto(BASE + "/dev/shell?pic=1")
    hb = pg.locator("summary.avatar img").bounding_box()
    check("a profile picture fills the account button circle", hb and abs(hb["width"] - hb["height"]) < 0.5 and hb["width"] >= 36, hb)
    check("initials are replaced by the picture", pg.locator("summary.avatar span").count() == 0)
    check("the settings field starts with initials and an Upload button", pg.locator(".avatar-lg").inner_text() == "DO" and pg.get_by_role("button", name="Upload picture").count() == 1)
    pg.locator("#avatar-input").set_input_files("/tmp/qtg-photo.jpg"); pg.wait_for_selector("text=Your picture is saved.")
    im = Image.open(BytesIO(pg.request.get(BASE + pg.locator(".avatar-lg img").get_attribute("src")).body()))
    check("a photo is cropped to a 256px square and re-encoded (metadata stripped)", im.size == (256, 256) and im.format in ("WEBP", "PNG"), (im.size, im.format))
    check("the button now offers Change and Remove", pg.get_by_role("button", name="Change picture").count() == 1 and pg.get_by_role("button", name="Remove").count() == 1)
    pg.get_by_role("button", name="Remove").click(); pg.wait_for_selector("text=Your picture is removed.")
    check("removing the picture goes back to initials", pg.locator(".avatar-lg").inner_text() == "DO" and pg.locator(".avatar-lg img").count() == 0)
    pg.locator("#avatar-input").set_input_files("/tmp/qtg-logo.png"); pg.wait_for_selector("text=Your picture is saved.")
    im = Image.open(BytesIO(pg.request.get(BASE + pg.locator(".avatar-lg img").get_attribute("src")).body())).convert("RGBA")
    mid = im.size[1] // 2
    check("a wide logo is fitted whole, not cropped (both ends survive, transparency kept)", im.getpixel((int(256 * 0.17), mid))[3] > 200 and im.getpixel((int(256 * 0.83), mid))[3] > 200 and im.getpixel((128, 20))[3] < 50, [im.getpixel((int(256 * 0.17), mid)), im.getpixel((128, 20))])
    open("/tmp/qtg-big.jpg", "wb").write(b"not really an image")
    pg.locator("#avatar-input").set_input_files("/tmp/qtg-big.jpg"); pg.wait_for_selector(".avatar-field .notice.error")
    check("a file that isn't a readable image is refused with a clear message", "read that image" in pg.locator(".avatar-field .notice").inner_text(), pg.locator(".avatar-field .notice").inner_text())
    pg.close()
    b.close()

print(f"{passed}/{passed + failed} header checks passed")
