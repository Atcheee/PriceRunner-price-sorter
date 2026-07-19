export const THEME_MODES = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
});

export function normalizeTheme(mode) {
  if (mode === THEME_MODES.LIGHT || mode === THEME_MODES.DARK) return mode;
  return THEME_MODES.SYSTEM;
}

export function systemPrefersDark() {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches === true;
}

export function resolveIsDark(mode) {
  const normalized = normalizeTheme(mode);
  if (normalized === THEME_MODES.DARK) return true;
  if (normalized === THEME_MODES.LIGHT) return false;
  return systemPrefersDark();
}

export function applyTheme(mode) {
  const normalized = normalizeTheme(mode);
  const isDark = resolveIsDark(normalized);
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
  root.dataset.theme = normalized;
  return { mode: normalized, isDark };
}
