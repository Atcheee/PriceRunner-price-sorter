"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync(path.join(__dirname, "..", "watchlist-loader.js"), "utf8");

function createLoaderDom() {
  const dom = new JSDOM(`<!doctype html><body>
    <div><div><table><tbody><tr><td><a href="/a">A</a></td></tr></tbody></table></div><div id="sentinel"></div></div>
    <div id="advert"></div>
  </body>`, { runScripts: "outside-only", url: "https://www.pricerunner.se/profile/alerts" });
  const nativeCalls = [];
  dom.window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(target) { nativeCalls.push(["observe", target]); }
    unobserve(target) { nativeCalls.push(["unobserve", target]); }
    disconnect() { nativeCalls.push(["disconnect"]); }
  };
  dom.window.eval(source);
  const list = dom.window.document.querySelector("tbody");
  const sentinel = dom.window.document.getElementById("sentinel");
  const request = () => {
    list.removeAttribute("data-pricesorter-load-state");
    list.dispatchEvent(new dom.window.Event("pricesorter:load-next", { bubbles: true }));
    return list.getAttribute("data-pricesorter-load-state");
  };
  return { dom, list, sentinel, request, nativeCalls };
}

test("hidden loading invokes only the watchlist sentinel observer without native callbacks", () => {
  const { dom, sentinel, request, nativeCalls } = createLoaderDom();
  const calls = [];
  const observer = new dom.window.IntersectionObserver((entries, instance) => calls.push({ entries, instance }));
  observer.observe(sentinel);
  const advertObserver = new dom.window.IntersectionObserver(() => assert.fail("must not trigger ads"));
  advertObserver.observe(dom.window.document.getElementById("advert"));

  assert.equal(request(), "pending");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].entries[0].target, sentinel);
  assert.equal(calls[0].entries[0].isIntersecting, true);
  assert.equal(calls[0].instance, observer);
  assert.equal(nativeCalls.length, 2);
  sentinel.remove();
  assert.equal(request(), "complete");
  assert.equal(calls.length, 1);
  dom.window.close();
});

test("foreground tabs and unsupported pages retain native intersection behavior", () => {
  const { dom, sentinel, request } = createLoaderDom();
  let count = 0;
  const observer = new dom.window.IntersectionObserver(() => count++);
  observer.observe(sentinel);
  Object.defineProperty(dom.window.document, "hidden", { configurable: true, value: false });
  assert.equal(request(), "pending");
  Object.defineProperty(dom.window.document, "hidden", { configurable: true, value: true });
  dom.reconfigure({ url: "https://www.pricerunner.se/" });
  assert.equal(request(), null);
  assert.equal(count, 0);
  dom.window.close();
});

test("unobserve and disconnect remove fallback targets and preserve native methods", () => {
  const { dom, sentinel, request, nativeCalls } = createLoaderDom();
  const observer = new dom.window.IntersectionObserver(() => assert.fail("removed observer called"));
  observer.observe(sentinel);
  observer.unobserve(sentinel);
  assert.equal(request(), "complete");
  observer.observe(sentinel);
  observer.disconnect();
  assert.equal(request(), "complete");
  assert.deepEqual(nativeCalls.map(([method]) => method), ["observe", "unobserve", "observe", "disconnect"]);
  dom.window.close();
});
