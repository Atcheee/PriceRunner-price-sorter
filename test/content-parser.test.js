"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const PriceRunnerCore = require("../core.js");

function loadExistingParser() {
  const contentScriptPath = path.join(__dirname, "..", "content.js");
  const source = fs.readFileSync(contentScriptPath, "utf8");
  const exportHook = [
    "globalThis.__priceSorterTestExports = {",
    "  parsePriceToken,",
    "  formatSavingsPercent",
    "};",
    "})();",
  ].join("\n");
  const instrumented = source.replace(/\}\)\(\);\s*$/, exportHook);

  assert.notEqual(instrumented, source, "content script test export hook was not inserted");

  const sandbox = {
    __PRICESORTER_DISABLE_AUTO_INIT__: true,
    chrome: {},
    document: {
      addEventListener() {},
      readyState: "loading",
    },
    PriceRunnerCore,
    PriceRunnerPageParser: {},
    window: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(instrumented, sandbox, { filename: contentScriptPath });
  return sandbox.__priceSorterTestExports;
}

const { parsePriceToken, formatSavingsPercent } = loadExistingParser();

test("parsePriceToken handles current Swedish price formats", () => {
  const cases = [
    ["1 299 kr", 1299],
    ["1\u00a0299 kr", 1299],
    ["12 345,50 kr", 12345.5],
    ["799.95 kr", 799.95],
    ["  249 kr  ", 249],
  ];

  for (const [token, expected] of cases) {
    assert.deepEqual(
      { ...parsePriceToken(token) },
      { value: expected, inactive: false },
      token,
    );
  }
});

test("parsePriceToken treats current missing-value markers as inactive", () => {
  assert.deepEqual({ ...parsePriceToken("-") }, { value: null, inactive: true });
  assert.deepEqual({ ...parsePriceToken("") }, { value: null, inactive: true });
});

test("parsePriceToken distinguishes unreadable text from inactive values", () => {
  assert.deepEqual(
    { ...parsePriceToken("Pris saknas") },
    { value: null, inactive: false },
  );
});

test("existing savings percentage copy describes decreases and increases", () => {
  assert.equal(formatSavingsPercent(1000, 750), "Spar 250 kr, 25.0%");
  assert.equal(formatSavingsPercent(5658, 4999), "Spar 659 kr, 11.6%");
  assert.equal(formatSavingsPercent(1000, 1250), "Ökat 250 kr, 25.0%");
  assert.equal(formatSavingsPercent(0, 0), null);
});
