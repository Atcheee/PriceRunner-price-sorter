import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  ListFilter,
  Monitor,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  copy,
  normalizeSavingSortMode,
  SAVING_SORT_MODES,
  sortModes,
} from "@/i18n";
import { cn } from "@/lib/utils";
import { applyTheme, normalizeTheme, THEME_MODES } from "@/theme";

const DEFAULT_PAGE_STATE = {
  supported: false,
  reason: "loading",
  selectorTier: null,
  summary: {
    state: "loading",
    totalProducts: 0,
    readablePrices: 0,
    unavailableItems: 0,
    parserFailures: 0,
    largestSaving: null,
    staleParserWarning: false,
  },
};

const THEME_OPTIONS = [
  { value: THEME_MODES.LIGHT, label: copy.privacy.themeLight, icon: Sun },
  { value: THEME_MODES.DARK, label: copy.privacy.themeDark, icon: Moon },
  { value: THEME_MODES.SYSTEM, label: copy.privacy.themeSystem, icon: Monitor },
];

const THEME_ANNOUNCEMENTS = {
  [THEME_MODES.LIGHT]: copy.actions.themeLight,
  [THEME_MODES.DARK]: copy.actions.themeDark,
  [THEME_MODES.SYSTEM]: copy.actions.themeSystem,
};

const HEALTH_PRESENTATION = {
  healthy: { label: copy.health.healthy, icon: CheckCircle2, className: "text-emerald-700 dark:text-emerald-400" },
  partial: { label: copy.health.partial, icon: AlertTriangle, className: "text-amber-700 dark:text-amber-400" },
  "all-unavailable": { label: copy.health.allUnavailable, icon: AlertTriangle, className: "text-amber-700 dark:text-amber-400" },
  "zero-products": { label: copy.health.zeroProducts, icon: XCircle, className: "text-muted-foreground" },
  unsupported: { label: copy.health.unsupported, icon: XCircle, className: "text-destructive" },
  loading: { label: copy.health.loading, icon: ListFilter, className: "text-muted-foreground" },
};

function formatCurrency(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 2,
  }).format(value);
}

