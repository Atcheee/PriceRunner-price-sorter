"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SORT_MODES,
  calculateMetrics,
  compareProducts,
  generateCsv,
  groupInvalidRows,
  parsePriceToken,
  parseProductRow,
  summarizeProducts,
} = require("../core.js");

test("parsePriceToken handles Nordic separators, decimals, suffixes, and dashes", () => {
  const readableCases = [
    ["1 299 kr", 1299],
    ["1\u00a0299 kr", 1299],
    ["1\u202f299,50 SEK", 1299.5],
    ["12.345,50 DKK", 12345.5],
    ["12,345.50 NOK", 12345.5],
    ["799,95 kr", 799.95],
    ["799.95 kr", 799.95],
  ];

  for (const [token, value] of readableCases) {
    assert.equal(parsePriceToken(token).value, value, token);
    assert.equal(parsePriceToken(token).readable, true, token);
  }

  for (const token of ["-", "–", "—", "−", ""]) {
    assert.deepEqual(
      parsePriceToken(token),
      { value: null, inactive: true, readable: false, reason: "missing" },
      token,
    );
  }
});

test("parseProductRow derives savings and explicit stock state", () => {
  const product = parseProductRow({
    name: "  Testprodukt ",
    url: "https://www.pricerunner.se/pl/1-2/Testprodukt",
    startPriceText: "2 000 kr",
    currentPriceText: "1 500 kr",
    unitPriceText: "75 kr",
    stockText: "I lager",
    originalIndex: 3,
    parserSource: "header-cells",
  });

  assert.equal(product.name, "Testprodukt");
  assert.equal(product.startPrice, 2000);
  assert.equal(product.currentPrice, 1500);
  assert.equal(product.absoluteSaving, 500);
  assert.equal(product.percentageSaving, 25);
  assert.equal(product.unitPrice, 75);
  assert.equal(product.stockState, "available");
  assert.equal(product.originalIndex, 3);
});

test("parseProductRow calculates the reported 5 658 kr to 4 999 kr regression", () => {
  const product = parseProductRow({
    name: "Regression product",
    url: "https://www.pricerunner.se/pl/1",
    startPriceText: "Startpris: 5 658kr",
    currentPriceText: "Pris nu: 4 999kr",
    stockText: "I lager",
  });

  assert.equal(product.startPrice, 5658);
  assert.equal(product.currentPrice, 4999);
  assert.equal(product.absoluteSaving, 659);
  assert.ok(Math.abs(product.percentageSaving - 11.647225167903853) < 0.000001);
});

test("parsePriceToken rejects unrelated numbers embedded in non-price text", () => {
  assert.equal(parsePriceToken("0 butiker, pris saknas").readable, false);
  assert.equal(parsePriceToken("Modell 2026").readable, false);
  assert.equal(parsePriceToken("0 butiker, Pris nu: 4 999 kr").value, 4999);
  assert.equal(parsePriceToken("5658").value, 5658);
});

test("calculateMetrics rejects percentage when starting price is zero", () => {
  assert.deepEqual(calculateMetrics({ startPrice: 0, currentPrice: 0 }), {
    startPrice: 0,
    currentPrice: 0,
    unitPrice: null,
    absoluteSaving: null,
    percentageSaving: null,
  });
});

test("compareProducts keeps ties stable and puts unavailable rows last", () => {
  const products = [
    { name: "A", absoluteSaving: 100, stockState: "available", originalIndex: 0 },
    { name: "B", absoluteSaving: 300, stockState: "available", originalIndex: 1 },
    { name: "C", absoluteSaving: 100, stockState: "available", originalIndex: 2 },
    { name: "D", absoluteSaving: 900, stockState: "unavailable", originalIndex: 3 },
  ];

  assert.deepEqual(
    [...products].sort(compareProducts(SORT_MODES.ABSOLUTE_SAVING)).map(({ name }) => name),
    ["B", "A", "C", "D"],
  );
});

test("compareProducts percentage mode prefers higher discount over higher kr saving", () => {
  const products = [
    { name: "bigKr", absoluteSaving: 1000, percentageSaving: 10, stockState: "available", originalIndex: 0 },
    { name: "bigPct", absoluteSaving: 500, percentageSaving: 50, stockState: "available", originalIndex: 1 },
  ];

  assert.deepEqual(
    [...products].sort(compareProducts(SORT_MODES.ABSOLUTE_SAVING)).map(({ name }) => name),
    ["bigKr", "bigPct"],
  );
  assert.deepEqual(
    [...products].sort(compareProducts(SORT_MODES.PERCENTAGE_SAVING)).map(({ name }) => name),
    ["bigPct", "bigKr"],
  );
});

test("current and unit price modes sort low-to-high", () => {
  const products = [
    { name: "A", currentPrice: 200, unitPrice: 20, stockState: "available", originalIndex: 0 },
    { name: "B", currentPrice: 100, unitPrice: 30, stockState: "available", originalIndex: 1 },
  ];

  assert.deepEqual(
    [...products].sort(compareProducts(SORT_MODES.CURRENT_PRICE)).map(({ name }) => name),
    ["B", "A"],
  );
  assert.deepEqual(
    [...products].sort(compareProducts(SORT_MODES.UNIT_PRICE)).map(({ name }) => name),
    ["A", "B"],
  );
});

test("groupInvalidRows preserves invalid-row order", () => {
  const products = [
    { name: "valid", currentPrice: 10, stockState: "available" },
    { name: "missing", currentPrice: null, stockState: "unknown" },
    { name: "unavailable", currentPrice: 5, stockState: "unavailable" },
  ];
  const grouped = groupInvalidRows(products, SORT_MODES.CURRENT_PRICE);

  assert.deepEqual(grouped.valid.map(({ name }) => name), ["valid"]);
  assert.deepEqual(grouped.invalid.map(({ name }) => name), ["missing", "unavailable"]);
});

test("summary exposes partial and all-unavailable parser-health states", () => {
  const partial = summarizeProducts(
    [
      { currentPrice: 100, stockState: "available", absoluteSaving: 25, warnings: [] },
      { currentPrice: null, stockState: "unknown", absoluteSaving: null, warnings: ["price"] },
    ],
    { supported: true, selectorTier: "fallback" },
  );
  assert.equal(partial.state, "partial");
  assert.equal(partial.largestSaving, 25);
  assert.equal(partial.staleParserWarning, true);

  const unavailable = summarizeProducts(
    [{ currentPrice: null, stockState: "unavailable", warnings: [] }],
    { supported: true, selectorTier: "stable" },
  );
  assert.equal(unavailable.state, "all-unavailable");
});

test("CSV includes required columns, UTF-8 BOM, quotes, and formula protection", () => {
  const csv = generateCsv(
    [
      {
        name: '=HYPERLINK("https://bad.invalid")',
        url: "https://www.pricerunner.se/product/a",
        startPrice: 1000,
        currentPrice: 750,
        absoluteSaving: 250,
        percentageSaving: 25,
        stockState: "available",
      },
    ],
    "2026-07-16T12:00:00.000Z",
  );

  assert.equal(csv.startsWith("\uFEFFproduct_name,url,"), true);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/bad\.invalid""\)"/);
  assert.match(csv, /,1000,750,250,25,available,2026-07-16T12:00:00\.000Z$/);
});
