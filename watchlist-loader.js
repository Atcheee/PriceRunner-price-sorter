(() => {
  "use strict";

  // Run before the page creates its observers, in the page's MAIN world.
  // Hidden Chromium tabs may never deliver native intersection callbacks.
  const NativeIntersectionObserver = globalThis.IntersectionObserver;
  if (!NativeIntersectionObserver) return;
  const observers = new Set();

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
