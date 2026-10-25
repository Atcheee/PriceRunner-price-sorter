"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const PriceRunnerCore = require("../core.js");
const PriceRunnerPageParser = require("../page-parser.js");
const contentSource = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");

function createExtensionDom(html, parser = PriceRunnerPageParser) {
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://www.pricerunner.se/watchlist",
  });
  dom.window.PriceRunnerCore = PriceRunnerCore;
  dom.window.PriceRunnerPageParser = parser;
  dom.window.__PRICESORTER_DISABLE_AUTO_INIT__ = true;
  dom.window.chrome = {
    runtime: { onMessage: { addListener() {} } },
    storage: { local: { set() {} } },
  };
  dom.window.eval(contentSource);
  return dom;
}

function productNames(document) {
  return Array.from(document.querySelectorAll("[data-product-row] a")).map((link) => link.textContent);
}

test("sorting groups invalid rows and Original order restores stable DOM order", () => {
  const dom = createExtensionDom(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row><a href="/a">A</a><span>1 000 kr</span><span>900 kr</span></div>
      <div data-product-row><a href="/b">B</a><span>2 000 kr</span><span>1 200 kr</span></div>
      <div data-product-row><a href="/c">C</a><span>500 kr</span><span>-</span><span>Slut i lager</span></div>
    </div>
  </body>`);
  const { document, PriceRunnerContent } = dom.window;

  const sorted = PriceRunnerContent.applySort(PriceRunnerCore.SORT_MODES.PERCENTAGE_SAVING);
  assert.equal(sorted.applied, true);
  assert.equal(sorted.invalidCount, 1);
  assert.deepEqual(productNames(document), ["B", "A", "C"]);
  assert.equal(
    document.querySelector(".pricesorter-invalid-group-label")?.textContent,
    "Otillgängliga eller oläsbara (1)",
  );

  const restored = PriceRunnerContent.applySort(PriceRunnerCore.SORT_MODES.ORIGINAL);
  assert.equal(restored.applied, true);
  assert.deepEqual(productNames(document), ["A", "B", "C"]);
  assert.equal(document.querySelector(".pricesorter-invalid-group-label"), null);
  dom.window.close();
});

test("table dates do not inflate rendered savings percentages", () => {
  const dom = createExtensionDom(`<!doctype html><body>
    <div data-testid="watchlist">
      <table>
        <thead>
          <tr>
            <th>Produkt</th>
            <th>Senast uppdaterad</th>
            <th>Startpris</th>
            <th>Pris nu</th>
            <th>Bevakning</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><a href="/a">A</a></td><td>16 juli 2026</td><td>1 655 kr</td><td>1 293 kr</td><td>1 283 kr</td></tr>
          <tr><td><a href="/b">B</a></td><td>16 juli 2026</td><td>3 275 kr</td><td>3 154 kr</td><td>3 144 kr</td></tr>
        </tbody>
      </table>
    </div>
  </body>`);
  const { document, PriceRunnerContent } = dom.window;

  const result = PriceRunnerContent.applySort(PriceRunnerCore.SORT_MODES.PERCENTAGE_SAVING);
  const badges = Array.from(document.querySelectorAll(".pricesorter-savings-percent"));

  assert.equal(result.applied, true);
  assert.deepEqual(
    badges.map((badge) => badge.textContent.trim()),
    ["Spar 362 kr, 21.9%", "Spar 121 kr, 3.7%"],
  );
  assert.deepEqual(
    badges.map((badge) => badge.getAttribute("data-pricesorter-start")),
    ["1655", "3275"],
  );
  assert.ok(badges.every((badge) => badge.parentElement?.tagName === "TD"));
  dom.window.close();
});

test("price direction badges distinguish increases from decreases", () => {
  const dom = createExtensionDom(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row><a href="/down">Down</a><span>1 000 kr</span><span>800 kr</span></div>
      <div data-product-row><a href="/up">Up</a><span>1 000 kr</span><span>1 200 kr</span></div>
    </div>
  </body>`);
  const { document, PriceRunnerContent } = dom.window;

  PriceRunnerContent.applySort(PriceRunnerCore.SORT_MODES.PERCENTAGE_SAVING);
  const down = document.querySelector('[data-price-direction="down"]');
  const up = document.querySelector('[data-price-direction="up"]');

  assert.equal(down?.textContent, "Spar 200 kr, 20.0%");
  assert.equal(down?.classList.contains("pricesorter-savings-percent--down"), true);
  assert.equal(up?.textContent, "Ökat 200 kr, 20.0%");
  assert.equal(up?.classList.contains("pricesorter-savings-percent--up"), true);
  dom.window.close();
});

