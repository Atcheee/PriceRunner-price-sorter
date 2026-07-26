"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

require("../core.js");
const { analyzeDocument } = require("../page-parser.js");

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

function analyzeFixture(name) {
  const dom = new JSDOM(fixture(name), { url: "https://www.pricerunner.se/watchlist" });
  return analyzeDocument(dom.window.document, dom.window.location);
}

test("normal fixture produces semantic product models", () => {
  const result = analyzeFixture("normal.html");

  assert.equal(result.supported, true);
  assert.equal(result.entries.length, 2);
  assert.deepEqual(
    result.entries.map(({ product }) => [product.name, product.startPrice, product.currentPrice]),
    [
      ["Produkt A", 1499, 999],
      ["Produkt B", 2000, 1800],
    ],
  );
  assert.equal(result.summary.state, "healthy");
});

test("localized fixture parses non-breaking spaces and decimal commas", () => {
  const result = analyzeFixture("localized-price.html");
  const product = result.entries[0].product;

  assert.equal(product.startPrice, 12345.5);
  assert.equal(product.currentPrice, 9999.95);
  assert.ok(Math.abs(product.absoluteSaving - 2345.55) < 0.000001);
});

test("missing and out-of-stock fixtures stay represented", () => {
  const missing = analyzeFixture("missing-price.html");
  const unavailable = analyzeFixture("out-of-stock.html");

  assert.equal(missing.entries.length, 2);
  assert.equal(missing.summary.parserFailures, 2);
  assert.equal(unavailable.entries.length, 1);
  assert.equal(unavailable.entries[0].product.stockState, "unavailable");
  assert.equal(unavailable.summary.state, "all-unavailable");
});

test("changed generated class still works through stable semantic selector", () => {
  const result = analyzeFixture("changed-class.html");

  assert.equal(result.supported, true);
  assert.equal(result.selectorName, "watchlist-v2-testid");
  assert.equal(result.selectorTier, "stable");
});

test("unrelated page returns detectable unsupported state", () => {
  const dom = new JSDOM("<!doctype html><p>Vanlig sida</p>", {
    url: "https://www.pricerunner.se/",
  });
  const result = analyzeDocument(dom.window.document, dom.window.location);

  assert.equal(result.supported, false);
  assert.equal(result.reason, "watchlist-not-detected");
  assert.equal(result.summary.state, "unsupported");
});

test("product grids on non-watchlist routes never become supported", () => {
  const dom = new JSDOM(`<!doctype html><body>
    <main id="content-below-header">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row><a href="/pl/1-a">Produkt A</a><span>1 000 kr</span><span>900 kr</span></div>
      <div data-product-row><a href="/pl/1-b">Produkt B</a><span>2 000 kr</span><span>1 800 kr</span></div>
    </main>
  </body>`, { url: "https://www.pricerunner.se/" });
  const result = analyzeDocument(dom.window.document, dom.window.location);

  assert.equal(result.supported, false);
  assert.equal(result.reason, "unsupported-route");
  assert.equal(result.entries.length, 0);
});

test("row snapshots accept unit prices but reject unsafe external URLs", () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row><a href="javascript:alert(1)">Produkt A</a><span>100 kr</span><span>80 kr</span><span>20 kr/kg</span></div>
    </div>
  </body>`, { url: "https://www.pricerunner.se/watchlist" });
  const result = analyzeDocument(dom.window.document, dom.window.location);
  const product = result.entries[0].product;

  assert.equal(product.unitPrice, 20);
  assert.equal(product.url, "");
  assert.ok(product.warnings.includes("url:missing"));
});

test("row parser ignores unrelated counts before current price", () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row>
        <a href="/produkt/a">Produkt 2026</a>
        <span>Startpris: 5 658kr</span>
        <span>0 butiker, Pris nu: 4 999kr</span>
      </div>
    </div>
  </body>`, { url: "https://www.pricerunner.se/watchlist" });
  const product = analyzeDocument(dom.window.document, dom.window.location).entries[0].product;

  assert.equal(product.startPrice, 5658);
  assert.equal(product.currentPrice, 4999);
  assert.equal(product.absoluteSaving, 659);
  assert.ok(Math.abs(product.percentageSaving - 11.647225167903853) < 0.000001);
});

test("row parser falls back when header index points at non-price content", () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row>
        <div><a href="/produkt/a">Produkt A</a><small>0 bevakningar</small></div>
        <div><span>5 658kr</span><span>4 999kr</span></div>
        <div>0 butiker</div>
      </div>
    </div>
  </body>`, { url: "https://www.pricerunner.se/watchlist" });
  const product = analyzeDocument(dom.window.document, dom.window.location).entries[0].product;

  assert.equal(product.startPrice, 5658);
  assert.equal(product.currentPrice, 4999);
  assert.equal(product.absoluteSaving, 659);
});

test("visible labeled prices override zero-valued tracking attributes", () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div data-testid="watchlist">
      <div><span>Produkt</span><span>Startpris</span><span>Pris nu</span></div>
      <div data-product-row data-start-price="0" data-current-price="0">
        <a href="/produkt/a">Produkt A</a>
        <span>Startpris: 1 655 kr</span>
        <span>Pris nu: 1 293 kr</span>
        <span>1 283 kr</span>
      </div>
    </div>
  </body>`, { url: "https://www.pricerunner.se/watchlist" });
  const product = analyzeDocument(dom.window.document, dom.window.location).entries[0].product;

  assert.equal(product.startPrice, 1655);
  assert.equal(product.currentPrice, 1293);
  assert.equal(product.absoluteSaving, 362);
  assert.ok(Math.abs(product.percentageSaving - 21.87311178247734) < 0.000001);
  assert.equal(product.parserSource, "row-labels");
});

test("table rows keep date years separate from start prices", () => {
  const dom = new JSDOM(`<!doctype html><body>
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
          <tr>
            <td><a href="/produkt/a">Produkt A</a></td>
            <td>16 juli 2026</td>
            <td>1 655 kr</td>
            <td>1 293 kr</td>
            <td>1 283 kr</td>
          </tr>
          <tr>
            <td><a href="/produkt/b">Produkt B</a></td>
            <td>16 juli 2026</td>
            <td>3 275 kr</td>
            <td>3 154 kr</td>
            <td>3 144 kr</td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>`, { url: "https://www.pricerunner.se/profile/alerts" });
  const products = analyzeDocument(dom.window.document, dom.window.location).entries.map(
    ({ product }) => product,
  );

  assert.deepEqual(
    products.map(({ startPrice, currentPrice }) => [startPrice, currentPrice]),
    [
      [1655, 1293],
      [3275, 3154],
    ],
  );
  assert.ok(Math.abs(products[0].percentageSaving - 21.87311178247734) < 0.000001);
  assert.ok(Math.abs(products[1].percentageSaving - 3.6946564885496183) < 0.000001);
  assert.ok(products.every(({ parserSource }) => parserSource === "header-cells"));
});
