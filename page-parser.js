(() => {
  "use strict";

  const core = globalThis.PriceRunnerCore;
  if (!core) throw new Error("PriceRunnerCore must load before page-parser.js");

  const SELECTORS = Object.freeze({
    containers: Object.freeze([
      { name: "watchlist-testid", selector: "[data-testid='watchlist']", tier: "stable" },
      { name: "watchlist-v2-testid", selector: "[data-testid='watchlist-v2']", tier: "stable" },
      { name: "legacy-generated-class", selector: "div.pr-16fbr99", tier: "fallback" },
      {
        name: "legacy-cursor-container",
        selector: "div[data-cursor-element-id='cursor-el-1']",
        tier: "fallback",
      },
      { name: "content-region", selector: "div#content-below-header, main#content-below-header", tier: "fallback" },
    ]),
    productLinks: Object.freeze([
      "a[data-testid*='product'][href]",
      "a[href*='/pl/']",
      "a[href*='/product/']",
      "a[href]",
    ]),
    startPrice: Object.freeze(["[data-start-price]", "[data-testid*='start-price']"]),
    currentPrice: Object.freeze(["[data-current-price]", "[data-testid*='current-price']"]),
    unitPrice: Object.freeze(["[data-unit-price]", "[data-testid*='unit-price']"]),
  });

  const HEADER_LABELS = Object.freeze({
    start: Object.freeze(["startpris", "alkuperäinen hinta", "starting price"]),
    current: Object.freeze(["pris nu", "nuvarande pris", "nuværende pris", "nåpris", "nykyinen hinta", "current price"]),
    unit: Object.freeze(["jämförpris", "enhetspris", "pris/enhet", "yksikköhinta", "unit price"]),
  });

  const PRICE_TOKEN_PATTERN = /(?:\d[\d\s\u00a0\u202f'.,]*\d|\d)\s*(?:kr|sek|dkk|nok|eur|€)/gi;
  const UNIT_PRICE_PATTERN = /(?:\d[\d\s\u00a0\u202f'.,]*\d|\d)\s*(?:kr|sek|dkk|nok|eur|€)\s*\/\s*(?:kg|g|l|ml|st|styck|pcs?)/i;
  const UNAVAILABLE_TEXT_PATTERN = /slut i lager|ej i lager|inte i lager|udsolgt|ikke på lager|loppuunmyyty|ei varastossa|out of stock|unavailable/i;
  const MISSING_PRICE_PATTERN = /^[-–—−]+$|pris saknas|price unavailable|hinta puuttuu/i;

  function elementText(element) {
    return core.normalizeText(element?.textContent);
  }

  function directCells(row) {
    return Array.from(row?.children ?? []).filter(
      (element) => elementText(element) && !element.matches?.("[data-pricesorter-owned]"),
    );
  }

  function includesLabel(text, labels) {
    const normalized = core.normalizeText(text).toLowerCase();
    return labels.some((label) => normalized.includes(label));
  }

  function headerInfoForRow(row) {
    const cells = directCells(row);
    const texts = cells.map((cell) => elementText(cell).toLowerCase());
    const startIndex = texts.findIndex((text) => includesLabel(text, HEADER_LABELS.start));
    const currentIndex = texts.findIndex((text) => includesLabel(text, HEADER_LABELS.current));
    const unitIndex = texts.findIndex((text) => includesLabel(text, HEADER_LABELS.unit));
    const rowText = elementText(row);
    const isHeader =
      (startIndex >= 0 && currentIndex >= 0) ||
      (includesLabel(rowText, HEADER_LABELS.start) && includesLabel(rowText, HEADER_LABELS.current));

    return { row: isHeader ? row : null, cells, startIndex, currentIndex, unitIndex };
  }

  function findHeader(children) {
    for (const child of children) {
      const info = headerInfoForRow(child);
      if (info.row) return info;
    }
    return { row: null, cells: [], startIndex: -1, currentIndex: -1, unitIndex: -1 };
  }

  function findHeaderForParent(parent, children) {
    const localHeader = findHeader(children);
    if (localHeader.row || !parent.matches?.("tbody")) return localHeader;

    const table = parent.closest?.("table");
    return table ? findHeader(Array.from(table.querySelectorAll("thead tr"))) : localHeader;
  }

  function hasProductLink(row) {
    return SELECTORS.productLinks.some((selector) => row.matches?.(selector) || row.querySelector?.(selector));
  }

  function isProductRow(row, headerRow) {
    if (!row || row === headerRow || row.matches?.("[data-pricesorter-owned]")) return false;
    if (row.matches?.("[data-product-row]")) return true;
    const text = elementText(row);
    const priceCount = (text.match(PRICE_TOKEN_PATTERN) ?? []).length;
    return hasProductLink(row) && (priceCount > 0 || UNAVAILABLE_TEXT_PATTERN.test(text));
  }

  function candidateParents(container) {
    return [container, ...Array.from(container.querySelectorAll("div, section, article, ul, ol, tbody"))];
  }

  function findRows(container) {
    let best = null;

    for (const parent of candidateParents(container)) {
      const children = Array.from(parent.children);
      if (!children.length) continue;
      const header = findHeaderForParent(parent, children);
      const rows = children.filter((child) => isProductRow(child, header.row));
      if (!rows.length) continue;

      const explicitRows = rows.filter((row) => row.matches("[data-product-row], [role='row']")).length;
      const score = rows.length * 10 + explicitRows * 5 + (header.row ? 100 : 0);
      if (!best || score > best.score) best = { parent, rows, header, score };
    }

    return best;
  }

  function firstMatchingElement(root, selectors) {
    for (const selector of selectors) {
      const matches = root.querySelectorAll(selector);
      for (const match of matches) {
        if (match.closest?.("[data-pricesorter-owned]")) continue;
        return match;
      }
    }
    return null;
  }

  function resolveUrl(href, locationLike) {
    if (!href) return "";
    try {
      const url = new URL(href, locationLike?.href ?? "https://www.pricerunner.se/");
      const supportedHost = /(^|\.)pricerunner\.(?:se|dk|no|fi|com)$/i.test(url.hostname);
      return url.protocol === "https:" && supportedHost ? url.toString() : "";
    } catch (_error) {
      return "";
    }
  }

  function extractPriceTokens(text) {
    return core.normalizeText(text).match(PRICE_TOKEN_PATTERN) ?? [];
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function labeledPriceCandidate(text, labels) {
    const normalized = core.normalizeText(text);
    for (const label of labels) {
      const pattern = new RegExp(
        `${escapeRegExp(label)}\\s*:?\\s*(${PRICE_TOKEN_PATTERN.source})`,
        "i",
      );
      const match = normalized.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function explicitPriceCandidate(value) {
    if (value == null) return null;
    const parsed = core.parsePriceToken(value);
    if (parsed.inactive) return value;
    // Zero-valued tracking attributes exist on live rows before client data
    // hydrates. Never let them override readable visible prices.
    if (parsed.readable && parsed.value > 0) return value;
    return null;
  }

  function priceCellCandidate(cell) {
    const text = elementText(cell);
    const token = extractPriceTokens(text)[0];
    if (token) return token;
    if (MISSING_PRICE_PATTERN.test(text)) return text;
    return null;
  }

  function snapshotRow(row, header, originalIndex, locationLike) {
    const cells = directCells(row);
    const link = firstMatchingElement(row, SELECTORS.productLinks);
    const startElement = firstMatchingElement(row, SELECTORS.startPrice);
    const currentElement = firstMatchingElement(row, SELECTORS.currentPrice);
    const unitElement = firstMatchingElement(row, SELECTORS.unitPrice);
    const rowText = elementText(row);
    const cellTokens = cells.flatMap((cell) => extractPriceTokens(elementText(cell)));
    const tokens = cellTokens.length ? cellTokens : extractPriceTokens(rowText);
    const labeledStart = labeledPriceCandidate(rowText, HEADER_LABELS.start);
    const labeledCurrent = labeledPriceCandidate(rowText, HEADER_LABELS.current);
    const headerStart = priceCellCandidate(cells[header.startIndex]);
    const headerCurrent = priceCellCandidate(cells[header.currentIndex]);
    const usesHeader = headerStart !== null && headerCurrent !== null;
    const startPriceText =
      explicitPriceCandidate(row.getAttribute("data-start-price")) ??
      explicitPriceCandidate(startElement ? elementText(startElement) : null) ??
      labeledStart ??
      (usesHeader ? headerStart : tokens[0] ?? "");
    const currentPriceText =
      explicitPriceCandidate(row.getAttribute("data-current-price")) ??
      explicitPriceCandidate(currentElement ? elementText(currentElement) : null) ??
      labeledCurrent ??
      (usesHeader ? headerCurrent : tokens[1] ?? "");
    const unitPriceText =
      row.getAttribute("data-unit-price") ??
      (unitElement ? elementText(unitElement) : null) ??
      (header.unitIndex >= 0
        ? elementText(cells[header.unitIndex])
        : elementText(row).match(UNIT_PRICE_PATTERN)?.[0] ?? "");

    return {
      id: row.getAttribute("data-product-id") ?? null,
      name: row.getAttribute("data-product-name") ?? elementText(link),
      url: resolveUrl(link?.getAttribute("href"), locationLike),
      startPriceText,
      currentPriceText,
      unitPriceText,
      stockText: elementText(row),
      originalIndex,
      parserSource:
        labeledStart && labeledCurrent
          ? "row-labels"
          : usesHeader
            ? "header-cells"
            : "ordered-token-fallback",
    };
  }

  function analyzeDocument(document, locationLike = document?.location) {
    if (!document?.querySelector) {
      return {
        supported: false,
        reason: "document-unavailable",
        entries: [],
        summary: core.summarizeProducts([], { supported: false }),
      };
    }

    const candidates = [];
    for (const selectorConfig of SELECTORS.containers) {
      for (const container of document.querySelectorAll(selectorConfig.selector)) {
        const found = findRows(container);
        if (found) candidates.push({ ...found, selectorConfig });
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    const selected = candidates[0];
    if (!selected) {
      return {
        supported: false,
        reason: "watchlist-not-detected",
        entries: [],
        summary: core.summarizeProducts([], { supported: false }),
      };
    }

    let pathname = "";
    try {
      pathname = new URL(
        locationLike?.href ?? "",
        "https://www.pricerunner.se/",
      ).pathname;
    } catch (_error) {
      pathname = "";
    }
    if (!/\/(?:profile\/alerts|watchlist)\/?$/i.test(pathname)) {
      return {
        supported: false,
        reason: "unsupported-route",
        entries: [],
        summary: core.summarizeProducts([], { supported: false }),
      };
    }

    const entries = selected.rows.map((row, originalIndex) => {
      const snapshot = snapshotRow(row, selected.header, originalIndex, locationLike);
      const product = core.parseProductRow(snapshot);
      if (snapshot.parserSource === "ordered-token-fallback") {
        product.warnings = [...product.warnings, "parser:ordered-token-fallback"];
      }
      return { row, product };
    });
    const products = entries.map(({ product }) => product);
    const summary = core.summarizeProducts(products, {
      supported: true,
      selectorTier: selected.selectorConfig.tier,
    });

    return {
      supported: true,
      reason: null,
      container: selected.parent,
      headerRow: selected.header.row,
      entries,
      selectorName: selected.selectorConfig.name,
      selectorTier: selected.selectorConfig.tier,
      summary,
    };
  }

  const api = Object.freeze({ SELECTORS, analyzeDocument, snapshotRow });
  globalThis.PriceRunnerPageParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
