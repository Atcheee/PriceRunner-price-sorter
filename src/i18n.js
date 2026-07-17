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
    description: "Välj ordning. Ogiltiga rader döljs aldrig.",
    modeLabel: "Sorteringsläge",
    apply: "Sortera",
    restore: "Återställ",
    export: "Exportera CSV",
  },
  privacy: {
    title: "Integritet och inställningar",
    description: "Endast lokala funktioner och lokala preferenser.",
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
  },
};

export const sortModes = [
  {
    value: "absoluteSaving",
    label: "Störst besparing",
    description: "Startpris minus pris nu, högst belopp först.",
  },
  {
    value: "percentageSaving",
    label: "Högst rabatt",
    description: "(Startpris minus pris nu) delat med startpris.",
  },
  {
    value: "currentPrice",
    label: "Lägst pris nu",
    description: "Lägsta läsbara aktuella pris först.",
  },
  {
    value: "unitPrice",
    label: "Lägst jämförpris",
    description: "Lägsta läsbara enhetspris först när det finns.",
  },
  {
    value: "original",
    label: "Ursprunglig ordning",
    description: "Återställer ordningen från när listan först lästes.",
  },
];
