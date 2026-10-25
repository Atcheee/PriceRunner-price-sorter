(() => {
  "use strict";

  // Run before the page creates its observers, in the page's MAIN world.
  // Hidden Chromium tabs may never deliver native intersection callbacks.
  const NativeIntersectionObserver = globalThis.IntersectionObserver;
  if (!NativeIntersectionObserver) return;
  const observers = new Set();
  const timers = new Map();
  const frames = new Map();
  const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
  const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const nativeClearInterval = globalThis.clearInterval.bind(globalThis);
  const nativeRequestAnimationFrame = globalThis.requestAnimationFrame?.bind(globalThis);
  const nativeCancelAnimationFrame = globalThis.cancelAnimationFrame?.bind(globalThis);

  // Keep native scheduling normally. A load-next message from the extension's
  // worker is also a clock tick for callbacks that Brave has stopped delivering.
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (typeof callback !== "function") return nativeSetTimeout(callback, delay, ...args);
    const id = nativeSetTimeout(() => {
      timers.delete(id);
      callback.apply(globalThis, args);
    }, delay);
    timers.set(id, { callback, args, due: performance.now() + Math.max(0, Number(delay) || 0) });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
    nativeClearTimeout(id);
  };
  globalThis.clearInterval = (id) => {
    timers.delete(id);
    nativeClearInterval(id);
  };

  if (nativeRequestAnimationFrame && nativeCancelAnimationFrame) {
    globalThis.requestAnimationFrame = (callback) => {
      if (typeof callback !== "function") return nativeRequestAnimationFrame(callback);
      const id = nativeRequestAnimationFrame((time) => {
        frames.delete(id);
        callback.call(globalThis, time);
      });
      frames.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id) => {
      frames.delete(id);
      nativeCancelAnimationFrame(id);
    };
  }

  function advanceHiddenCallbacks() {
    if (!document.hidden) return;
    // Snapshot first: callbacks queued by these callbacks belong to the next
    // worker tick, and cancellation during this tick must still be respected.
    const time = performance.now();
    const dueTimers = [...timers].filter(([, timer]) => timer.due <= time);
    const dueFrames = [...frames];
    for (const [id, timer] of dueTimers) {
      if (!timers.has(id)) continue;
      timers.delete(id);
      nativeClearTimeout(id);
      try {
        timer.callback.apply(globalThis, timer.args);
      } catch (error) {
        globalThis.reportError?.(error);
      }
    }
    for (const [id, callback] of dueFrames) {
      if (!frames.has(id)) continue;
      frames.delete(id);
      nativeCancelAnimationFrame(id);
      try {
        callback.call(globalThis, time);
      } catch (error) {
        globalThis.reportError?.(error);
      }
    }
  }

  globalThis.IntersectionObserver = class extends NativeIntersectionObserver {
    constructor(callback, options) {
      super(callback, options);
      this.priceSorterCallback = callback;
      this.priceSorterTargets = new Set();
    }

    observe(target) {
      super.observe(target);
      this.priceSorterTargets.add(target);
      observers.add(this);
    }

    unobserve(target) {
      super.unobserve(target);
      this.priceSorterTargets.delete(target);
      if (!this.priceSorterTargets.size) observers.delete(this);
    }

    disconnect() {
      super.disconnect();
      this.priceSorterTargets.clear();
      observers.delete(this);
    }
  };

  document.addEventListener("pricesorter:load-next", (event) => {
    if (!/\/(?:profile\/alerts|watchlist)\/?$/i.test(location.pathname)) return;
    const list = event.target;
    if (!(list instanceof Element)) return;
    advanceHiddenCallbacks();
    const anchor = list.closest("table") ?? list;
    let pending = false;

    for (const observer of [...observers]) {
      const entries = [];
      for (const target of observer.priceSorterTargets) {
        if (!target.isConnected) continue;
        // Only the list's loading sentinel, never ads, images, or page sections.
        if (target !== anchor.nextElementSibling && target !== anchor.parentElement?.nextElementSibling) continue;
        pending = true;
        const rect = target.getBoundingClientRect();
        entries.push({
          target,
          time: performance.now(),
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: rect,
          intersectionRect: rect,
          rootBounds: observer.root?.getBoundingClientRect() ?? document.documentElement.getBoundingClientRect(),
        });
      }
      if (document.hidden && entries.length) observer.priceSorterCallback(entries, observer);
    }

    list.setAttribute("data-pricesorter-load-state", pending ? "pending" : "complete");
  });
})();
