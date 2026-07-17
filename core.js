(() => {
  "use strict";

  const SORT_MODES = Object.freeze({
    ABSOLUTE_SAVING: "absoluteSaving",
    PERCENTAGE_SAVING: "percentageSaving",
    CURRENT_PRICE: "currentPrice",
    UNIT_PRICE: "unitPrice",
    ORIGINAL: "original",
  });

  const UNAVAILABLE_PATTERN = new RegExp(
    [
      "slut i lager",
      "ej i lager",
      "inte i lager",
      "utgått",
      "ikke på lager",
      "ikke lagerført",
      "udsolgt",
      "ikke på lager",
      "loppuunmyyty",
      "ei varastossa",
      "out of stock",
      "unavailable",
    ].join("|"),
    "i",
  );

  const AVAILABLE_PATTERN = new RegExp(
    ["i lager", "på lager", "varastossa", "in stock", "tillgänglig"].join("|"),
    "i",
  );

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/[\s\u00a0\u202f]+/g, " ")
      .trim();
  }

  function normalizeLocalizedNumber(rawNumber) {
    let numeric = rawNumber.replace(/[\s\u00a0\u202f']/g, "");
    const commaIndex = numeric.lastIndexOf(",");
    const dotIndex = numeric.lastIndexOf(".");

    if (commaIndex >= 0 && dotIndex >= 0) {
      const decimalSeparator = commaIndex > dotIndex ? "," : ".";
      const thousandsSeparator = decimalSeparator === "," ? "." : ",";
      numeric = numeric.split(thousandsSeparator).join("");
      numeric = numeric.replace(decimalSeparator, ".");
      return numeric;
    }

    const separator = commaIndex >= 0 ? "," : dotIndex >= 0 ? "." : null;
    if (!separator) return numeric;

    const parts = numeric.split(separator);
    const hasThousandsGrouping =
      parts.length > 2 && parts.slice(1).every((part) => /^\d{3}$/.test(part));
    const singleThousandsGroup =
      parts.length === 2 && /^\d{1,3}$/.test(parts[0]) && /^\d{3}$/.test(parts[1]);

    if (hasThousandsGrouping || singleThousandsGroup) {
      return parts.join("");
    }

    if (parts.length === 2 && /^\d{1,2}$/.test(parts[1])) {
      return `${parts[0]}.${parts[1]}`;
    }

    return parts.join("");
  }

  function parsePriceToken(token) {
    const raw = normalizeText(token);
    if (!raw || /^[-–—−]+$/.test(raw)) {
      return { value: null, inactive: true, readable: false, reason: "missing" };
    }

    // PriceRunner cells can also contain counts, model years and percentages.
    // Accept a number embedded in text only when it has a currency suffix.
    // Plain numeric values remain supported for semantic data attributes.
    const currencyMatch = raw.match(
      /\d[\d\s\u00a0\u202f'.,]*\s*(?:kr|sek|dkk|nok|eur|€)/i,
    );
    const numericOnlyMatch = raw.match(/^\d[\d\s\u00a0\u202f'.,]*$/);
    const match = currencyMatch ?? numericOnlyMatch;
    if (!match) {
      return { value: null, inactive: false, readable: false, reason: "unreadable" };
    }

    const numericToken = match[0].replace(/\s*(?:kr|sek|dkk|nok|eur|€)\s*$/i, "");
    const numeric = normalizeLocalizedNumber(numericToken);
    if (!/^\d+(?:\.\d+)?$/.test(numeric)) {
      return { value: null, inactive: false, readable: false, reason: "unreadable" };
    }

    const value = Number.parseFloat(numeric);
    if (!Number.isFinite(value) || value < 0) {
      return { value: null, inactive: false, readable: false, reason: "unreadable" };
    }

    return { value, inactive: false, readable: true, reason: null };
  }

  function calculateMetrics(product) {
    const startPrice = product?.startPrice?.value ?? product?.startPrice ?? null;
    const currentPrice = product?.currentPrice?.value ?? product?.currentPrice ?? null;
    const unitPrice = product?.unitPrice?.value ?? product?.unitPrice ?? null;
    const hasComparablePrices =
      Number.isFinite(startPrice) && Number.isFinite(currentPrice) && startPrice > 0;
    const absoluteSaving = hasComparablePrices ? startPrice - currentPrice : null;
    const percentageSaving = hasComparablePrices ? (absoluteSaving / startPrice) * 100 : null;

    return {
      startPrice: Number.isFinite(startPrice) ? startPrice : null,
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
      absoluteSaving: Number.isFinite(absoluteSaving) ? absoluteSaving : null,
      percentageSaving: Number.isFinite(percentageSaving) ? percentageSaving : null,
    };
  }

  function detectStockState(stockText, currentPrice) {
    const text = normalizeText(stockText);
    if (UNAVAILABLE_PATTERN.test(text) || currentPrice.inactive) return "unavailable";
    if (AVAILABLE_PATTERN.test(text) || currentPrice.readable) return "available";
    return "unknown";
  }

  function parseProductRow(snapshot) {
    const startPrice = parsePriceToken(snapshot?.startPriceText);
    const currentPrice = parsePriceToken(snapshot?.currentPriceText);
    const unitPrice = parsePriceToken(snapshot?.unitPriceText);
    const stockState = detectStockState(snapshot?.stockText ?? snapshot?.text, currentPrice);
    const parsed = {
      id: snapshot?.id ?? null,
      name: normalizeText(snapshot?.name) || "Namnlös produkt",
      url: normalizeText(snapshot?.url),
      startPrice,
      currentPrice,
      unitPrice,
      stockState,
      originalIndex: Number.isInteger(snapshot?.originalIndex) ? snapshot.originalIndex : 0,
      captureTime: snapshot?.captureTime ?? null,
      parserSource: snapshot?.parserSource ?? "unknown",
    };
    const metrics = calculateMetrics(parsed);
    const warnings = [];

    if (!startPrice.readable) warnings.push(`startPrice:${startPrice.reason}`);
    if (!currentPrice.readable) warnings.push(`currentPrice:${currentPrice.reason}`);
    if (!parsed.name || parsed.name === "Namnlös produkt") warnings.push("name:missing");
    if (!parsed.url) warnings.push("url:missing");

    return { ...parsed, ...metrics, warnings };
  }

  function sortValue(product, mode) {
    switch (mode) {
      case SORT_MODES.ABSOLUTE_SAVING:
        return product.absoluteSaving;
      case SORT_MODES.PERCENTAGE_SAVING:
        return product.percentageSaving;
      case SORT_MODES.CURRENT_PRICE:
        return product.currentPrice;
      case SORT_MODES.UNIT_PRICE:
        return product.unitPrice;
      case SORT_MODES.ORIGINAL:
        return product.originalIndex;
      default:
        return null;
    }
  }

  function isInvalidForMode(product, mode) {
    if (!product || product.stockState === "unavailable") return true;
    if (mode === SORT_MODES.ORIGINAL) return false;
    return !Number.isFinite(sortValue(product, mode));
  }

  function compareProducts(mode) {
    return (left, right) => {
      const leftInvalid = isInvalidForMode(left, mode);
      const rightInvalid = isInvalidForMode(right, mode);
      if (leftInvalid !== rightInvalid) return leftInvalid ? 1 : -1;

      const fallback = (left?.originalIndex ?? 0) - (right?.originalIndex ?? 0);
      if (leftInvalid && rightInvalid) return fallback;

      const leftValue = sortValue(left, mode);
      const rightValue = sortValue(right, mode);
      if (leftValue === rightValue) return fallback;

      const ascending =
        mode === SORT_MODES.CURRENT_PRICE ||
        mode === SORT_MODES.UNIT_PRICE ||
        mode === SORT_MODES.ORIGINAL;
      return ascending ? leftValue - rightValue : rightValue - leftValue;
    };
  }

  function groupInvalidRows(products, mode) {
    const valid = [];
    const invalid = [];
    for (const product of products ?? []) {
      (isInvalidForMode(product, mode) ? invalid : valid).push(product);
    }
    return { valid, invalid };
  }

  function summarizeProducts(products, options = {}) {
    const list = products ?? [];
    const readablePrices = list.filter((product) => Number.isFinite(product.currentPrice)).length;
    const unavailableItems = list.filter((product) => product.stockState === "unavailable").length;
    const parserFailures = list.filter((product) => product.warnings?.length).length;
    const savings = list
      .map((product) => product.absoluteSaving)
      .filter((value) => Number.isFinite(value));
    const largestSaving = savings.length ? Math.max(...savings) : null;
    const staleParserWarning = options.selectorTier === "fallback" || parserFailures > 0;

    let state = "healthy";
    if (options.supported === false) state = "unsupported";
    else if (!list.length) state = "zero-products";
    else if (unavailableItems === list.length) state = "all-unavailable";
    else if (staleParserWarning) state = "partial";

    return {
      state,
      totalProducts: list.length,
      readablePrices,
      unavailableItems,
      parserFailures,
      largestSaving,
      staleParserWarning,
    };
  }

  function protectCsvFormula(value) {
    const text = String(value ?? "");
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  }

  function escapeCsvField(value) {
    const protectedValue = protectCsvFormula(value);
    return /[",\r\n]/.test(protectedValue)
      ? `"${protectedValue.replace(/"/g, '""')}"`
      : protectedValue;
  }

  function generateCsv(products, capturedAt = new Date().toISOString()) {
    const headers = [
      "product_name",
      "url",
      "starting_price",
      "current_price",
      "absolute_saving",
      "saving_percentage",
      "stock_state",
      "capture_time",
    ];
    const rows = (products ?? []).map((product) => {
      const values = [
        product.name,
        product.url,
        product.startPrice,
        product.currentPrice,
        product.absoluteSaving,
        product.percentageSaving,
        product.stockState,
        product.captureTime ?? capturedAt,
      ];
      return values.map((value) => escapeCsvField(value ?? "")).join(",");
    });
    return `\uFEFF${[headers.join(","), ...rows].join("\r\n")}`;
  }

  const api = Object.freeze({
    SORT_MODES,
    calculateMetrics,
    compareProducts,
    generateCsv,
    groupInvalidRows,
    normalizeText,
    parsePriceToken,
    parseProductRow,
    summarizeProducts,
  });

  globalThis.PriceRunnerCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
