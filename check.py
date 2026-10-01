"""check.py — Bit Width Lab, driven in a real browser.

    python3 check.py                    # starts its own server on a free port
    CHROMIUM=/path/to/chrome python3 check.py

Needs Playwright: pip install playwright && playwright install chromium
Assertions are on what rendered: pixels in the canvas, text in the panel,
the page's own geometry. The one exception is projecting a die block to
screen coordinates so a click can land on it; the result of that click is
still checked on screen.
"""

import os
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name}  {detail}")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


# Pixels of a region that differ from its own corner colour: a blank canvas is ~0.
COVERAGE_JS = """([x, y, w, h]) => new Promise((resolve) => requestAnimationFrame(() => {
  const src = document.querySelector('#viewport canvas');
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const sx = src.width / src.clientWidth;
  g.drawImage(src, x * sx, y * sx, w * sx, h * sx, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const bg = [d[0], d[1], d[2]];
  let n = 0, red = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30) n++;
    if (d[i] > 170 && d[i + 1] < 110 && d[i + 2] < 110) red++;
  }
  resolve({ cover: n / (w * h), red });
}))"""

# Screen position of one floorplan block, for clicking it.
BLOCK_JS = """([w, id]) => {
  const { chips, camera, renderer } = window.bitWidthLab.debug;
  const st = chips.find((c) => c.c.w === w);
  const mesh = st.blocks.find((b) => b.userData.id === id);
  const v = mesh.getWorldPosition(mesh.position.clone()).project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
}"""


def main():
    port = free_port()
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(port)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}/"
    try:
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
                break
            except OSError:
                time.sleep(0.1)
        run(url)
    finally:
        srv.terminate()
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


