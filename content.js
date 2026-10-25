(() => {
  "use strict";

  if (globalThis.__priceSorterExtensionInitialized) return;
  globalThis.__priceSorterExtensionInitialized = true;

  const core = globalThis.PriceRunnerCore;
  const pageParser = globalThis.PriceRunnerPageParser;
  if (!core || !pageParser) throw new Error("PriceRunner parser modules failed to load");

  const BUTTON_ID = "pricesorter-sort-button";
  const THEME_BUTTON_ID = "pricesorter-theme-button";
  const CONTROL_CLASS = "pricesorter-control";
  const DARK_THEME_CLASS = "pricesorter-dark-theme";
  const THEME_MODES = Object.freeze({
    LIGHT: "light",
    DARK: "dark",
    SYSTEM: "system",
  });
  const BUTTON_TEXT_BY_MODE = Object.freeze({
    [core.SORT_MODES.PERCENTAGE_SAVING]: "Sortera efter rabatt",
    [core.SORT_MODES.ABSOLUTE_SAVING]: "Sortera efter besparing",
  });
  const SORTED_TEXT_BY_MODE = Object.freeze({
    [core.SORT_MODES.PERCENTAGE_SAVING]: "Sorterat efter rabatt",
    [core.SORT_MODES.ABSOLUTE_SAVING]: "Sorterat efter besparing",
  });
  const ARIA_LABEL_BY_MODE = Object.freeze({
    [core.SORT_MODES.PERCENTAGE_SAVING]:
      "PriceRunner Extension: sortera bevakningar efter rabatt",
    [core.SORT_MODES.ABSOLUTE_SAVING]:
      "PriceRunner Extension: sortera bevakningar efter besparing",
  });
  const LOADING_BUTTON_TEXT = "Laddar alla produkter…";
  const GROUP_LABEL_CLASS = "pricesorter-invalid-group-label";
  const SAVINGS_PERCENT_CLASS = "pricesorter-savings-percent";
  const PRICE_DIRECTION = Object.freeze({
    DOWN: "down",
    UP: "up",
    UNCHANGED: "unchanged",
  });
  const OBSERVER_DEBOUNCE_MS = 250;
  const LOAD_ALL_SETTLE_MS = 450;
  const HIDDEN_SCROLL_PHASE_MS = 1_100;
  const LOAD_ALL_MAX_ROUNDS = 50;
  const LOAD_ALL_STABLE_ROUNDS = 3;
  const originalOrder = new WeakMap();
  let nextOriginalIndex = 0;
  let observer = null;
  let observerTimer = null;
  let observerPauseDepth = 0;
  let pageControlEnabled = true;
  let preferredSortMode = core.SORT_MODES.PERCENTAGE_SAVING;
  let activeSortMode = null;
  let lastSortedCount = 0;
  let loadAllInProgress = false;
  let preferredTheme = THEME_MODES.SYSTEM;
  const themeMediaQuery = globalThis.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

  function normalizeSavingSortMode(mode) {
    if (mode === core.SORT_MODES.ABSOLUTE_SAVING) return core.SORT_MODES.ABSOLUTE_SAVING;
    return core.SORT_MODES.PERCENTAGE_SAVING;
  }

  function normalizeTheme(mode) {
    if (mode === THEME_MODES.LIGHT || mode === THEME_MODES.DARK) return mode;
    return THEME_MODES.SYSTEM;
  }

  function resolveIsDark(mode = preferredTheme) {
    const normalized = normalizeTheme(mode);
    if (normalized === THEME_MODES.DARK) return true;
    if (normalized === THEME_MODES.LIGHT) return false;
    return themeMediaQuery?.matches === true;
  }

  function syncThemeButtonLabel() {
    const button = document.getElementById(THEME_BUTTON_ID);
    if (!button) return;
    const isDark = resolveIsDark();
    button.textContent = isDark ? "Ljust läge" : "Mörkt läge";
    button.setAttribute(
      "aria-label",
      isDark
        ? "PriceRunner Extension: stäng av mörkt läge"
        : "PriceRunner Extension: aktivera mörkt läge",
    );
    button.setAttribute("aria-pressed", String(isDark));
  }

  function applyPageTheme(mode) {
    preferredTheme = normalizeTheme(mode);
    const isDark = resolveIsDark(preferredTheme);
    const root = document.documentElement;
    root.classList.toggle(DARK_THEME_CLASS, isDark);
    root.dataset.pricesorterTheme = isDark ? THEME_MODES.DARK : THEME_MODES.LIGHT;
    root.style.colorScheme = isDark ? "dark" : "light";
    syncThemeButtonLabel();
    return { mode: preferredTheme, isDark };
  }

  async function togglePageTheme() {
    const nextTheme = resolveIsDark() ? THEME_MODES.LIGHT : THEME_MODES.DARK;
    const result = applyPageTheme(nextTheme);
    try {
      await chrome?.storage?.local?.set?.({ theme: nextTheme });
    } catch (_error) {
      // Theme still applies for the current page when persistence is unavailable.
    }
    return result;
  }

  function buttonTextForMode(mode = preferredSortMode) {
    return BUTTON_TEXT_BY_MODE[normalizeSavingSortMode(mode)];
  }

  function sortedTextForMode(mode = preferredSortMode) {
    return SORTED_TEXT_BY_MODE[normalizeSavingSortMode(mode)];
  }

  function ariaLabelForMode(mode = preferredSortMode) {
    return ARIA_LABEL_BY_MODE[normalizeSavingSortMode(mode)];
  }

  function syncSortButtonLabel(mode = preferredSortMode) {
    const button = document.getElementById(BUTTON_ID);
    if (!button || button.disabled) return;
    button.textContent = buttonTextForMode(mode);
    button.setAttribute("aria-label", ariaLabelForMode(mode));
  }

  function pauseObserver() {
    observerPauseDepth += 1;
    if (observerPauseDepth > 1) return;
    observer?.disconnect();
    window.clearTimeout(observerTimer);
    observerTimer = null;
  }

  function resumeObserver() {
    if (observerPauseDepth > 0) observerPauseDepth -= 1;
    if (observerPauseDepth > 0 || !observer) return;
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Compatibility wrappers keep existing parser behavior covered while callers
  // migrate to PriceRunnerCore's richer result shape.
  function parsePriceToken(token) {
    const parsed = core.parsePriceToken(token);
    return { value: parsed.value, inactive: parsed.inactive };
  }

  function formatKrAmount(value) {
    const amount = Math.round(Math.abs(value));
    return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  }

  function formatSavingsPercent(startValue, nowValue) {
    const metrics = core.calculateMetrics({ startPrice: startValue, currentPrice: nowValue });
    if (!Number.isFinite(metrics.absoluteSaving)) return null;
    const amountText = formatKrAmount(metrics.absoluteSaving);
    const percent = Number.isFinite(metrics.percentageSaving)
      ? `, ${Math.abs(metrics.percentageSaving).toFixed(1)}%`
      : "";
    if (metrics.absoluteSaving >= 0) return `Spar ${amountText} kr${percent}`;
    return `Ökat ${amountText} kr${percent}`;
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

  // Table rows may only contain td/th. Appending a span to <tr> gets foster-parented
  // outside the table in real browsers, so the badge never appears in the list.
  function savingsAnchor(row) {
    const cell = Array.from(row.children).find(
      (element) =>
        element.tagName === "TD" ||
        element.tagName === "TH" ||
        element.getAttribute?.("role") === "cell" ||
        element.getAttribute?.("role") === "gridcell",
    );
    // Prefer a cell for tables/grids; otherwise keep the badge as a row sibling
    // of the product link so link textContent stays clean.
    return cell ?? row;
  }

  function renderSavingsPercent(entry) {
    removeSavingsPercent(entry.row);
    const label = formatSavingsPercent(entry.product.startPrice, entry.product.currentPrice);
    if (!label) return;

    const direction =
      entry.product.currentPrice > entry.product.startPrice
        ? PRICE_DIRECTION.UP
        : entry.product.currentPrice < entry.product.startPrice
          ? PRICE_DIRECTION.DOWN
          : PRICE_DIRECTION.UNCHANGED;

    const badge = document.createElement("span");
    badge.className = `${SAVINGS_PERCENT_CLASS} ${SAVINGS_PERCENT_CLASS}--${direction}`;
    badge.setAttribute("data-pricesorter-owned", "true");
    badge.setAttribute("data-price-direction", direction);
    badge.setAttribute("data-pricesorter-start", String(entry.product.startPrice));
    badge.setAttribute("data-pricesorter-current", String(entry.product.currentPrice));
    badge.setAttribute(
      "aria-label",
      `${label}. Beräknat från ${entry.product.startPrice} kr till ${entry.product.currentPrice} kr.`,
    );
    badge.title = `Beräknat från ${entry.product.startPrice} kr till ${entry.product.currentPrice} kr`;
    badge.textContent = label;
    savingsAnchor(entry.row).appendChild(badge);
  }

  function validateRowBlock(parent, entries) {
    if (!entries.length || !entries.every(({ row }) => row.parentElement === parent)) return null;
    const children = Array.from(parent.children);
    const indexes = entries.map(({ row }) => children.indexOf(row)).sort((left, right) => left - right);
    if (indexes.some((index) => index < 0)) return null;
    // Separators/ads between product rows are fine; sort still moves only product rows.
    return { children, firstIndex: indexes[0], lastIndex: indexes.at(-1) };
  }

  function createInvalidGroupLabel(count) {
    const label = document.createElement("div");
    label.className = GROUP_LABEL_CLASS;
    label.setAttribute("data-pricesorter-owned", "true");
    label.setAttribute("role", "separator");
    label.textContent = `Otillgängliga eller oläsbara (${count})`;
    return label;
  }

  function pageTimerSleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function sleep(ms) {
    // Timers owned by a web page are heavily throttled after its tab becomes
    // hidden. Ask the extension service worker to own this delay so loading and
    // sorting can keep advancing while the user works in another tab.
    if (!chrome?.runtime?.sendMessage) return pageTimerSleep(ms);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "PRICESORTER_DELAY",
        delayMs: ms,
      });
      if (response?.ok) return;
    } catch (_error) {
      // Tests, extension reloads, and browser shutdown can remove the worker.
    }
    await pageTimerSleep(ms);
  }

  function findScrollParent(element) {
    let node = element;
    while (node && node !== document.documentElement && node !== document.body) {
      const style = window.getComputedStyle?.(node);
      const overflowY = style?.overflowY ?? "";
      const canScroll =
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        node.scrollHeight > node.clientHeight + 1;
      if (canScroll) return node;
      node = node.parentElement;
    }
    return document.scrollingElement ?? document.documentElement;
  }

  function scrollWatchlistTowardEnd(analysis = analyzePage()) {
    const scrollParent = findScrollParent(analysis.container ?? document.body);
    if (
      scrollParent === document.scrollingElement ||
      scrollParent === document.documentElement ||
      scrollParent === document.body
    ) {
      const height = Math.max(
        document.body?.scrollHeight ?? 0,
        document.documentElement?.scrollHeight ?? 0,
      );
      window.scrollTo(0, height);
      return;
    }
    scrollParent.scrollTop = scrollParent.scrollHeight;
  }

  function scrollWatchlistAwayFromEnd(analysis = analyzePage()) {
    const scrollParent = findScrollParent(analysis.container ?? document.body);
    if (
      scrollParent === document.scrollingElement ||
      scrollParent === document.documentElement ||
      scrollParent === document.body
    ) {
      const height = Math.max(
        document.body?.scrollHeight ?? 0,
        document.documentElement?.scrollHeight ?? 0,
      );
      window.scrollTo(0, Math.max(0, height - window.innerHeight * 2));
      return;
    }
    scrollParent.scrollTop = Math.max(0, scrollParent.scrollHeight - scrollParent.clientHeight * 2);
  }

  function productCount() {
    return analyzePage().entries?.length ?? 0;
  }

  function requestWatchlistPage(analysis) {
    const list = analysis.container;
    list.removeAttribute("data-pricesorter-load-state");
    list.dispatchEvent(new Event("pricesorter:load-next", { bubbles: true }));
    const state = list.getAttribute("data-pricesorter-load-state");
    list.removeAttribute("data-pricesorter-load-state");
    // PriceRunner removes the sentinel while fetching and shows skeleton rows.
    const table = list.closest("table");
    const hasPlaceholders = table && [...table.querySelectorAll("tbody tr")].some(
      (row) => !row.querySelector("a[href]"),
    );
    return hasPlaceholders ? "pending" : state;
  }

  // PriceRunner alerts/watchlist pages lazy-load rows on scroll. Sorting only
  // sees rows currently in the DOM, so we force the list to fully hydrate first.
  async function loadAllWatchlistRows(options = {}) {
    const settleMs = options.settleMs ?? LOAD_ALL_SETTLE_MS;
    const maxRounds = options.maxRounds ?? LOAD_ALL_MAX_ROUNDS;
    const configuredStableRounds = options.stableRounds;
    const manageObserver = options.manageObserver !== false;
    if (loadAllInProgress) {
      return { loaded: false, count: productCount(), rounds: 0, reason: "already-loading" };
    }

    loadAllInProgress = true;
    if (manageObserver) pauseObserver();
    let previousCount = -1;
    let stableRounds = 0;
    let rounds = 0;
    let foregroundRounds = 0;
    let nextPagePending = false;
    let hiddenCount = 0;
    const recordProgress = (phase, count, loadState) => {
      if (document.hidden) hiddenCount = count;
      // Local, DOM-only diagnostics: distinguish actual background progress
      // from work that resumes when a person or browser inspector opens the tab.
      document.documentElement.setAttribute("data-pricesorter-load-progress", JSON.stringify({
        phase, count, hiddenCount, hidden: document.hidden, loadState,
        updatedAt: new Date().toISOString(),
      }));
    };

    try {
      while (
        foregroundRounds < maxRounds ||
        (configuredStableRounds === undefined && (document.hidden || nextPagePending))
      ) {
        rounds += 1;
        if (!document.hidden) foregroundRounds += 1;
        const analysis = analyzePage();
        if (!analysis.supported) break;

        const loadState = requestWatchlistPage(analysis);
        nextPagePending = loadState === "pending";

        const count = analysis.entries.length;
        recordProgress("loading", count, loadState);
        if (count === previousCount) {
          const allowHiddenCompletion = loadState === "complete" || configuredStableRounds !== undefined;
          if (nextPagePending || (document.hidden && !allowHiddenCompletion)) {
            stableRounds = 0;
          } else {
            stableRounds += 1;
          }
          const stableRoundsNeeded = configuredStableRounds ?? LOAD_ALL_STABLE_ROUNDS;
          // A quiet hidden tab is complete only when the page-world bridge
          // confirms there is no next-page sentinel or in-flight skeleton row.
          if (
            stableRounds >= stableRoundsNeeded &&
            (allowHiddenCompletion || !document.hidden)
          ) {
            break;
          }
        } else {
          previousCount = count;
          stableRounds = 0;
        }

        if (document.hidden && configuredStableRounds === undefined) {
          // PriceRunner only requests its next 15 rows when a bottom sentinel
          // enters the viewport. Move it out and back in on separate worker-
          // driven tasks so its IntersectionObserver gets a fresh transition.
          scrollWatchlistAwayFromEnd(analysis);
          await sleep(HIDDEN_SCROLL_PHASE_MS);
        }
        scrollWatchlistTowardEnd(analysis);
        await sleep(document.hidden ? HIDDEN_SCROLL_PHASE_MS : settleMs);
      }

      window.scrollTo(0, 0);
      // Let the host page finish reconciling after scroll-to-top before sorting.
      await sleep(settleMs);
      recordProgress("loaded", productCount(), "complete");
      return { loaded: true, count: productCount(), rounds };
    } finally {
      loadAllInProgress = false;
      if (manageObserver) resumeObserver();
    }
  }

  function expectedSortedEntries(analysis, mode) {
    if (mode === core.SORT_MODES.ORIGINAL) {
      return [...analysis.entries].sort(
        (left, right) => left.product.originalIndex - right.product.originalIndex,
      );
    }
    const grouped = core.groupInvalidRows(
      analysis.entries.map(({ product }) => product),
      mode,
    );
    const validProducts = new Set(grouped.valid);
    const validEntries = analysis.entries
      .filter(({ product }) => validProducts.has(product))
      .sort((left, right) => core.compareProducts(mode)(left.product, right.product));
    const invalidEntries = analysis.entries
      .filter(({ product }) => !validProducts.has(product))
      .sort((left, right) => left.product.originalIndex - right.product.originalIndex);
    return [...validEntries, ...invalidEntries];
  }

  function sortIntegrityIntact(analysis, mode) {
    if (!analysis?.supported || !analysis.entries.length) return false;
    if (analysis.entries.length !== lastSortedCount) return false;

    const expected = expectedSortedEntries(analysis, mode);
    if (expected.some((entry, index) => entry.row !== analysis.entries[index].row)) return false;

    return analysis.entries.every((entry) => {
      if (!Number.isFinite(entry.product.absoluteSaving)) return true;
      return Boolean(entry.row.querySelector(`.${SAVINGS_PERCENT_CLASS}`));
    });
  }

  function applySort(mode = core.SORT_MODES.PERCENTAGE_SAVING) {
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
    pauseObserver();
    try {
      const marker = document.createComment("pricesorter-end-marker");
      analysis.container.insertBefore(marker, rowBlock.children[rowBlock.lastIndex + 1] ?? null);
      for (const entry of validEntries) analysis.container.insertBefore(entry.row, marker);
      if (invalidEntries.length) {
        analysis.container.insertBefore(createInvalidGroupLabel(invalidEntries.length), marker);
        for (const entry of invalidEntries) analysis.container.insertBefore(entry.row, marker);
      }
      marker.remove();
      for (const entry of orderedEntries) renderSavingsPercent(entry);
    } finally {
      resumeObserver();
    }

    activeSortMode = mode === core.SORT_MODES.ORIGINAL ? null : mode;
    if (mode === core.SORT_MODES.PERCENTAGE_SAVING || mode === core.SORT_MODES.ABSOLUTE_SAVING) {
      preferredSortMode = mode;
    }
    lastSortedCount = orderedEntries.length;
    chrome?.storage?.local?.set?.({ sortMode: mode === core.SORT_MODES.ORIGINAL ? preferredSortMode : mode });
    syncSortButtonLabel(preferredSortMode);
    return {
      applied: true,
      changed,
      sortableCount: validEntries.length,
      invalidCount: invalidEntries.length,
      mode,
      ...publicPageState(analyzePage()),
    };
  }

  async function sortWithFullList(mode = core.SORT_MODES.PERCENTAGE_SAVING) {
    pauseObserver();
    try {
      const loadResult = await loadAllWatchlistRows({ manageObserver: false });
      // Hold the load gate through sort + settle so host mutations cannot wipe
      // the result before we re-assert integrity.
      loadAllInProgress = true;
      let sortResult = applySort(mode);
      await sleep(LOAD_ALL_SETTLE_MS);
      if (mode !== core.SORT_MODES.ORIGINAL) {
        const analysis = analyzePage();
        if (!sortIntegrityIntact(analysis, mode)) sortResult = applySort(mode);
      }
      return { ...sortResult, loadResult };
    } finally {
      loadAllInProgress = false;
      resumeObserver();
    }
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

  async function exportCsvWithFullList() {
    const loadResult = await loadAllWatchlistRows();
    return { ...exportCsv(), loadResult };
  }

  async function handleSortClick(event) {
    event.preventDefault();
    const button = event.currentTarget;
    if (!button || button.disabled) return;

    const mode = preferredSortMode;
    button.disabled = true;
    button.classList.add("pricesorter-flash");
    button.textContent = LOADING_BUTTON_TEXT;

    let result;
    try {
      result = await sortWithFullList(mode);
    } catch (_error) {
      result = { applied: false, changed: false };
    }

    if (!result.applied) button.textContent = "Sortering inte tillgänglig";
    else if (!result.changed) button.textContent = "Ingen ordningsändring";
    else button.textContent = sortedTextForMode(mode);

    window.setTimeout(() => {
      button.disabled = false;
      button.classList.remove("pricesorter-flash");
      button.textContent = buttonTextForMode(preferredSortMode);
      button.setAttribute("aria-label", ariaLabelForMode(preferredSortMode));
    }, 1400);
  }

  function removePageControl() {
    document.querySelector(`.${CONTROL_CLASS}`)?.remove();
  }

  function ensureThemeControl() {
    let control = document.querySelector(`.${CONTROL_CLASS}`);
    if (!control) {
      control = document.createElement("div");
      control.className = CONTROL_CLASS;
      control.setAttribute("data-pricesorter-owned", "true");
      control.setAttribute("data-pricesorter-control", "true");
      document.body.appendChild(control);
    }

    let themeButton = document.getElementById(THEME_BUTTON_ID);
    if (!themeButton) {
      themeButton = document.createElement("button");
      themeButton.id = THEME_BUTTON_ID;
      themeButton.type = "button";
      themeButton.setAttribute("data-pricesorter-owned", "true");
      themeButton.addEventListener("click", togglePageTheme);
      control.prepend(themeButton);
    }
    syncThemeButtonLabel();
    return control;
  }

  function ensureSortButton() {
    let button = document.getElementById(BUTTON_ID);
    if (button) {
      syncSortButtonLabel(preferredSortMode);
      return button;
    }

    const control = ensureThemeControl();
    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.setAttribute("data-pricesorter-owned", "true");
    button.setAttribute("aria-label", ariaLabelForMode(preferredSortMode));
    button.textContent = buttonTextForMode(preferredSortMode);
    button.addEventListener("click", handleSortClick);
    control.appendChild(button);
    return button;
  }

  function refreshAvailability() {
    const analysis = analyzePage();
    if (!pageControlEnabled) {
      removePageControl();
      return analysis;
    }

    ensureThemeControl();
    if (analysis.supported) ensureSortButton();
    else document.getElementById(BUTTON_ID)?.remove();
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
      const preferences = await chrome.storage.local.get({
        showPageControl: true,
        sortMode: core.SORT_MODES.PERCENTAGE_SAVING,
        theme: THEME_MODES.SYSTEM,
      });
      preferredSortMode = normalizeSavingSortMode(preferences.sortMode);
      applyPageTheme(preferences.theme);
      setPageControl(preferences.showPageControl);
      syncSortButtonLabel(preferredSortMode);
    } catch (_error) {
      // Default remains enabled when storage is unavailable.
    }
  }

  function watchPreferences() {
    if (!chrome?.storage?.onChanged?.addListener) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (Object.hasOwn(changes, "sortMode")) {
        preferredSortMode = normalizeSavingSortMode(changes.sortMode?.newValue);
        syncSortButtonLabel(preferredSortMode);
      }
      if (Object.hasOwn(changes, "showPageControl")) {
        setPageControl(changes.showPageControl?.newValue !== false);
      }
      if (Object.hasOwn(changes, "theme")) {
        applyPageTheme(changes.theme?.newValue);
      }
    });
  }

  function scheduleRefresh() {
    window.clearTimeout(observerTimer);
    observerTimer = window.setTimeout(() => {
      if (loadAllInProgress || observerPauseDepth > 0) return;
      refreshAvailability();
      // Keep sort sticky when the host re-renders or lazy-loads more rows.
      if (!activeSortMode) return;
      const analysis = analyzePage();
      if (sortIntegrityIntact(analysis, activeSortMode)) return;
      applySort(activeSortMode);
    }, OBSERVER_DEBOUNCE_MS);
  }

  function startObserver() {
    if (observer) {
      resumeObserver();
      return observer;
    }
    observer = new MutationObserver((mutations) => {
      if (loadAllInProgress) return;
      if (!document.querySelector(`.${CONTROL_CLASS}`)) {
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
    resumeObserver();
    return observer;
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    window.clearTimeout(observerTimer);
    observerTimer = null;
  }

  function init() {
    themeMediaQuery?.addEventListener?.("change", () => {
      if (preferredTheme === THEME_MODES.SYSTEM) applyPageTheme(preferredTheme);
    });
    refreshAvailability();
    startObserver();
    loadPreferences();
    watchPreferences();
  }

  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message?.type) return false;
      if (message.type === "PRICESORTER_GET_STATE") {
        sendResponse({ ok: true, ...publicPageState() });
        return false;
      }
      if (message.type === "PRICESORTER_SORT" || message.type === "PRICESORTER_SORT_NOW") {
        const mode =
          message.mode === core.SORT_MODES.ORIGINAL
            ? core.SORT_MODES.ORIGINAL
            : normalizeSavingSortMode(message.mode ?? preferredSortMode);
        sortWithFullList(mode)
          .then((result) => sendResponse({ ok: true, ...result }))
          .catch(() => sendResponse({ ok: false, applied: false }));
        return true;
      }
      if (message.type === "PRICESORTER_EXPORT_CSV") {
        exportCsvWithFullList()
          .then((result) => sendResponse({ ok: true, ...result }))
          .catch(() => sendResponse({ ok: false, exported: false }));
        return true;
      }
      if (message.type === "PRICESORTER_SET_PAGE_CONTROL") {
        sendResponse({ ok: true, enabled: setPageControl(message.enabled) });
        return false;
      }
      if (message.type === "PRICESORTER_SET_THEME") {
        sendResponse({ ok: true, ...applyPageTheme(message.theme) });
        return false;
      }
      return false;
    });
  }

  const api = Object.freeze({
    analyzePage,
    applyPageTheme,
    applySort,
    ensureSortButton,
    ensureThemeControl,
    exportCsv,
    exportCsvWithFullList,
    formatSavingsPercent,
    init,
    loadAllWatchlistRows,
    parsePriceToken,
    refreshAvailability,
    setPageControl,
    sortWithFullList,
    startObserver,
    stopObserver,
    togglePageTheme,
  });
  globalThis.PriceRunnerContent = api;

  if (!globalThis.__PRICESORTER_DISABLE_AUTO_INIT__) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }
})();
