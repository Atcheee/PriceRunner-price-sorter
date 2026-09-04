(() => {
  "use strict";

  const MAX_DELAY_MS = 5_000;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "PRICESORTER_DELAY") return false;

    const requestedDelay = Number(message.delayMs);
    const delayMs = Number.isFinite(requestedDelay)
      ? Math.min(Math.max(requestedDelay, 0), MAX_DELAY_MS)
      : 0;

    setTimeout(() => sendResponse({ ok: true }), delayMs);
    return true;
  });
})();
