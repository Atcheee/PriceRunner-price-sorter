import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Settings3 } from "@/components/settings-3";
import { applyTheme, normalizeTheme, THEME_MODES } from "@/theme";
import "./index.css";

async function readStoredTheme() {
  try {
    const preferences = await globalThis.chrome?.storage?.local?.get?.({
      theme: THEME_MODES.SYSTEM,
    });
    return normalizeTheme(preferences?.theme);
  } catch (_error) {
    return THEME_MODES.SYSTEM;
  }
}

async function boot() {
  const theme = await readStoredTheme();
  applyTheme(theme);

  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <Settings3 initialTheme={theme} />
    </StrictMode>,
  );
}

boot();
