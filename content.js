(() => {
  "use strict";

  if (window.__priceSorterExtensionInitialized) {
    return;
  }
  window.__priceSorterExtensionInitialized = true;

  const BUTTON_ID = "pricesorter-sort-button";
  const BUTTON_TEXT = "Sortera efter besparing";
  const CONTAINER_SELECTORS = [
    "div.pr-16fbr99",
    "div[data-cursor-element-id='cursor-el-1']",
    "div#content-below-header"
  ];
  const PRICE_TOKEN_REGEX = /(?:\d[\d\s.,]*\s*kr|-)/gi;

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function parsePriceToken(token) {
    const normalized = normalizeText(token).toLowerCase().replace(/\u00a0/g, " ");
    if (!normalized) return { value: null, inactive: true };
    if (normalized === "-") return { value: null, inactive: true };

    const numeric = normalized
      .replace("kr", "")
      .replace(/\s+/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");

    if (!numeric || numeric === "-" || numeric === ".") {
      return { value: null, inactive: true };
    }

    const value = Number.parseFloat(numeric);
    if (Number.isNaN(value)) {
      return { value: null, inactive: false };
    }
    return { value, inactive: false };
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

  function extractPricesFromRow(row, headerInfo) {
    const cellTexts = getCells(row);

    if (headerInfo.startIndex >= 0 && headerInfo.nowIndex >= 0) {
      const startToken = cellTexts[headerInfo.startIndex] ?? "";
      const nowToken = cellTexts[headerInfo.nowIndex] ?? "";
      return {
        start: parsePriceToken(startToken),
        now: parsePriceToken(nowToken)
      };
    }

    const tokens = normalizeText(row.textContent).match(/(?:\d[\d\s.,]*\s*kr|-)/gi) || [];
    return {
      start: parsePriceToken(tokens[0] ?? ""),
      now: parsePriceToken(tokens[1] ?? "")
    };
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

      if (prices.start.value == null || prices.now.value == null) {
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
        difference: prices.start.value - prices.now.value
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
