export const copy = {
  productName: "PriceRunner Extension",
  tagline: "Sortera, granska och exportera lokalt",
  health: {
    healthy: "Redo",
    partial: "Parservarning",
    allUnavailable: "Inga tillgängliga",
    zeroProducts: "Tom lista",
    unsupported: "Stöds inte",
    loading: "Kontrollerar",
  },
  currentPage: {
    title: "Aktuell sida",
    description: "Parserstatus för den öppna bevakningslistan.",
    unsupported: "Öppna en PriceRunner-bevakningslista. Tillägget visar aldrig ett falskt lyckat resultat på andra sidor.",
    parserWarning: "Vissa rader kunde inte läsas säkert. De ligger kvar och grupperas längst ned.",
  },
  metrics: {
    total: "Bevakade",
    readable: "Läsbara priser",
    unavailable: "Otillgängliga",
    largestSaving: "Största besparing",
  },
  sort: {
    title: "Sortering och export",
    description: "Byt mellan sparat belopp och rabatt. Ogiltiga rader döljs aldrig.",
    modeLabel: "Sorteringsläge",
    kr: "kr",
    percent: "%",
    apply: "Sortera",
    restore: "Återställ",
    export: "Exportera CSV",
  },
  privacy: {
    title: "Integritet och inställningar",
    description: "Endast lokala funktioner och lokala preferenser.",
    theme: "Utseende",
    themeLabel: "Färgläge",
    themeDescription: "Styr både PriceRunner-sidan och tillägget. Välj ljust, mörkt eller system.",
    themeLight: "Ljust",
    themeDark: "Mörkt",
    themeSystem: "System",
    pageControl: "Visa knapp på sidan",
    pageControlDescription: "Visas bara när en bevakningslista känns igen.",
    localOnly: "Produktdata, priser, sortering och CSV lämnar aldrig webbläsaren. Ingen analys, reklam eller affiliate-data skickas.",
  },
  actions: {
    working: "Arbetar…",
    sorted: "Sorterat efter",
    restored: "Ursprunglig ordning återställd.",
    sortUnavailable: "Sortering är inte tillgänglig på den här sidan.",
    exported: "CSV exporterad med",
    products: "produkter",
    exportUnavailable: "Det finns inga läsbara produktrader att exportera.",
    reload: "Ladda om PriceRunner-sidan och försök igen.",
    controlShown: "Sidknappen visas på stödda listor.",
    controlHidden: "Sidknappen är dold.",
    themeLight: "Ljust läge aktiverat på sidan och i tillägget.",
    themeDark: "Mörkt läge aktiverat på sidan och i tillägget.",
    themeSystem: "Sidan och tillägget följer systemets färgläge.",
  },
};

export const SAVING_SORT_MODES = Object.freeze({
  PERCENTAGE: "percentageSaving",
  ABSOLUTE: "absoluteSaving",
});

export const sortModes = [
  {
    value: SAVING_SORT_MODES.PERCENTAGE,
    shortLabel: "%",
    label: "Högst rabatt",
    description: "Sorterar efter sparad procent: (startpris − pris nu) / startpris.",
  },
  {
    value: SAVING_SORT_MODES.ABSOLUTE,
    shortLabel: "kr",
    label: "Störst besparing",
    description: "Sorterar efter sparat belopp: startpris − pris nu, högst först.",
  },
];

export function normalizeSavingSortMode(mode) {
  if (mode === SAVING_SORT_MODES.ABSOLUTE) return SAVING_SORT_MODES.ABSOLUTE;
  return SAVING_SORT_MODES.PERCENTAGE;
}
