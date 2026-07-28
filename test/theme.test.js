"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

test("theme helpers normalize modes and resolve dark preference", async () => {
  const themeUrl = pathToFileURL(path.join(__dirname, "..", "src", "theme.js")).href;
  const {
    THEME_MODES,
    normalizeTheme,
    resolveIsDark,
  } = await import(themeUrl);

  assert.equal(normalizeTheme("light"), THEME_MODES.LIGHT);
  assert.equal(normalizeTheme("dark"), THEME_MODES.DARK);
  assert.equal(normalizeTheme("system"), THEME_MODES.SYSTEM);
  assert.equal(normalizeTheme("nope"), THEME_MODES.SYSTEM);

  assert.equal(resolveIsDark(THEME_MODES.LIGHT), false);
  assert.equal(resolveIsDark(THEME_MODES.DARK), true);
});

test("dark page theme preserves opaque PriceRunner search surfaces", () => {
  const stylesheet = fs.readFileSync(
    path.join(__dirname, "..", "src", "content.css"),
    "utf8",
  );

  assert.match(stylesheet, /form:has\(#search\)[\s\S]*span:has\(> #search\)/);
  assert.match(
    stylesheet,
    /form:has\(#search\)[\s\S]*> div:has\(a\[href\*="\/results"\]/,
  );
  assert.match(stylesheet, /background-color: #18181d !important/);
});

test("dark page theme uses PriceRunner tokens instead of flattening host components", () => {
  const stylesheet = fs.readFileSync(
    path.join(__dirname, "..", "src", "content.css"),
    "utf8",
  );

  assert.match(stylesheet, /--header-logo: #fafafa !important/);
  assert.match(stylesheet, /--header-background: #101014 !important/);
  assert.match(stylesheet, /--background-page: #101014 !important/);
  assert.match(stylesheet, /--background-primary: #18181d !important/);
  assert.match(stylesheet, /--colors-bg-plain: #18181d !important/);
  assert.match(stylesheet, /--grayscale10: #202027 !important/);
  assert.match(stylesheet, /--grayscale100: #fafafa !important/);
  assert.match(stylesheet, /--primary-action-base: #fafafa !important/);
  assert.match(stylesheet, /--link-primary: #f4f4f5 !important/);
  assert.match(stylesheet, /--text-on-background: #fafafa !important/);
  assert.match(stylesheet, /--footer-heading: #fafafa !important/);
  assert.match(stylesheet, /--footer-top-content-text: #e4e4e7 !important/);
  assert.match(stylesheet, /--colors-bg-positive-subtle: #02351f !important/);
  assert.match(stylesheet, /--colors-badge-pop: #5a6f1a !important/);
  assert.match(stylesheet, /--colors-text-default: #f4f4f5 !important/);
  assert.match(stylesheet, /--text-content-primary: #f4f4f5 !important/);
  assert.match(stylesheet, /--text-primary: #f4f4f5 !important/);
  assert.match(stylesheet, /--brand: #d4c4fc !important/);
  assert.match(stylesheet, /--brand60: #d4c4fc !important/);
  assert.match(stylesheet, /--background-inverse: #27272a !important/);
  assert.match(stylesheet, /--text-inverse: #fafafa !important/);
  assert.match(stylesheet, /Selector-button/);
  assert.match(stylesheet, /input:checked \+ \[class\*="Selector-button"\]/);
  assert.match(stylesheet, /\.klarna-ui-DEFAULT-light/);
  assert.match(stylesheet, /\[class\*="Card-root"\]/);
  assert.match(
    stylesheet,
    /button\[aria-expanded="false"\]:has\(> p\)/,
  );
  assert.doesNotMatch(stylesheet, /:where\([\s\S]*\bdiv,\s*[\s\S]*\):not\(\[data-pricesorter-owned\]\)/);
});