test("sort button injection is idempotent", () => {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", "normal.html"), "utf8");
  const dom = createExtensionDom(html);
  const { document, PriceRunnerContent } = dom.window;

  const first = PriceRunnerContent.refreshAvailability();
  const firstButton = document.getElementById("pricesorter-sort-button");
  const secondButton = PriceRunnerContent.ensureSortButton();

  assert.equal(first.supported, true);
  assert.equal(firstButton, secondButton);
  assert.equal(document.querySelectorAll("#pricesorter-sort-button").length, 1);
  assert.equal(document.querySelectorAll("#pricesorter-theme-button").length, 1);
  dom.window.close();
});

test("theme control remains available when sorting is unsupported", () => {
  const dom = createExtensionDom("<!doctype html><body><main>Vanlig sida</main></body>");
  const { document, PriceRunnerContent } = dom.window;

  const result = PriceRunnerContent.refreshAvailability();

  assert.equal(result.supported, false);
  assert.ok(document.getElementById("pricesorter-theme-button"));
  assert.equal(document.getElementById("pricesorter-sort-button"), null);
  dom.window.close();
});

test("page theme toggles dark mode without changing watchlist content", async () => {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", "normal.html"), "utf8");
  const dom = createExtensionDom(html);
  const { document, PriceRunnerContent } = dom.window;

  PriceRunnerContent.refreshAvailability();
  const beforeRows = document.querySelectorAll("[data-product-row]").length;
  const dark = PriceRunnerContent.applyPageTheme("dark");

  assert.equal(dark.isDark, true);
  assert.equal(document.documentElement.classList.contains("pricesorter-dark-theme"), true);
  assert.equal(document.documentElement.dataset.pricesorterTheme, "dark");
  assert.equal(document.getElementById("pricesorter-theme-button")?.textContent, "Ljust läge");
  assert.equal(document.querySelectorAll("[data-product-row]").length, beforeRows);

  const light = await PriceRunnerContent.togglePageTheme();
  assert.equal(light.isDark, false);
  assert.equal(document.documentElement.classList.contains("pricesorter-dark-theme"), false);
  assert.equal(document.documentElement.dataset.pricesorterTheme, "light");
  assert.equal(document.getElementById("pricesorter-theme-button")?.textContent, "Mörkt läge");
  dom.window.close();
});

test("page-control preference hides and restores only extension UI", () => {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", "normal.html"), "utf8");
  const dom = createExtensionDom(html);
  const { document, PriceRunnerContent } = dom.window;

  PriceRunnerContent.refreshAvailability();
  assert.ok(document.getElementById("pricesorter-sort-button"));
  PriceRunnerContent.setPageControl(false);
  assert.equal(document.getElementById("pricesorter-sort-button"), null);
  assert.equal(document.querySelectorAll("[data-product-row]").length, 2);
  PriceRunnerContent.setPageControl(true);
  assert.ok(document.getElementById("pricesorter-sort-button"));
  dom.window.close();
});

test("MutationObserver debounces site mutations and updates supported-page control", async () => {
  let analyzeCalls = 0;
  const parser = {
    ...PriceRunnerPageParser,
    analyzeDocument(...args) {
      analyzeCalls += 1;
      return PriceRunnerPageParser.analyzeDocument(...args);
    },
  };
  const dom = createExtensionDom("<!doctype html><body></body>", parser);
  const { document, PriceRunnerContent } = dom.window;
  PriceRunnerContent.init();
  assert.equal(analyzeCalls, 1);

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row><a href="/a">A</a><span>1 000 kr</span><span>900 kr</span></div>
    </div>`,
  );
  document.body.append(document.createElement("span"), document.createElement("span"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 350));

  assert.equal(analyzeCalls, 2);
  assert.ok(document.getElementById("pricesorter-sort-button"));

  document.querySelector("[data-testid='watchlist']").remove();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 350));
  assert.equal(document.getElementById("pricesorter-sort-button"), null);
  PriceRunnerContent.stopObserver();
  dom.window.close();
});

test("sticky sort reorders newly lazy-loaded rows", async () => {
  const dom = createExtensionDom(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row><a href="/a">A</a><span>1 000 kr</span><span>900 kr</span></div>
      <div data-product-row><a href="/b">B</a><span>2 000 kr</span><span>1 200 kr</span></div>
    </div>
  </body>`);
  const { document, PriceRunnerContent, PriceRunnerCore } = dom.window;
  PriceRunnerContent.init();

  const sorted = PriceRunnerContent.applySort(PriceRunnerCore.SORT_MODES.PERCENTAGE_SAVING);
  assert.equal(sorted.applied, true);
  assert.deepEqual(productNames(document), ["B", "A"]);

  document.querySelector("[data-testid='watchlist']").insertAdjacentHTML(
    "beforeend",
    `<div data-product-row><a href="/c">C</a><span>5 000 kr</span><span>1 000 kr</span></div>`,
  );
  await new Promise((resolve) => dom.window.setTimeout(resolve, 350));

  assert.deepEqual(productNames(document), ["C", "B", "A"]);
  PriceRunnerContent.stopObserver();
  dom.window.close();
});

