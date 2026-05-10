const statusEl = document.getElementById("status");
const sortBtn = document.getElementById("sort-now");

function setStatus(message) {
  statusEl.textContent = message;
}

async function sortInActiveTab() {
  setStatus("Jobbar...");

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab?.id) {
    setStatus("Ingen aktiv flik hittades.");
    return;
  }

  const url = activeTab.url || "";
  if (!url.includes("pricerunner.")) {
    setStatus("Öppna en PriceRunner-sida först.");
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, { type: "PRICESORTER_SORT_NOW" });
    if (!response?.applied) {
      setStatus("Kunde inte hitta rätt radgrupp att sortera.");
    } else if (!response.changed) {
      setStatus("Ingen synlig ordningsskillnad hittades.");
    } else {
      setStatus("Sorterat: största skillnad först.");
    }
  } catch (_error) {
    setStatus("Ladda om sidan och försök igen.");
  }
}

sortBtn.addEventListener("click", () => {
  sortInActiveTab();
});