def run(url):
    with sync_playwright() as p:
        launch = {"args": ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]}
        if os.environ.get("CHROMIUM"):
            launch["executable_path"] = os.environ["CHROMIUM"]
        browser = p.chromium.launch(**launch)
        errors = []

        def watch(page):
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(m.text))

        page = browser.new_page(viewport={"width": 1500, "height": 880}, color_scheme="dark")
        watch(page)
        page.goto(url + "#overview", wait_until="networkidle")
        page.wait_for_timeout(2500)
        vp = page.locator("#viewport").bounding_box()
        region = [0, 0, int(vp["width"]), int(vp["height"])]

        print("Scene")
        cov = page.evaluate(COVERAGE_JS, region)
        check("3D view drew something", cov["cover"] > 0.05, cov)
        tags = page.locator(".labels .tag b").all_inner_texts()
        check("three chips are labelled", [t.lower() for t in tags] == ["32-bit", "64-bit", "128-bit"], tags)
        notes = " ".join(page.locator(".labels .bitnote").all_inner_texts())
        check("registers show Unix time in 31 bits", all(f"31 of {w} bits used" in notes for w in (32, 64, 128)), notes)
        check("10 mm ruler is drawn", page.locator(".labels .ruler").inner_text().strip() == "10 mm")

        print("Overview")
        body = page.locator("#panelbody").inner_text()
        check("die areas in the table", all(a in body for a in ("30.2", "32.2", "36.6")), body[:200])
        check("RV128 is flagged as unbuilt", "no one has built a general-purpose 128-bit CPU" in body)

        print("Picking")
        x, y = page.evaluate(BLOCK_JS, [64, "l3"])
        page.mouse.move(x, y)
        page.wait_for_timeout(200)
        tip = page.locator("#viewport .tip")
        check("hovering a block shows its name", tip.is_visible() and "Shared L3 cache" in tip.inner_text(), tip.inner_text() if tip.is_visible() else "hidden")
        page.mouse.click(x, y)
        page.wait_for_timeout(300)
        check("clicking a block opens Parts", page.locator("#tab-parts").get_attribute("aria-selected") == "true")
        card = page.locator("#partcard")
        check("part card names the clicked block", card.is_visible() and "Shared L3 cache" in card.inner_text())
        page.click("#part-mul")
        page.wait_for_timeout(200)
        txt = card.inner_text()
        check("multiplier card shows 0.03 / 0.12 / 0.48 mm²", all(v in txt for v in ("0.03", "0.12", "0.48")), txt)
        check("multiplier row is marked selected", "on" in (page.locator("#part-mul").get_attribute("class") or ""))
        page.click("#partcard [data-act=clear]")
        check("clearing hides the card", not card.is_visible())

        print("Toggles")
        page.click("#v-64")
        page.wait_for_timeout(1600)
        before = page.screenshot(clip={"x": vp["x"], "y": vp["y"], "width": vp["width"], "height": vp["height"]})
        page.click("#t-lid")
        page.wait_for_timeout(1600)
        after = page.screenshot(clip={"x": vp["x"], "y": vp["y"], "width": vp["width"], "height": vp["height"]})
        check("Lid toggle is pressed", page.locator("#t-lid").get_attribute("aria-pressed") == "true")
        check("Lid changes the picture", before != after)
        page.keyboard.press("l")
        page.wait_for_timeout(200)
        check("L key toggles the lid back off", page.locator("#t-lid").get_attribute("aria-pressed") == "false")
        page.click("#v-all")
        page.click("#t-power")
        page.wait_for_timeout(2000)
        check("Power pins switches to the underside", page.locator("#f-under").get_attribute("aria-pressed") == "true")
        red = page.evaluate(COVERAGE_JS, region)["red"]
        check("supply contacts are drawn red", red > 200, red)
        page.click("#t-power")
        page.click("#f-under")
        page.wait_for_timeout(300)

        print("Speed")
        page.click("#tab-speed")
        arts = page.locator(".wl")
        check("six workloads", arts.count() == 6, arts.count())
        crypto = page.locator('[data-wl="crypto"] .bars').inner_text()
        check("crypto speeds 0.08× / 0.29× / 1.00×", all(v in crypto for v in ("0.08×", "0.29×", "1.00×")), crypto)
        page.click("#m-eff")
        int32 = page.locator('[data-wl="int32"] .bars').inner_text()
        check("work per joule penalises idle width on 32-bit jobs", "0.59×" in int32 and "1.00×" in int32, int32)
        page.click("#m-speed")
        page.click("#race-ptr")
        page.wait_for_timeout(300)
        check("racing shows lanes inside the workload", page.locator('[data-wl="ptr"] .racecard .lane').count() == 3)
        check("other race buttons are disabled mid-race", page.locator("#race-int32").is_disabled())
        notes = " ".join(page.locator(".labels .bitnote").all_inner_texts())
        check("registers show bits in use for the job", "48 of 64 bits in use" in notes, notes)
        page.wait_for_selector('[data-wl="ptr"] .racecard.done', timeout=20000)
        result = page.locator('[data-wl="ptr"] .racecard').inner_text()
        check("race finishes with a verdict", "fastest" in result and "× the time" in result, result[:200])
        check("race reports the 3.2 GB list on 128-bit", "3.2 GB of RAM" in result, result[:300])

        print("Other tabs")
        page.click("#tab-usage")
        check("Usage covers 2038", "19 January 2038" in page.locator("#panelbody").inner_text())
        page.click("#tab-size")
        sz = page.locator("#panelbody").inner_text()
        check("Size explains where growth goes", "of that growth is the integer datapath" in sz, sz[-300:])
        table = page.locator("#panelbody .tablewrap")
        check("Size table fits the panel", page.evaluate("(el) => el.scrollWidth <= el.clientWidth + 1", table.element_handle()))
        page.click("#tab-input")
        check("Input lists supply contacts", "Supply contacts" in page.locator("#panelbody").inner_text())
        check("no console errors", not errors, errors)
        page.close()

        print("Deep link and phone")
        phone = browser.new_page(viewport={"width": 400, "height": 860}, color_scheme="light")
        watch(phone)
        phone.goto(url + "#size", wait_until="networkidle")
        phone.wait_for_timeout(1500)
        check("#size opens the Size tab", phone.locator("#tab-size").get_attribute("aria-selected") == "true")
        sw = phone.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        check("no sideways scroll at 400px", sw[0] <= sw[1], sw)
        check("no console errors on phone", not errors, errors)
        browser.close()


if __name__ == "__main__":
    main()
