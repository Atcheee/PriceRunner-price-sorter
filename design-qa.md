**Comparison Target**

- Source visual truth:
  - `C:\Users\erik9\AppData\Local\Temp\codex-clipboard-9505127a-391b-4807-b4e8-c15af9deb802.png`
  - `C:\Users\erik9\AppData\Local\Temp\codex-clipboard-ba23efbb-d0d3-47cb-b4e4-f8a596704108.png`
  - `C:\Users\erik9\AppData\Local\Temp\codex-clipboard-995f0e59-4a12-45b3-bc48-17e707a67552.png`
- Implementation screenshot: pending unpacked-extension reload
- Source pixels: 2541 × 1247, 1587 × 82, and 1648 × 1324
- Live Chrome viewport: 2819 × 1467 CSS px
- States: homepage, open category navigation, navbar, and authenticated alerts page in dark mode

**Full-view Comparison Evidence**

- The supplied homepage and category screenshots show dark mode reaching PriceRunner content, but the `PriceRunner` wordmark remains black and native surfaces are flattened.
- Live inspection traced the wordmark fill to PriceRunner's `--header-logo` token.
- The homepage also displayed the alerts sorting action because its product grid was falsely accepted by the watchlist parser.
- The implementation now overrides PriceRunner's semantic theme tokens and restricts sorting support to `/profile/alerts` and legacy `/watchlist`.

**Focused Region Comparison Evidence**

- Navbar logo: inline PriceRunner SVG consumes `--header-logo`; dark value is now `#fafafa`.
- Navbar search: the real input is `#search` inside a `span`; autocomplete is a direct form child containing `/results`, `/pl/`, and `/cl/` links. Both surfaces have scoped opaque dark fills.
- Category navigation: generic host `div` and `button` backgrounds are no longer flattened, preserving PriceRunner's selected, hover, and elevated surfaces.
- Page controls: the theme action remains available on all matching PriceRunner pages, while the green sorter appears only on supported alerts routes.

**Findings**

- [P0] Post-fix browser capture blocked
  Location: live PriceRunner homepage, category navigation, navbar, and alerts page.
  Evidence: Chrome's already-running unpacked extension continues to execute the pre-build content script until the extension is reloaded.
  Impact: source, bundle, and DOM-target verification pass, but final updated-pixel comparison cannot be captured in the current browser instance.
  Fix: reload the unpacked extension once, then refresh PriceRunner.

**Required Fidelity Surfaces**

- Fonts and typography: PriceRunner-owned and unchanged.
- Spacing and layout rhythm: PriceRunner-owned; broad structural overrides removed.
- Colors and visual tokens: semantic page, content, input, text, border, icon, and logo tokens implemented.
- Image quality and asset fidelity: original PriceRunner assets retained; product imagery receives only a neutral image backing.
- Copy and content: unchanged except for the extension's theme/sort controls.

**Comparison History**

- Pass 1: broad dark selectors flattened host surfaces, broke search layering, and left the logo invisible.
- Pass 2: search shell and autocomplete received scoped opaque surfaces.
- Pass 3: dark mode migrated to PriceRunner's semantic tokens; homepage false-positive sorting removed; theme and sort controls separated.
- Automated evidence: 41 tests pass, production build succeeds, validation succeeds, and `git diff --check` passes.
- Live DOM evidence: current PriceRunner search and logo structures match the scoped selectors and token override.
- Final updated browser evidence: pending one unpacked-extension reload.

**Implementation Checklist**

- Reload unpacked extension.
- Refresh `https://www.pricerunner.se/` and confirm visible PriceRunner wordmark, native menu surfaces, theme control, and no sorter.
- Refresh `https://www.pricerunner.se/profile/alerts` and confirm theme plus sorter controls.
- Open navbar search with `wooting` and confirm opaque, non-overlapping autocomplete.
- Toggle light/dark once and check console errors.

**Follow-up Polish**

- None in source.

final result: blocked
