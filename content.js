(() => {
  "use strict";

  if (globalThis.__priceSorterExtensionInitialized) return;
  globalThis.__priceSorterExtensionInitialized = true;

  const core = globalThis.PriceRunnerCore;
  const pageParser = globalThis.PriceRunnerPageParser;
  if (!core || !pageParser) throw new Error("PriceRunner parser modules failed to load");

  const BUTTON_ID = "pricesorter-sort-button";
  const CONTROL_CLASS = "pricesorter-control";
  const BUTTON_TEXT = "Sortera efter besparing";
  const GROUP_LABEL_CLASS = "pricesorter-invalid-group-label";
  const SAVINGS_PERCENT_CLASS = "pricesorter-savings-percent";
  const OBSERVER_DEBOUNCE_MS = 250;
  const originalOrder = new WeakMap();
  let nextOriginalIndex = 0;
  let observer = null;
  let observerTimer = null;
  let pageControlEnabled = true;

  // Compatibility wrappers keep existing parser behavior covered while callers
  // migrate to PriceRunnerCore's richer result shape.
  function parsePriceToken(token) {
    const parsed = core.parsePriceToken(token);
    return { value: parsed.value, inactive: parsed.inactive };
  }

  function formatSavingsPercent(startValue, nowValue) {
    const metrics = core.calculateMetrics({ startPrice: startValue, currentPrice: nowValue });
    if (!Number.isFinite(metrics.percentageSaving)) return null;
    if (metrics.percentageSaving >= 0) return `Spar ${metrics.percentageSaving.toFixed(1)}%`;
    return `Ökat ${Math.abs(metrics.percentageSaving).toFixed(1)}%`;
  }

  function analyzePage() {
    const analysis = pageParser.analyzeDocument(document, globalThis.location);
    if (!analysis.supported) return analysis;

    for (const entry of analysis.entries) {
      if (!originalOrder.has(entry.row)) {
        originalOrder.set(entry.row, nextOriginalIndex);
        nextOriginalIndex += 1;
      }
      entry.product.originalIndex = originalOrder.get(entry.row);
    }

    const products = analysis.entries.map(({ product }) => product);
    analysis.summary = core.summarizeProducts(products, {
      supported: true,
      selectorTier: analysis.selectorTier,
    });
    return analysis;
  }

  function publicPageState(analysis = analyzePage()) {
    return {
      supported: analysis.supported,
      reason: analysis.reason,
      selectorName: analysis.selectorName ?? null,
      selectorTier: analysis.selectorTier ?? null,
      summary: analysis.summary,
    };
  }

  function removeInvalidGroupLabels(parent = document) {
    parent.querySelectorAll?.(`.${GROUP_LABEL_CLASS}`).forEach((node) => node.remove());
  }

  function removeSavingsPercent(row) {
    row.querySelectorAll(`.${SAVINGS_PERCENT_CLASS}`).forEach((node) => node.remove());
  }

  function renderSavingsPercent(entry) {
    removeSavingsPercent(entry.row);
    const label = formatSavingsPercent(entry.product.startPrice, entry.product.currentPrice);
    if (!label) return;

    const badge = document.createElement("span");
    badge.className = SAVINGS_PERCENT_CLASS;
    badge.setAttribute("data-pricesorter-owned", "true");
    badge.setAttribute("data-start-price", String(entry.product.startPrice));
    badge.setAttribute("data-current-price", String(entry.product.currentPrice));
    badge.setAttribute(
      "aria-label",
      `${label}. Beräknat från ${entry.product.startPrice} kr till ${entry.product.currentPrice} kr.`,
    );
    badge.title = `Beräknat från ${entry.product.startPrice} kr till ${entry.product.currentPrice} kr`;
    badge.textContent = ` (${label})`;
    entry.row.appendChild(badge);
  }

  function validateRowBlock(parent, entries) {
    if (!entries.length || !entries.every(({ row }) => row.parentElement === parent)) return null;
    const children = Array.from(parent.children);
    const indexes = entries.map(({ row }) => children.indexOf(row)).sort((left, right) => left - right);
    if (indexes.some((index) => index < 0)) return null;
    const contiguous = indexes.every((index, position) => index === indexes[0] + position);
    return contiguous ? { children, firstIndex: indexes[0], lastIndex: indexes.at(-1) } : null;
  }

  function createInvalidGroupLabel(count) {
    const label = document.createElement("div");
    label.className = GROUP_LABEL_CLASS;
    label.setAttribute("data-pricesorter-owned", "true");
    label.setAttribute("role", "separator");
    label.textContent = `Otillgängliga eller oläsbara (${count})`;
    return label;
  }

  function applySort(mode = core.SORT_MODES.ABSOLUTE_SAVING) {
    const analysis = analyzePage();
    if (!analysis.supported) {
      return { applied: false, changed: false, sortableCount: 0, invalidCount: 0, mode, ...publicPageState(analysis) };
    }

    removeInvalidGroupLabels(analysis.container);
    const rowBlock = validateRowBlock(analysis.container, analysis.entries);
    if (!rowBlock) {
      return {
        applied: false,
        changed: false,
        sortableCount: 0,
        invalidCount: 0,
        mode,
        reason: "unsafe-row-layout",
        ...publicPageState(analysis),
      };
    }

    let validEntries;
    let invalidEntries;
    if (mode === core.SORT_MODES.ORIGINAL) {
      validEntries = [...analysis.entries].sort((left, right) => left.product.originalIndex - right.product.originalIndex);
      invalidEntries = [];
    } else {
      const grouped = core.groupInvalidRows(
        analysis.entries.map(({ product }) => product),
        mode,
      );
      const validProducts = new Set(grouped.valid);
      validEntries = analysis.entries
        .filter(({ product }) => validProducts.has(product))
        .sort((left, right) => core.compareProducts(mode)(left.product, right.product));
      invalidEntries = analysis.entries
        .filter(({ product }) => !validProducts.has(product))
        .sort((left, right) => left.product.originalIndex - right.product.originalIndex);
    }

    const orderedEntries = [...validEntries, ...invalidEntries];
    const changed = orderedEntries.some((entry, index) => entry !== analysis.entries[index]);
    const marker = document.createComment("pricesorter-end-marker");
    analysis.container.insertBefore(marker, rowBlock.children[rowBlock.lastIndex + 1] ?? null);
    for (const entry of validEntries) analysis.container.insertBefore(entry.row, marker);
    if (invalidEntries.length) {
      analysis.container.insertBefore(createInvalidGroupLabel(invalidEntries.length), marker);
      for (const entry of invalidEntries) analysis.container.insertBefore(entry.row, marker);
    }
    marker.remove();
    analysis.entries.forEach(renderSavingsPercent);

    chrome?.storage?.local?.set?.({ sortMode: mode });
    return {
      applied: true,
      changed,
      sortableCount: validEntries.length,
      invalidCount: invalidEntries.length,
      mode,
      ...publicPageState(analyzePage()),
    };
  }

  function exportCsv() {
    const analysis = analyzePage();
    if (!analysis.supported || !analysis.entries.length) {
      return { exported: false, count: 0, ...publicPageState(analysis) };
    }

    const capturedAt = new Date().toISOString();
    const csv = core.generateCsv(
      analysis.entries.map(({ product }) => ({ ...product, captureTime: capturedAt })),
      capturedAt,
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pricerunner-watchlist-${capturedAt.slice(0, 10)}.csv`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { exported: true, count: analysis.entries.length, ...publicPageState(analysis) };
  }

  function handleSortClick(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const result = applySort(core.SORT_MODES.ABSOLUTE_SAVING);
    if (!button) return;

    button.classList.add("pricesorter-flash");
    if (!result.applied) button.textContent = "Sortering inte tillgänglig";
    else if (!result.changed) button.textContent = "Ingen ordningsändring";
    else button.textContent = "Sorterat efter besparing";

    window.setTimeout(() => {
      button.classList.remove("pricesorter-flash");
      button.textContent = BUTTON_TEXT;
    }, 1400);
  }

  function removeSortControl() {
    const button = document.getElementById(BUTTON_ID);
    const control = button?.closest(`.${CONTROL_CLASS}`);
    (control ?? button)?.remove();
  }

  function ensureSortButton(anchor = null) {
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;

    const control = document.createElement("div");
    control.className = CONTROL_CLASS;
    control.setAttribute("data-pricesorter-owned", "true");
    control.setAttribute("data-pricesorter-control", "true");
    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.setAttribute("data-pricesorter-owned", "true");
    button.setAttribute("aria-label", "PriceRunner Extension: sortera bevakningar efter besparing");
    button.textContent = BUTTON_TEXT;
    button.addEventListener("click", handleSortClick);
    control.appendChild(button);
    if (anchor?.parentElement) anchor.parentElement.insertBefore(control, anchor);
    else document.body.appendChild(control);
    return button;
  }

  function refreshAvailability() {
    const analysis = analyzePage();
    if (analysis.supported && pageControlEnabled) ensureSortButton(analysis.container);
    else removeSortControl();
    return analysis;
  }

  function setPageControl(enabled) {
    pageControlEnabled = enabled !== false;
    refreshAvailability();
    return pageControlEnabled;
  }

  async function loadPreferences() {
    if (!chrome?.storage?.local?.get) return;
    try {
      const preferences = await chrome.storage.local.get({ showPageControl: true });
      setPageControl(preferences.showPageControl);
    } catch (_error) {
      // Default remains enabled when storage is unavailable.
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(observerTimer);
    observerTimer = window.setTimeout(refreshAvailability, OBSERVER_DEBOUNCE_MS);
  }

  function startObserver() {
    if (observer) return observer;
    observer = new MutationObserver((mutations) => {
      if (!document.getElementById(BUTTON_ID)) {
        scheduleRefresh();
        return;
      }
      const siteMutation = mutations.some((mutation) =>
        [...mutation.addedNodes, ...mutation.removedNodes].some(
          (node) => node.nodeType !== Node.ELEMENT_NODE || !node.matches?.("[data-pricesorter-owned]"),
        ),
      );
      if (siteMutation) scheduleRefresh();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return observer;
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    window.clearTimeout(observerTimer);
    observerTimer = null;
  }

  function init() {
    refreshAvailability();
    startObserver();
    loadPreferences();
  }

  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message?.type) return false;
      if (message.type === "PRICESORTER_GET_STATE") {
        sendResponse({ ok: true, ...publicPageState() });
        return false;
      }
      if (message.type === "PRICESORTER_SORT" || message.type === "PRICESORTER_SORT_NOW") {
        const mode = message.mode ?? core.SORT_MODES.ABSOLUTE_SAVING;
        sendResponse({ ok: true, ...applySort(mode) });
        return false;
      }
      if (message.type === "PRICESORTER_EXPORT_CSV") {
        sendResponse({ ok: true, ...exportCsv() });
        return false;
      }
      if (message.type === "PRICESORTER_SET_PAGE_CONTROL") {
        sendResponse({ ok: true, enabled: setPageControl(message.enabled) });
        return false;
      }
      return false;
    });
  }

  const api = Object.freeze({
    analyzePage,
    applySort,
    ensureSortButton,
    exportCsv,
    formatSavingsPercent,
    init,
    parsePriceToken,
    refreshAvailability,
    setPageControl,
    startObserver,
    stopObserver,
  });
  globalThis.PriceRunnerContent = api;

  if (!globalThis.__PRICESORTER_DISABLE_AUTO_INIT__) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }
})();