test("sticky sort restores order when host re-render keeps the same count", async () => {
  const dom = createExtensionDom(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row><a href="/a">A</a><span>1 000 kr</span><span>900 kr</span></div>
      <div data-product-row><a href="/b">B</a><span>2 000 kr</span><span>1 200 kr</span></div>
    </div>
  </body>`);
  const { document, PriceRunnerContent, PriceRunnerCore } = dom.window;
  PriceRunnerContent.init();

  PriceRunnerContent.applySort(PriceRunnerCore.SORT_MODES.PERCENTAGE_SAVING);
  assert.deepEqual(productNames(document), ["B", "A"]);
  assert.equal(document.querySelectorAll(".pricesorter-savings-percent").length, 2);

  const watchlist = document.querySelector("[data-testid='watchlist']");
  // Simulate a host re-render that restores original order and drops our badges.
  watchlist.innerHTML = `
    <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
    <div data-product-row><a href="/a">A</a><span>1 000 kr</span><span>900 kr</span></div>
    <div data-product-row><a href="/b">B</a><span>2 000 kr</span><span>1 200 kr</span></div>
  `;
  await new Promise((resolve) => dom.window.setTimeout(resolve, 350));

  assert.deepEqual(productNames(document), ["B", "A"]);
  assert.equal(document.querySelectorAll(".pricesorter-savings-percent").length, 2);
  PriceRunnerContent.stopObserver();
  dom.window.close();
});

test("sorting still works when non-product siblings sit between rows", () => {
  const dom = createExtensionDom(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row><a href="/a">A</a><span>1 000 kr</span><span>900 kr</span></div>
      <div data-ad>Reklam</div>
      <div data-product-row><a href="/b">B</a><span>2 000 kr</span><span>1 200 kr</span></div>
    </div>
  </body>`);
  const { document, PriceRunnerContent, PriceRunnerCore } = dom.window;

  const sorted = PriceRunnerContent.applySort(PriceRunnerCore.SORT_MODES.PERCENTAGE_SAVING);
  assert.equal(sorted.applied, true);
  assert.deepEqual(productNames(document), ["B", "A"]);
  assert.equal(document.querySelectorAll(".pricesorter-savings-percent").length, 2);
  dom.window.close();
});

test("loadAllWatchlistRows waits until product count stops growing", async () => {
  const dom = createExtensionDom(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row><a href="/a">A</a><span>1 000 kr</span><span>900 kr</span></div>
    </div>
  </body>`);
  const { document, PriceRunnerContent } = dom.window;
  const watchlist = document.querySelector("[data-testid='watchlist']");
  let injected = 0;

  const originalScrollTo = dom.window.scrollTo.bind(dom.window);
  dom.window.scrollTo = (...args) => {
    if (injected < 2) {
      injected += 1;
      const name = injected === 1 ? "B" : "C";
      const start = injected === 1 ? "2 000 kr" : "5 000 kr";
      const now = injected === 1 ? "1 200 kr" : "1 000 kr";
      watchlist.insertAdjacentHTML(
        "beforeend",
        `<div data-product-row><a href="/${name.toLowerCase()}">${name}</a><span>${start}</span><span>${now}</span></div>`,
      );
    }
    return originalScrollTo(...args);
  };

  const result = await PriceRunnerContent.loadAllWatchlistRows({
    settleMs: 20,
    stableRounds: 2,
    maxRounds: 20,
  });

  assert.equal(result.loaded, true);
  assert.equal(result.count, 3);
  assert.ok(result.rounds >= 2);
  assert.deepEqual(productNames(document), ["A", "B", "C"]);
  dom.window.close();
});

test("sort after loadAll places highest percentage discount first across lazy rows", async () => {
  const dom = createExtensionDom(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row><a href="/a">A</a><span>10 000 kr</span><span>9 000 kr</span></div>
    </div>
  </body>`);
  const { document, PriceRunnerContent, PriceRunnerCore } = dom.window;
  const watchlist = document.querySelector("[data-testid='watchlist']");
  let injected = false;

  const originalScrollTo = dom.window.scrollTo.bind(dom.window);
  dom.window.scrollTo = (...args) => {
    if (!injected) {
      injected = true;
      watchlist.insertAdjacentHTML(
        "beforeend",
        // 500 kr / 50% — lower kr saving than A (1000 kr / 10%), higher percentage
        `<div data-product-row><a href="/c">C</a><span>1 000 kr</span><span>500 kr</span></div>`,
      );
    }
    return originalScrollTo(...args);
  };

  const loadResult = await PriceRunnerContent.loadAllWatchlistRows({
    settleMs: 20,
    stableRounds: 2,
    maxRounds: 10,
  });
  const sorted = PriceRunnerContent.applySort(PriceRunnerCore.SORT_MODES.PERCENTAGE_SAVING);

  assert.equal(loadResult.count, 2);
  assert.equal(sorted.applied, true);
  assert.deepEqual(productNames(document), ["C", "A"]);
  dom.window.close();
});

