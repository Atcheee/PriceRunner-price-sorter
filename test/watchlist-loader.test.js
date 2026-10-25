"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync(path.join(__dirname, "..", "watchlist-loader.js"), "utf8");

function createLoaderDom({ pausedScheduler = false } = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <div><div><table><tbody><tr><td><a href="/a">A</a></td></tr></tbody></table></div><div id="sentinel"></div></div>
    <div id="advert"></div>
  </body>`, { runScripts: "outside-only", url: "https://www.pricerunner.se/profile/alerts" });
  const nativeCalls = [];
  const scheduledTimers = new Map();
  const scheduledFrames = new Map();
  let time = 0;
  let nextId = 0;
  if (pausedScheduler) {
    dom.window.performance.now = () => time;
    dom.window.setTimeout = (callback) => {
      const id = ++nextId;
      scheduledTimers.set(id, callback);
      return id;
    };
    dom.window.clearTimeout = dom.window.clearInterval = (id) => scheduledTimers.delete(id);
    dom.window.requestAnimationFrame = (callback) => {
      const id = ++nextId;
      scheduledFrames.set(id, callback);
      return id;
    };
    dom.window.cancelAnimationFrame = (id) => scheduledFrames.delete(id);
  }
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
  return { dom, list, sentinel, request, nativeCalls, scheduledTimers, scheduledFrames,
    advanceTime(ms) { time += ms; },
  };
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

test("worker ticks advance paused page timers and animation frames while hidden", () => {
  const { dom, request, advanceTime, scheduledTimers, scheduledFrames } = createLoaderDom({ pausedScheduler: true });
  const calls = [];
  dom.window.setTimeout(function (value) {
    assert.equal(this, dom.window);
    calls.push(value);
    dom.window.requestAnimationFrame(() => calls.push("next frame"));
  }, 500, "timer");
  dom.window.requestAnimationFrame((time) => calls.push(time));
  assert.deepEqual(calls, []);
  advanceTime(100);
  request();
  assert.deepEqual(calls, [100]);
  advanceTime(400);
  request();
  assert.deepEqual(calls, [100, "timer"]);
  advanceTime(100);
  request();
  assert.deepEqual(calls, [100, "timer", "next frame"]);
  assert.equal(scheduledTimers.size, 0);
  assert.equal(scheduledFrames.size, 0);
  request();
  assert.deepEqual(calls, [100, "timer", "next frame"]);
  dom.window.close();
});

test("cancelled callbacks stay cancelled and foreground callbacks keep native scheduling", () => {
  const { dom, request, advanceTime, scheduledTimers, scheduledFrames } = createLoaderDom({ pausedScheduler: true });
  const unexpected = () => assert.fail("cancelled or foreground callback must not be pumped");
  dom.window.clearTimeout(dom.window.setTimeout(unexpected, 0));
  dom.window.clearInterval(dom.window.setTimeout(unexpected, 0));
  dom.window.cancelAnimationFrame(dom.window.requestAnimationFrame(unexpected));
  request();
  assert.equal(scheduledTimers.size, 0);
  assert.equal(scheduledFrames.size, 0);

  Object.defineProperty(dom.window.document, "hidden", { configurable: true, value: false });
  dom.window.setTimeout(unexpected, 0);
  dom.window.requestAnimationFrame(unexpected);
  advanceTime(1_000);
  request();
  assert.equal(scheduledTimers.size, 1);
  assert.equal(scheduledFrames.size, 1);
  dom.window.close();
});
