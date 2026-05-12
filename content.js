(() => {
  "use strict";

  if (window.__priceSorterExtensionInitialized) {
    return;
  }
  window.__priceSorterExtensionInitialized = true;

  const BUTTON_ID = "pricesorter-sort-button";
  const BUTTON_TEXT = "Sortera efter besparing";
  const SAVINGS_PERCENT_CLASS = "pricesorter-savings-percent";
  const CONTAINER_SELECTORS = [
    "div.pr-16fbr99",
    "div[data-cursor-element-id='cursor-el-1']",
    "div#content-below-header"
  ];
  const PRICE_TOKEN_REGEX = /(?:(?:\d{1,3}(?:[\s\u00a0]\d{3})+|\d+)(?:[.,]\d+)?\s*kr|-)/gi;

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function parsePriceToken(token) {
    const normalized = normalizeText(token).toLowerCase().replace(/\u00a0/g, " ");
    if (!normalized) return { value: null, inactive: true };
    if (normalized === "-") return { value: null, inactive: true };

    const numericPart = normalized.replace("kr", "").trim();
    const numericMatch =
      numericPart.match(/-?\d{1,3}(?:\s\d{3})+(?:[.,]\d+)?/) ||
      numericPart.match(/-?\d+(?:[.,]\d+)?/);
    if (!numericMatch) {
      return { value: null, inactive: false };
    }

    const numeric = numericMatch[0].replace(/\s+/g, "").replace(",", ".");

    if (!numeric || numeric === "-" || numeric === ".") {
      return { value: null, inactive: true };
    }

    const value = Number.parseFloat(numeric);
    if (Number.isNaN(value)) {
      return { value: null, inactive: false };
    }
    return { value, inactive: false };
  }

  function parseFirstPriceTokenFromText(text) {
    const tokens = normalizeText(text).match(PRICE_TOKEN_REGEX) || [];
    if (!tokens.length) return { value: null, inactive: true };
    return parsePriceToken(tokens[0]);
  }

  function getPriceTokensFromNode(root) {
    if (!root) return [];
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      textNodes.push(current.textContent || "");
      current = walker.nextNode();
    }

    const tokenRegex = new RegExp(PRICE_TOKEN_REGEX.source, "gi");
    return textNodes.flatMap((text) => text.match(tokenRegex) || []);
  }

  function parseFirstPriceTokenFromNode(node) {
    const tokens = getPriceTokensFromNode(node);
    if (!tokens.length) return { value: null, inactive: true };
    return parsePriceToken(tokens[0]);
  }

  function countPriceTokens(text) {
    const matches = normalizeText(text).match(PRICE_TOKEN_REGEX);
    return matches ? matches.length : 0;
  }

  function isHeaderText(text) {
    const lowered = normalizeText(text).toLowerCase();
    return lowered.includes("startpris") && lowered.includes("pris nu");
  }

  function findListContainer() {
    for (const selector of CONTAINER_SELECTORS) {
      const match = document.querySelector(selector);
      if (match) return match;
    }
    return null;
  }

  function getCandidateRows(container) {
    const directChildren = Array.from(container.querySelectorAll(":scope > *"));
    if (directChildren.length > 1) {
      return directChildren;
    }

    const semanticRows = Array.from(
      container.querySelectorAll(":scope tr, :scope [role='row'], :scope li, :scope > div > div")
    );
    return semanticRows;
  }

  function findRowsParentAndRows(container) {
    const candidateParents = [container, ...Array.from(container.querySelectorAll("div, section, article, ul, ol, tbody"))];
    let bestParent = null;
    let bestRows = [];
    let bestScore = -1;

    candidateParents.forEach((parent) => {
      const children = Array.from(parent.children);
      if (children.length < 2) return;

      let rowLikeCount = 0;
      let headerCount = 0;
      children.forEach((child) => {
        const text = normalizeText(child.textContent);
        if (!text) return;
        if (isHeaderText(text)) {
          headerCount += 1;
          rowLikeCount += 1;
          return;
        }
        if (countPriceTokens(text) >= 2) {
          rowLikeCount += 1;
        }
      });

      if (rowLikeCount < 2) return;

      const score = rowLikeCount * 10 + headerCount * 20 - Math.abs(children.length - rowLikeCount);
      if (score > bestScore) {
        bestScore = score;
        bestParent = parent;
        bestRows = children.filter((child) => {
          const text = normalizeText(child.textContent);
          return isHeaderText(text) || countPriceTokens(text) >= 2;
        });
      }
    });

    if (bestParent && bestRows.length >= 2) {
      return { rowsParent: bestParent, rows: bestRows };
    }

    return { rowsParent: container, rows: getCandidateRows(container) };
  }

  function getCells(row) {
    const children = Array.from(row.querySelectorAll(":scope > *")).filter((el) => normalizeText(el.textContent));
    if (children.length) {
      return children.map((el) => normalizeText(el.textContent));
    }
    return [normalizeText(row.textContent)];
  }

  function detectHeaderInfo(rows) {
    const headerRow = rows.find((row) => {
      const text = normalizeText(row.textContent).toLowerCase();
      return text.includes("startpris") && text.includes("pris nu");
    });

    if (!headerRow) return { headerRow: null, startIndex: -1, nowIndex: -1 };

    const headerCells = getCells(headerRow).map((cell) => cell.toLowerCase());
    const startIndex = headerCells.findIndex((cell) => cell.includes("startpris"));
    const nowIndex = headerCells.findIndex((cell) => cell.includes("pris nu"));

    return { headerRow, startIndex, nowIndex };
  }

  function formatSavingsPercent(startValue, nowValue) {
    if (typeof startValue !== "number" || typeof nowValue !== "number") return null;
    if (startValue <= 0) return null;
    const percent = ((startValue - nowValue) / startValue) * 100;
    if (!Number.isFinite(percent)) return null;
    if (percent >= 0) return `Spar ${percent.toFixed(1)}%`;
    return `Ökat ${Math.abs(percent).toFixed(1)}%`;
  }

  function getCellElements(row) {
    return Array.from(row.querySelectorAll(":scope > *")).filter((el) => normalizeText(el.textContent));
  }

  function clearSavingsPercent(row) {
    row.querySelectorAll(`.${SAVINGS_PERCENT_CLASS}`).forEach((node) => node.remove());
  }

  function pickFallbackPricePair(parsedTokens) {
    const numericValues = parsedTokens
      .map((token) => token.value)
      .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0);

    if (!numericValues.length) {
      return {
        start: parsedTokens[0] ?? { value: null, inactive: true },
        now: parsedTokens[1] ?? { value: null, inactive: true }
      };
    }

    if (numericValues.length === 1) {
      return {
        start: { value: numericValues[0], inactive: false },
        now: { value: null, inactive: true }
      };
    }

    const sortedDescending = [...numericValues].sort((a, b) => b - a);
    return {
      start: { value: sortedDescending[0], inactive: false },
      now: { value: sortedDescending[1], inactive: false }
    };
  }

  function renderSavingsPercent(row, headerInfo, startValue, nowValue) {
    clearSavingsPercent(row);
    const label = formatSavingsPercent(startValue, nowValue);
    if (!label) return;

    const badge = document.createElement("span");
    badge.className = SAVINGS_PERCENT_CLASS;
    badge.textContent = ` (${label})`;
    badge.style.marginLeft = "4px";
    badge.style.fontWeight = "600";
    badge.style.color = "#0f8a2f";

    const cellElements = getCellElements(row);
    if (headerInfo.nowIndex >= 0 && cellElements[headerInfo.nowIndex]) {
      cellElements[headerInfo.nowIndex].appendChild(badge);
      return;
    }
    row.appendChild(badge);
  }

  function extractPricesFromRow(row, headerInfo) {
    const cellElements = getCellElements(row);
    const cellTexts = cellElements.length ? cellElements.map((el) => normalizeText(el.textContent)) : getCells(row);
    const rowTokens = getPriceTokensFromNode(row);
    const parsedRowTokens = rowTokens.map((token) => parsePriceToken(token));
    const fallbackPair = pickFallbackPricePair(parsedRowTokens);

    if (headerInfo.startIndex >= 0 && headerInfo.nowIndex >= 0) {
      const startCell = cellElements[headerInfo.startIndex];
      const nowCell = cellElements[headerInfo.nowIndex];

      const start = startCell
        ? parseFirstPriceTokenFromNode(startCell)
        : parseFirstPriceTokenFromText(cellTexts[headerInfo.startIndex] ?? "");
      const now = nowCell
        ? parseFirstPriceTokenFromNode(nowCell)
        : parseFirstPriceTokenFromText(cellTexts[headerInfo.nowIndex] ?? "");

      if (start.value != null && now.value != null && now.value > 0) {
        return { start, now };
      }

      return fallbackPair;
    }

    return fallbackPair;
  }

  function sortRowsBySavings() {
    const container = findListContainer();
    if (!container) return { applied: false, changed: false, sortableCount: 0 };

    const { rowsParent, rows } = findRowsParentAndRows(container);
    if (rows.length < 2) return { applied: false, changed: false, sortableCount: 0 };

    const headerInfo = detectHeaderInfo(rows);
    const dataRows = rows.filter((row) => row !== headerInfo.headerRow);
    if (!dataRows.length) return { applied: false, changed: false, sortableCount: 0 };

    const analyzed = dataRows.map((row, originalIndex) => {
      const prices = extractPricesFromRow(row, headerInfo);
      const hasInactiveListing = prices.start.inactive || prices.now.inactive;
      const startValue = prices.start.value;
      const nowValue = prices.now.value;
      renderSavingsPercent(row, headerInfo, prices.start.value, prices.now.value);

      if (startValue == null || nowValue == null) {
        return {
          row,
          originalIndex,
          sortable: false,
          inactive: hasInactiveListing,
          difference: Number.NEGATIVE_INFINITY
        };
      }

      return {
        row,
        originalIndex,
        sortable: true,
        inactive: false,
        difference: startValue - nowValue
      };
    });

    const sortable = analyzed
      .filter((entry) => entry.sortable)
      .sort((a, b) => b.difference - a.difference);

    const unsortable = analyzed
      .filter((entry) => !entry.sortable)
      .sort((a, b) => a.originalIndex - b.originalIndex);

    const orderedEntries = [...sortable, ...unsortable];
    if (!orderedEntries.length) return { applied: false, changed: false, sortableCount: 0 };
    const changed = orderedEntries.some((entry, index) => entry.originalIndex !== index);

    // Reorder only direct children inside the same parent to avoid
    // moving nested React nodes out of their owner containers.
    if (!orderedEntries.every((entry) => entry.row.parentElement === rowsParent)) {
      return { applied: false, changed: false, sortableCount: sortable.length };
    }

    const orderedNodes = headerInfo.headerRow
      ? [headerInfo.headerRow, ...orderedEntries.map((entry) => entry.row)]
      : orderedEntries.map((entry) => entry.row);

    const parentChildren = Array.from(rowsParent.children);
    const rowIndexes = rows
      .map((row) => parentChildren.indexOf(row))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);

    if (rowIndexes.length !== rows.length) {
      return { applied: false, changed: false, sortableCount: sortable.length };
    }

    const minIndex = rowIndexes[0];
    const maxIndex = rowIndexes[rowIndexes.length - 1];
    const contiguous = rowIndexes.every((index, i) => index === minIndex + i);
    if (!contiguous) {
      return { applied: false, changed: false, sortableCount: sortable.length };
    }

    const marker = document.createComment("pricesorter-end-marker");
    rowsParent.insertBefore(marker, parentChildren[maxIndex + 1] ?? null);
    orderedNodes.forEach((node) => rowsParent.insertBefore(node, marker));
    marker.remove();

    return { applied: true, changed, sortableCount: sortable.length };
  }

  function handleSortClick(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const result = sortRowsBySavings();
    if (!button) return;

    button.classList.add("pricesorter-flash");
    if (!result.applied) {
      button.textContent = "Sortering inte tillgänglig";
    } else if (!result.changed) {
      button.textContent = "Ingen ordningsändring";
    } else {
      button.textContent = "Sorterat efter besparing";
    }
    window.setTimeout(() => {
      button.classList.remove("pricesorter-flash");
      button.textContent = BUTTON_TEXT;
    }, 1400);
  }

  function ensureSortButton() {
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;

    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = BUTTON_TEXT;
    button.addEventListener("click", handleSortClick);
    document.body.appendChild(button);
    return button;
  }

  function startObserver() {
    const observer = new MutationObserver(() => {
      if (!document.getElementById(BUTTON_ID)) {
        ensureSortButton();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    ensureSortButton();
    startObserver();
  }

  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "PRICESORTER_SORT_NOW") {
        return false;
      }
      const result = sortRowsBySavings();
      sendResponse({ ok: true, ...result });
      return true;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
