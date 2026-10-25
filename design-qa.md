# Dark-mode verification — 2026-10-25

Verified the unpacked extension in the user's Brave profile after extension reloads.

## Pages and states checked

- Homepage: hero, category navigation, product/sale badges, search input, history suggestions, backdrop, hover, and keyboard focus.
- Product page: both observed offer layouts, filter sheet, shipping toggle, sorting menu, price history, popularity periods, SVG axis labels, and HTML chart tooltip.
- Authenticated alerts: table, row menu, and unsaved alert editor including its numeric price field.
- Perfume category: filter search, price/volume fields, sorting combobox/options, stock switch, applied filters, read-more mask, information panels, and footer.
- Deals: hero, filters, product cards, and mobile layout.
- Mobile home and alerts were checked at approximately 433 CSS pixels; final mobile deals text/input scan also passed. Temporary viewport override was reset.

## Changes verified

- Complete foreground/background pairs now override local Fabric light, system, and dark theme scopes.
- Home/deals heroes and legacy information panels have dark surfaces.
- Both offer-title variants use readable lavender instead of hardcoded blue.
- Sale, accent, selected-option, and applied-filter badges retain readable text.
- Search/filter shells remain dark during hover, expose visible boundaries, and own a single focus ring. Nested inputs and readonly comboboxes no longer draw a second square outline.
- Text fields, placeholders, numeric fields, selected periods, dropdown options, checkboxes, and stock-switch states have dark-mode colors.
- Search/dialog backdrops darken the page rather than washing it out with white.
- Highcharts axis labels and tooltip text override cached inline light-theme colors. Tooltip fill/outline and grid/axis lines are scoped to the chart.
- Button foreground/background pairs switch without animating through low-contrast intermediate grays. Native transform/opacity transitions remain available.
- Toggling to light mode restores native colors. Saved preference was restored to dark.

## Contrast evidence

Computed text/input scans found no remaining failures in the final sampled home, product, alerts, category, and deals states. Scans use 4.5:1 for normal text and 3:1 for large text; image-backed content is excluded. SVG fills and HTML tooltips were inspected separately.

Representative measured pairs:

- Placeholder on hovered field: 5.63:1.
- Selected option text on purple: 11.41:1.
- Enabled control boundary on pressed surface: 3.33:1.
- Chart date/merchant text on tooltip surface: 7.87:1.
- Search focus ring on field surface: 8.77:1.

The final chart tooltip showed light price text, muted readable date/merchant text, a dark fill, and a visible outline. Both stock-switch states and the hovered selected twelve-month period were exercised in Brave. The alert editor was closed without saving.

## Automated checks

- `npm test`: 43 passed, 0 failed.
- `npm run build:content-css`: passed; tracked `styles.css` regenerated.
- `npm run build:popup -- --configLoader native`: passed.
- `node scripts/validate.mjs`: passed; 10 runtime references validated.
- `git diff --check`: passed.

The default bundled Vite config loader encountered a sandbox `spawn EPERM` while resolving a native Tailwind dependency. Building with Vite's native config loader succeeded; project build scripts were left unchanged.
