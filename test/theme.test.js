"use strict";

const assert = require("node:assert/strict");
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