async function getActiveTab() {
  const tabs = await globalThis.chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

async function sendToTab(tabId, message) {
  if (!tabId) throw new Error("active-tab-missing");
  return globalThis.chrome.tabs.sendMessage(tabId, message);
}

function Metric({ label, value }) {
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground text-[11px] leading-none">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PageHealth({ pageState }) {
  const health = HEALTH_PRESENTATION[pageState.summary.state] ?? HEALTH_PRESENTATION.unsupported;
  const HealthIcon = health.icon;

  return (
    <Card>
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{copy.currentPage.title}</CardTitle>
            <CardDescription>{copy.currentPage.description}</CardDescription>
          </div>
          <Badge variant="outline" className={health.className}>
            <HealthIcon data-icon="inline-start" />
            {health.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {pageState.supported ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border bg-muted/35 p-3">
            <Metric label={copy.metrics.total} value={pageState.summary.totalProducts} />
            <Metric label={copy.metrics.readable} value={pageState.summary.readablePrices} />
            <Metric label={copy.metrics.unavailable} value={pageState.summary.unavailableItems} />
            <Metric label={copy.metrics.largestSaving} value={formatCurrency(pageState.summary.largestSaving)} />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
            {copy.currentPage.unsupported}
          </p>
        )}
        {pageState.summary.staleParserWarning && (
          <div className="flex gap-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300" role="status">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{copy.currentPage.parserWarning}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SortModeToggle({ value, onChange, disabled }) {
  return (
    <div
      role="radiogroup"
      aria-label={copy.sort.modeLabel}
      className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1"
    >
      {sortModes.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-semibold transition-colors outline-none",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-50",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.shortLabel === "%" ? copy.sort.percent : copy.sort.kr}
          </button>
        );
      })}
    </div>
  );
}

function ThemeToggle({ value, onChange, disabled }) {
  return (
    <div
      role="radiogroup"
      aria-label={copy.privacy.themeLabel}
      className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1"
    >
      {THEME_OPTIONS.map((option) => {
        const selected = value === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold transition-colors outline-none",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-50",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Settings3({ initialTheme = THEME_MODES.SYSTEM }) {
  const [tabId, setTabId] = useState(null);
  const [pageState, setPageState] = useState(DEFAULT_PAGE_STATE);
  const [sortMode, setSortMode] = useState(SAVING_SORT_MODES.PERCENTAGE);
  const [theme, setTheme] = useState(() => normalizeTheme(initialTheme));
  const [showPageControl, setShowPageControl] = useState(true);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const canAnalyze = pageState.supported && pageState.summary.totalProducts > 0;
  const selectedMode = useMemo(
    () => sortModes.find((option) => option.value === sortMode) ?? sortModes[0],
    [sortMode],
  );

  useEffect(() => {
    applyTheme(theme);
    if (theme !== THEME_MODES.SYSTEM) return undefined;

    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;

    const onChange = () => applyTheme(THEME_MODES.SYSTEM);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [tab, preferences] = await Promise.all([
          getActiveTab(),
          globalThis.chrome.storage.local.get({
            sortMode: SAVING_SORT_MODES.PERCENTAGE,
            theme: THEME_MODES.SYSTEM,
            showPageControl: true,
          }),
        ]);
        if (!active) return;
        setTabId(tab?.id ?? null);
        setSortMode(normalizeSavingSortMode(preferences.sortMode));
        setTheme(normalizeTheme(preferences.theme));
        setShowPageControl(preferences.showPageControl);
        const response = await sendToTab(tab?.id, { type: "PRICESORTER_GET_STATE" });
        if (active && response?.summary) setPageState(response);
      } catch (_error) {
        if (active) setPageState({ ...DEFAULT_PAGE_STATE, reason: "content-script-unavailable", summary: { ...DEFAULT_PAGE_STATE.summary, state: "unsupported" } });
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  async function handleSortModeChange(mode) {
    const nextMode = normalizeSavingSortMode(mode);
    setSortMode(nextMode);
    await globalThis.chrome.storage.local.set({ sortMode: nextMode });
  }

  async function handleThemeChange(mode) {
    const nextTheme = normalizeTheme(mode);
    setTheme(nextTheme);
    applyTheme(nextTheme);
    await globalThis.chrome.storage.local.set({ theme: nextTheme });
    setAnnouncement(THEME_ANNOUNCEMENTS[nextTheme]);
  }

  async function handleSort(mode = sortMode) {
    setBusy(true);
    setAnnouncement(copy.actions.working);
    try {
      const response = await sendToTab(tabId, { type: "PRICESORTER_SORT", mode });
      if (!response?.applied) {
        setAnnouncement(copy.actions.sortUnavailable);
      } else {
        setPageState(response);
        if (mode === "original") {
          setAnnouncement(copy.actions.restored);
        } else {
          const modeLabel =
            sortModes.find((option) => option.value === mode)?.label ?? selectedMode.label;
          setAnnouncement(`${copy.actions.sorted} ${modeLabel}.`);
        }
      }
    } catch (_error) {
      setAnnouncement(copy.actions.reload);
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    setAnnouncement(copy.actions.working);
    try {
      const response = await sendToTab(tabId, { type: "PRICESORTER_EXPORT_CSV" });
      setAnnouncement(
        response?.exported
          ? `${copy.actions.exported} ${response.count} ${copy.actions.products}.`
          : copy.actions.exportUnavailable,
      );
    } catch (_error) {
      setAnnouncement(copy.actions.reload);
    } finally {
      setBusy(false);
    }
  }

  async function handlePageControl(checked) {
    setShowPageControl(checked);
    await globalThis.chrome.storage.local.set({ showPageControl: checked });
    try {
      await sendToTab(tabId, { type: "PRICESORTER_SET_PAGE_CONTROL", enabled: checked });
    } catch (_error) {
      // Preference remains saved for next supported page load.
    }
    setAnnouncement(checked ? copy.actions.controlShown : copy.actions.controlHidden);
  }

  return (
    <main className="w-[380px] space-y-3 bg-background p-3 text-foreground">
      <header className="flex items-center justify-between gap-3 px-1 py-1">
        <div>
          <p className="text-sm font-semibold tracking-tight">{copy.productName}</p>
          <p className="text-muted-foreground text-xs">{copy.tagline}</p>
        </div>
        <Badge variant="secondary">2.0</Badge>
      </header>

      <PageHealth pageState={pageState} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{copy.sort.title}</CardTitle>
          <CardDescription>{copy.sort.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SortModeToggle
            value={sortMode}
            onChange={handleSortModeChange}
            disabled={busy}
          />
          <p className="text-muted-foreground text-[11px] leading-relaxed">{selectedMode.description}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => handleSort(sortMode)} disabled={!canAnalyze || busy}>
              <ListFilter />
              {copy.sort.apply}
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={!canAnalyze || busy}>
              <Download />
              {copy.sort.export}
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => handleSort("original")}
            disabled={!canAnalyze || busy}
          >
            <RotateCcw />
            {copy.sort.restore}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{copy.privacy.title}</CardTitle>
          <CardDescription>{copy.privacy.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">{copy.privacy.theme}</p>
              <p className="text-muted-foreground text-[11px] leading-relaxed">{copy.privacy.themeDescription}</p>
            </div>
            <ThemeToggle value={theme} onChange={handleThemeChange} disabled={busy} />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 gap-2">
              {showPageControl ? <Eye className="mt-0.5 size-4 shrink-0" /> : <EyeOff className="mt-0.5 size-4 shrink-0" />}
              <div>
                <label htmlFor="page-control" className="text-sm font-medium">{copy.privacy.pageControl}</label>
                <p className="text-muted-foreground text-[11px] leading-relaxed">{copy.privacy.pageControlDescription}</p>
              </div>
            </div>
            <Switch
              id="page-control"
              checked={showPageControl}
              onCheckedChange={handlePageControl}
              aria-label={copy.privacy.pageControl}
            />
          </div>
          <Separator />
          <div className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <span>{copy.privacy.localOnly}</span>
          </div>
        </CardContent>
      </Card>

      <p className="min-h-4 px-1 text-center text-[11px] text-muted-foreground" aria-live="polite">
        {announcement}
      </p>
    </main>
  );
}
