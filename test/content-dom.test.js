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

  const sorted = PriceRunnerContent.applySort(PriceRunnerCore.SORT_MODES.ABSOLUTE_SAVING);
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

  const result = PriceRunnerContent.applySort(PriceRunnerCore.SORT_MODES.ABSOLUTE_SAVING);
  const badges = Array.from(document.querySelectorAll(".pricesorter-savings-percent"));

  assert.equal(result.applied, true);
  assert.deepEqual(
    badges.map((badge) => badge.textContent.trim()),
    ["(Spar 21.9%)", "(Spar 3.7%)"],
  );
  assert.deepEqual(
    badges.map((badge) => badge.getAttribute("data-start-price")),
    ["1655", "3275"],
  );
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
