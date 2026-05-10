# PriceRunner PriceSorter (Brave Extension)

This extension adds a **Sort by savings** button on PriceRunner pages and sorts watchlist products by:

`Startpris - Pris nu` (largest savings first).

## Behavior

- Sorting is triggered only when you click the injected button.
- Each product row is compared only against its own prices.
- If either `Startpris` or `Pris nu` is `-`, the row is treated as **no active listing**.
- Rows with `-` (or other unreadable prices) stay visible and are moved to the end.

## Install in Brave (unpacked)

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `pricerunner-price-sorter`.
5. Pin the extension in the toolbar (optional but recommended).
6. Open PriceRunner and either:
   - click the page button **Sort by savings**, or
   - click extension icon -> **Sortera nu** in popup.

## Files

- `manifest.json`: Manifest V3 config and content script registration.
- `content.js`: DOM parsing, row-level difference calculation, sorting, and button injection.
- `styles.css`: Floating button styles.

## Troubleshooting

- If Brave says the manifest has an invalid host wildcard, make sure `manifest.json` uses explicit domains (for example `*.pricerunner.se`) and not `*.pricerunner.*`.
- If nothing happens when clicking sort, PriceRunner may have changed DOM classes. Update selectors in `CONTAINER_SELECTORS` inside `content.js`.
- If prices use a different format, adjust `parsePriceToken()` in `content.js`.