test("loadAll does not treat a hidden tab as a completed list", async () => {
  const dom = createExtensionDom(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row><a href="/a">A</a><span>1 000 kr</span><span>900 kr</span></div>
    </div>
  </body>`);
  const { document, PriceRunnerContent } = dom.window;
  const watchlist = document.querySelector("[data-testid='watchlist']");
  let hidden = true;
  let injected = false;
  let movedAway = false;

  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(document.body, "scrollHeight", { configurable: true, value: 1_000 });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 1_000,
  });
  Object.defineProperty(dom.window, "innerHeight", { configurable: true, value: 100 });
  dom.window.scrollTo = (_x, y) => {
    if (hidden && y === 800) movedAway = true;
    if (hidden && movedAway && y === 1_000 && !injected) {
      injected = true;
      watchlist.insertAdjacentHTML(
        "beforeend",
        `<div data-product-row><a href="/b">B</a><span>2 000 kr</span><span>1 000 kr</span></div>`,
      );
      hidden = false;
    }
  };

  const result = await PriceRunnerContent.loadAllWatchlistRows({
    settleMs: 5,
    maxRounds: 10,
  });

  assert.equal(result.loaded, true);
  assert.equal(result.count, 2);
  assert.equal(movedAway, true);
  assert.ok(result.rounds > 3);
  assert.deepEqual(productNames(document), ["A", "B"]);
  dom.window.close();
});

for (const hidden of [true, false]) {
test(`full sort waits through slow batches and finishes while tab stays ${hidden ? "hidden" : "visible"}`, async () => {
  const dom = createExtensionDom(`<!doctype html><body>
    <main data-testid="watchlist"><div><table><thead><tr><th>Produkt</th><th>Startpris</th><th>Pris nu</th></tr></thead>
      <tbody><tr><td><a href="/a">A</a></td><td>1 000 kr</td><td>900 kr</td></tr></tbody>
    </table></div><div id="sentinel"></div></main>
  </body>`);
  const { document, PriceRunnerContent } = dom.window;
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  dom.window.scrollTo = () => {};
  dom.window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  dom.window.eval(fs.readFileSync(path.join(__dirname, "..", "watchlist-loader.js"), "utf8"));

  const list = document.querySelector("tbody");
  const sentinel = document.getElementById("sentinel");
  let page = 0;
  let pendingTicks = 0;
  let workerDelays = 0;
  const onIntersect = () => {
    // The native browser observer never fires. Only the fallback can load rows.
    page++;
    observer.unobserve(sentinel);
    sentinel.remove();
    list.insertAdjacentHTML("beforeend", '<tr id="skeleton"><td></td></tr>');
    pendingTicks = 55;
  };
  const observer = new dom.window.IntersectionObserver(onIntersect);
  observer.observe(sentinel);
  if (!hidden) onIntersect();
  dom.window.chrome.runtime.sendMessage = async (message) => {
    assert.equal(message.type, "PRICESORTER_DELAY");
    workerDelays++;
    assert.ok(workerDelays < 150, "load must finish without a second click");
    if (pendingTicks && --pendingTicks === 0) {
      document.getElementById("skeleton").remove();
      const name = page === 1 ? "B" : "C";
      list.insertAdjacentHTML("beforeend", `<tr><td><a href="/${name}">${name}</a></td><td>1 000 kr</td><td>${page === 1 ? 500 : 100} kr</td></tr>`);
      if (page < 2) {
        document.querySelector("main").append(sentinel);
        observer.observe(sentinel);
        if (!hidden) onIntersect();
      }
    }
    return { ok: true };
  };

  const result = await PriceRunnerContent.sortWithFullList();
  assert.equal(result.applied, true);
  assert.equal(result.loadResult.count, 3);
  assert.equal(page, 2);
  assert.equal(document.hidden, hidden);
  assert.deepEqual(Array.from(list.querySelectorAll("a"), (link) => link.textContent), ["C", "B", "A"]);
  dom.window.close();
});
}
