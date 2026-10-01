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


# Pixels of a canvas that differ from its own corner colour: a blank canvas is ~0.
COVERAGE_JS = """([sel]) => new Promise((resolve) => requestAnimationFrame(() => {
  const src = document.querySelector(sel);
  const W = src.clientWidth, H = src.clientHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0, src.width, src.height, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const bg = [d[0], d[1], d[2], d[3]];
  let n = 0, red = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) + Math.abs(d[i + 3] - bg[3]) > 30) n++;
    if (d[i] > 170 && d[i + 1] < 110 && d[i + 2] < 110) red++;
  }
  resolve({ cover: n / (W * H), red });
}))"""

# Screen position of one floorplan block, for clicking it.
BLOCK_JS = """([key, id]) => {
  const { bench, camera, renderer } = window.bitWidthLab.debug;
  const st = bench.get(key);
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
        body = lambda: page.locator("#panelbody").inner_text()

        print("Scene")
        cov = page.evaluate(COVERAGE_JS, ["#viewport canvas"])
        check("3D view drew something", cov["cover"] > 0.05, cov)
        tags = [t.lower() for t in page.locator(".labels .tag b").all_inner_texts()]
        check("five chips are labelled", tags == ["8-bit", "16-bit", "32-bit", "64-bit", "128-bit"], tags)
        notes = " | ".join(page.locator(".labels .bitnote").all_inner_texts())
        check("8- and 16-bit registers can't hold Unix time", "needs 4 registers" in notes and "needs 2 registers" in notes, notes)
        check("wider registers hold it in 31 bits", all(f"31 of {w} bits" in notes for w in (32, 64, 128)), notes)
        check("10 mm ruler is drawn", "10 mm" in page.locator(".labels .ruler").first.inner_text())
        check("view buttons for every chip", page.locator("#views [data-view]").count() == 6)

        print("Overview")
        b = body()
        check("Overview offers a stress test", page.locator("#quick-stress").count() == 1)
        check("die areas in the table", all(a in b for a in ("28.8", "29.4", "30.2", "32.2", "36.6")), b[:300])
        check("RV8 and RV16 are flagged as imaginary", "RV8 and RV16 don’t exist" in b)
        check("RV128 is flagged as unbuilt", "nobody has built a general-purpose 128-bit CPU" in b)

        print("Picking")
        x, y = page.evaluate(BLOCK_JS, ["64", "l3"])
        page.mouse.move(x, y)
        page.wait_for_timeout(250)
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
        check("multiplier grows with width squared", all(v in txt for v in ("0.002", "0.030", "0.12", "0.48")), txt)
        page.click("#partcard [data-act=clear]")
        check("clearing hides the card", not card.is_visible())

        print("Toggles")
        vp = page.locator("#viewport").bounding_box()
        clip = {"x": vp["x"], "y": vp["y"], "width": vp["width"], "height": vp["height"]}
        page.click("#v-64")
        page.wait_for_timeout(1600)
        before = page.screenshot(clip=clip)
        page.click("#t-lid")
        page.wait_for_timeout(1600)
        check("Lid changes the picture", before != page.screenshot(clip=clip))
        page.keyboard.press("l")
        page.wait_for_timeout(200)
        check("L key toggles the lid back off", page.locator("#t-lid").get_attribute("aria-pressed") == "false")
        page.click("#v-all")
        page.click("#t-power")
        page.wait_for_timeout(2200)
        check("Power pins switches to the underside", page.locator("#f-under").get_attribute("aria-pressed") == "true")
        red = page.evaluate(COVERAGE_JS, ["#viewport canvas"])["red"]
        check("supply contacts are drawn red", red > 200, red)
        page.click("#t-power")
        page.click("#f-under")

        print("Speed")
        page.click("#group-run")
        check("Run opens on Speed", page.locator("#tab-speed").get_attribute("aria-selected") == "true")
        check("six workloads", page.locator(".wl").count() == 6)
        crypto = page.locator('[data-wl="crypto"] .bars').inner_text()
        check("crypto speeds 0.01× … 1.00×", all(v in crypto for v in ("0.01×", "0.02×", "0.08×", "0.29×", "1.00×")), crypto)
        ptr = page.locator('[data-wl="ptr"] .bars').inner_text()
        check("8-bit can't run the 800 MB list", "can’t run" in ptr, ptr)
        page.click("#race-ptr")
        page.wait_for_timeout(300)
        check("race lanes for every chip", page.locator('[data-wl="ptr"] .racecard .lane').count() == 5)
        page.wait_for_selector('[data-wl="ptr"] .racecard.done', timeout=25000)
        result = page.locator('[data-wl="ptr"] .racecard').inner_text()
        check("race finishes with a verdict", "fastest" in result and "× the time" in result and "can’t run" in result, result[:300])
        check("race reports the 3.2 GB list on 128-bit", "3.2 GB of RAM" in result)

        print("Stress test")
        page.click("#tab-stress")
        page.click("#cooler-none")
        page.click("#wl-int64")
        page.click("#dur-180")
        page.click("#speed-60")
        page.click("#stress-go")
        page.wait_for_function("document.querySelector('#stress-status') && document.querySelector('#stress-status').textContent.startsWith('Finished')", timeout=180000)
        st = page.locator("#stress-table").inner_text()
        check("stats table lists hotspot, clock and power", all(k in st for k in ("Hotspot", "Clock", "Power", "Throughput", "Energy")), st[:200])
        pills = page.locator("#stress-table .pill").all_inner_texts()
        check("a verdict for every chip", len(pills) == 5, pills)
        check("no heatsink makes chips throttle", any("Throttled" in t for t in pills), pills)
        chart = page.evaluate(COVERAGE_JS, ["#chart-T canvas"])
        check("temperature chart is drawn", chart["cover"] > 0.02, chart)
        check("Heat view switched on", page.locator("#t-thermal").get_attribute("aria-pressed") == "true")
        check("heat legend is shown", page.locator("#heatlegend").is_visible())
        stats = " ".join(page.locator(".labels .statnote").all_inner_texts())
        check("live °C labels over the chips", stats.count("°C") == 5, stats)
        hud = page.locator("#stresshud")
        check("stats overlay on the 3D view", hud.is_visible() and page.locator("#stresshud .hud-card").count() == 5)
        check("overlay shows temperature, clock and power", all(k in hud.inner_text() for k in ("°C", "GHz", " W")), hud.inner_text()[:200])
        page.click("#stress-reset")
        check("reset clears the heat view", page.locator("#t-thermal").get_attribute("aria-pressed") == "false")
        check("reset removes the overlay", not hud.is_visible())

        print("Watch an op")
        page.click("#tab-watch")
        page.click("#w-finish")
        live = page.locator("#watch-live").inner_text()
        check("64-bit add answer", "0x0222_2222_2222_2221" in live, live[:200])
        check("every chip gets the right answer", page.locator("#watch-live .okmark").count() == 5)
        check("8-bit needs 58 instructions, 64-bit needs 4", "58/58" in live and "4/4" in live, live[:300])
        page.click("#w-mul")
        page.click("#w-n-256")
        page.wait_for_timeout(200)
        live = page.locator("#watch-live").inner_text()
        check("256-bit multiply takes 10,496 instructions on 8-bit", "/10,496" in live and "/56" in live, live[:300])
        page.click("#w-finish")
        page.wait_for_timeout(300)
        check("and still gets every answer right", page.locator("#watch-live .okmark").count() == 5)
        page.fill("#w-x", "zz")
        check("bad input explains itself", "Type a number" in page.locator("#watch-live").inner_text())

        print("Build")
        page.click("#group-build")
        page.check("#b-on")
        page.wait_for_timeout(600)
        check("your chip gets a view button", page.locator("#v-custom").count() == 1)
        page.fill("#b-name", "<b>x</b>")
        page.wait_for_function("[...document.querySelectorAll('.labels .tag b')].some((b) => b.textContent.includes('x'))", timeout=20000)
        tag_html = page.evaluate("[...document.querySelectorAll('.labels .tag b')].map((b) => b.innerHTML).join('|')")
        check("your chip's name is escaped", "&lt;b&gt;x&lt;/b&gt;" in tag_html and "<b>x</b>" not in tag_html, tag_html)
        page.click("#b-w-128")
        page.click("#b-node-28nm")
        page.wait_for_timeout(300)
        ro = page.locator("#build-readout").inner_text()
        check("28 nm makes the die huge and warns about it", "mm²" in ro and "lithography" in ro, ro[:300])
        page.click("#group-compare")
        page.wait_for_timeout(300)
        heads = page.locator("#panelbody table.cmp thead th").all_inner_texts()
        check("your chip joins the comparison tables", any("You" in h for h in heads), heads)
        page.click("#group-build")
        page.uncheck("#b-on")
        page.wait_for_timeout(600)
        check("taking it off the bench removes it", page.locator("#v-custom").count() == 0)

        print("Timeline")
        page.click("#group-history")
        page.wait_for_timeout(1200)
        check("History opens on the Timeline", page.locator("#tab-timeline").get_attribute("aria-selected") == "true")
        check("timeline takes over the viewport", page.locator("#tl").is_visible())
        check("3D canvas steps aside", page.evaluate("getComputedStyle(document.querySelector('#viewport canvas')).visibility") == "hidden")
        check("starts at the Intel 4004 in 1971", page.locator("#tl-year").get_attribute("aria-label") == "Year 1971")
        check("fifty-one events on the track", page.locator(".tl-card").count() == 51, page.locator(".tl-card").count())
        check("the first device is the Busicom calculator", "Busicom 141-PF" in page.locator("#tl-devs").inner_text())
        check("records start at 2,300 transistors", "2,300" in page.locator("#tl-stat-transistors").inner_text())
        page.click("#tl-list button:has-text('Intel 80386')")
        page.wait_for_function("document.querySelector('#tl-year').getAttribute('aria-label') === 'Year 1985'", timeout=15000)
        page.wait_for_timeout(900)
        check("picking the 386 shows its 275,000 transistors", "275,000" in page.locator("#tl-detail").inner_text())
        check("and the devices of the time", "Apple Macintosh" in page.locator("#tl-devs").inner_text(), page.locator("#tl-devs").inner_text())
        page.click("#tl-next")
        page.wait_for_timeout(1200)
        check("next goes to the 486", "Intel 80486" in page.locator("#tl-detail").inner_text(), page.locator("#tl-detail").inner_text()[:80])
        page.click("#tl-f-process")
        page.wait_for_timeout(300)
        rows = page.locator("#tl-list button").all_inner_texts()
        check("Manufacturing filter lists only manufacturing", any("FinFET" in r for r in rows) and not any("Intel 80486" in r for r in rows), rows[:5])
        check("and dims the chips on the track", "off" in (page.locator(".tl-card.k-chip").first.get_attribute("class") or ""))
        page.click("#tl-f-all")
        y0 = int(page.locator("#tl-year").get_attribute("aria-label").split()[-1])
        page.click("#tl-play")
        page.wait_for_timeout(4000)
        page.click("#tl-play")
        y1 = int(page.locator("#tl-year").get_attribute("aria-label").split()[-1])
        check("Play moves through the years", y1 > y0, (y0, y1))
        page.click("#group-compare")
        page.wait_for_timeout(500)
        check("leaving the timeline brings the 3D view back", not page.locator("#tl").is_visible() and page.evaluate("getComputedStyle(document.querySelector('#viewport canvas')).visibility") == "visible")

        print("Real chips")
        page.click("#group-history")
        page.click("#tab-real")
        page.wait_for_timeout(800)
        check("eleven chips listed", page.locator("tr[data-real]").count() == 11)
        check("eleven dies labelled in 3D", page.locator(".labels .realtag").count() == 11)
        check("only the All view in real mode", page.locator("#views [data-view]").count() == 1)
        check("Moore chart plots ten chips", page.locator(".moore .pt").count() == 10)
        page.click('tr[data-real="6502"]')
        page.wait_for_timeout(400)
        rc = page.locator(".realcard").inner_text()
        check("6502 card shows 3,510 transistors and 8 µm", "3,510" in rc and "8 µm" in rc, rc[:200])
        check("wafer map counts whole dies", "whole dies fit" in page.locator("#wafer-note").inner_text())
        wafer = page.evaluate(COVERAGE_JS, ["#wafer"])
        check("wafer map is drawn", wafer["cover"] > 0.3, wafer)

        print("Showroom")
        page.click("#group-showroom")
        page.wait_for_function("window.bitWidthLab.showroom && (window.bitWidthLab.showroom.state.ready || window.bitWidthLab.showroom.state.error)", timeout=90000)
        SR = "window.bitWidthLab.showroom"
        drawn = lambda: page.evaluate(f"{SR}.debug.drawn()")
        hover_label = lambda part: page.evaluate(f"{SR}.debug.project('{part}')")
        check("the model loaded", page.evaluate(f"{SR}.state.ready") and not page.evaluate(f"{SR}.state.error"), page.evaluate(f"{SR}.state.error"))
        check("the showroom takes over the viewport", page.locator("#sr").is_visible()
              and page.evaluate("getComputedStyle(document.querySelector('#viewport > canvas')).visibility") == "hidden")
        page.wait_for_timeout(1500)
        cov = page.evaluate(COVERAGE_JS, ["#sr-canvas"])
        check("the chip is drawn", cov["cover"] > 0.08, cov)
        names = page.locator("#sr-parts .sr-part b").all_inner_texts()
        check("ten parts, heat spreader on top and lands at the bottom", len(names) == 10 and names[0] == "Heat spreader" and names[-1] == "1,664 gold lands", names)
        spec = page.locator("#sr-spec").inner_text()
        check("spec table: 1,664 lands, 14 × 11 mm die", "1,664 gold lands" in spec and "14.0 × 11.0 mm" in spec, spec)
        thumbs = page.evaluate("[...document.querySelectorAll('.sr-thumb img')].map((i) => i.complete && i.naturalWidth)")
        check("three Cycles renders load", len(thumbs) == 3 and all(w and w >= 800 for w in thumbs), thumbs)

        def hovered(pt):
            page.mouse.move(pt["x"], pt["y"])
            page.mouse.move(pt["x"] + 1, pt["y"])
            try:
                page.wait_for_selector("#sr-tip:not([hidden])", timeout=4000)
                return page.locator("#sr-tip b").inner_text()
            except Exception:
                return None

        ihs0 = hover_label("heat-spreader")
        check("hovering the lid names it", hovered(ihs0) == "Heat spreader")
        page.locator("#sr-explode").fill("1")
        page.wait_for_function(f"{SR}.debug.drawn().explode > 0.97", timeout=30000)
        d = drawn()
        ihs1 = hover_label("heat-spreader")
        check("Explode lifts the lid and drops the lands", d["positions"]["heat-spreader"] > 15 and d["positions"]["lga-pads"] < -5, d["positions"])
        check("and the lid moves up the screen", ihs1["y"] < ihs0["y"] - 40, (ihs0, ihs1))
        page.keyboard.press("e")
        page.wait_for_function(f"{SR}.debug.drawn().explode < 0.03", timeout=30000)
        check("E puts it back together", page.locator("#sr-explode").input_value() == "0")
        page.click("#sr-lid")
        page.wait_for_function(f"!{SR}.debug.drawn().visible['heat-spreader']", timeout=30000)
        page.wait_for_timeout(600)
        check("Lid off shows the die under the pointer", hovered(hover_label("die")) == "Silicon die")
        page.mouse.click(*[hover_label("die")[k] for k in ("x", "y")])
        page.wait_for_timeout(500)
        card = page.locator("#sr-card").inner_text()
        check("clicking the die explains it", "Silicon die" in card and "14 × 11 mm" in card, card[:120])
        check("and marks it in the list", "on" in (page.locator("#sr-part-die").get_attribute("class") or ""))
        page.click("#sr-lid")
        page.click("#sr-flip")
        page.wait_for_function(f"Math.abs({SR}.debug.drawn().rotation - Math.PI) < 0.02", timeout=30000)
        page.wait_for_timeout(800)
        under = hovered(hover_label("lga-pads"))
        check("Turn over shows the underside", under in ("1,664 gold lands", "48 capacitors, underside"), under)
        page.click("#sr-flip")
        page.click("#sr-p-bright")
        page.wait_for_timeout(300)
        check("Bright light changes the backdrop", page.evaluate("getComputedStyle(document.querySelector('#sr')).backgroundImage").count("244, 246, 248") == 1)
        page.click("#sr-p-studio")
        az0 = page.evaluate(f"Math.atan2({SR}.debug.camera.position.x, {SR}.debug.camera.position.z)")
        page.click("#sr-spin")
        try:   # orbit damping ramps up per frame, and a software renderer draws few of them
            page.wait_for_function(f"Math.abs(Math.atan2({SR}.debug.camera.position.x, {SR}.debug.camera.position.z) - {az0}) > 0.05", timeout=30000)
        except Exception:
            pass
        az1 = page.evaluate(f"Math.atan2({SR}.debug.camera.position.x, {SR}.debug.camera.position.z)")
        page.click("#sr-spin")
        check("Turntable turns the camera", abs(az1 - az0) > 0.05, (az0, az1))
        page.wait_for_function(f"Math.abs({SR}.debug.drawn().rotation) < 0.02", timeout=30000)
        page.click("#sr-v-life")
        page.wait_for_timeout(2500)
        width = page.evaluate(f"""(() => {{
          const d = {SR}.debug, THREE_V = d.camera.position.constructor;
          const sub = d.pivot.children.find((o) => o.name === 'Substrate');
          sub.updateWorldMatrix(true, true);
          const y = sub.localToWorld(new THREE_V(0, 1.15, 0)).y;
          const a = new THREE_V(-20, y, 0).project(d.camera), b = new THREE_V(20, y, 0).project(d.camera);
          return (b.x - a.x) / 2 * d.renderer.domElement.clientWidth;
        }})()""")
        check("Life size draws 40 mm as 151 CSS pixels", abs(width - 40 * 96 / 25.4) < 6, round(width, 1))
        check("and says how to check it", page.locator("#sr-life").is_visible())
        page.click("#sr-r-exploded")
        page.wait_for_timeout(800)
        lb = page.evaluate("(() => { const i = document.querySelector('#sr-lb-img'); return [i.complete && i.naturalWidth, !document.querySelector('#sr-lb').hidden]; })()")
        check("a render opens over the live view", lb[1] and lb[0] and lb[0] >= 800, lb)
        check("and the live view stops drawing under it", drawn()["running"] is False)
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        check("Escape closes it and drawing resumes", page.locator("#sr-lb").is_hidden() and drawn()["running"] is True)
        page.click("#group-compare")
        page.wait_for_timeout(500)
        check("leaving the showroom brings the bench back", page.locator("#sr").is_hidden() and drawn()["running"] is False
              and page.evaluate("getComputedStyle(document.querySelector('#viewport > canvas')).visibility") == "visible")

        print("Other tabs")
        page.click("#group-compare")
        page.click("#tab-usage")
        check("Usage covers 2038 and the 8-bit era", "19 January 2038" in body() and "Arduino Uno" in body())
        page.click("#tab-size")
        check("Size explains where growth goes", "of that growth is the integer datapath" in body())
        table = page.locator("#panelbody .tablewrap").first
        check("Size table fits the panel", page.evaluate("(el) => el.scrollWidth <= el.clientWidth + 1", table.element_handle()))
        check("no console errors", not errors, errors)
        page.close()

        print("Deep link and phone")
        phone = browser.new_page(viewport={"width": 400, "height": 860}, color_scheme="light")
        watch(phone)
        phone.goto(url + "#stress", wait_until="networkidle")
        phone.wait_for_timeout(1500)
        check("#stress opens the Stress tab", phone.locator("#tab-stress").get_attribute("aria-selected") == "true")
        sw = phone.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        check("no sideways scroll at 400px", sw[0] <= sw[1], sw)
        phone.goto(url + "#watch", wait_until="networkidle")
        phone.wait_for_timeout(800)
        sw = phone.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        check("Watch fits at 400px too", sw[0] <= sw[1], sw)
        phone.goto(url + "#timeline", wait_until="networkidle")
        phone.wait_for_timeout(1200)
        sw = phone.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        check("Timeline fits at 400px", sw[0] <= sw[1] and phone.locator("#tl").is_visible(), sw)
        phone.goto(url + "#showroom", wait_until="networkidle")
        phone.wait_for_function("window.bitWidthLab.showroom && window.bitWidthLab.showroom.state.ready", timeout=90000)
        sw = phone.evaluate("[document.documentElement.scrollWidth, innerWidth, document.querySelector('.sr-bar-tools').getBoundingClientRect().right]")
        check("Showroom and its toolbar fit at 400px", sw[0] <= sw[1] and sw[2] <= sw[1], sw)
        check("no console errors on phone", not errors, errors)
        browser.close()


if __name__ == "__main__":
    main()
