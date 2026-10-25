# PriceRunner Extension 2.0

Fokuserad bevakningsassistent för PriceRunner. Tillägget sorterar, analyserar och exporterar den öppna bevakningslistan lokalt utan konto, spårning eller datainsamling.

## Funktioner

- Sortering efter högst rabatt, störst besparing, lägst aktuellt pris eller lägst jämförpris när det finns.
- Stabil återställning till listans ursprungliga ordning.
- Laddning av hela bevakningslistan fortsätter även när du byter flik, innan listan sorteras.
- Otillgängliga, saknade och oläsbara rader döljs aldrig. De grupperas tydligt längst ned.
- Parserstatus med antal produkter, läsbara priser, otillgängliga produkter, största besparing och varningar.
- Lokal CSV-export med produktnamn, URL, startpris, aktuellt pris, besparing, rabatt, lagerstatus och tidpunkt.
- Svensk förstahandstext med copy samlad i `src/i18n.js` för framtida språk.
- Tangentbordsstöd, synliga fokuslägen, reducerad rörelse och forced-colors-stöd.
- Växling mellan ljust, mörkt och systemstyrt färgläge för både PriceRunner-sidan och popupen.

Besparing beräknas som `startpris - pris nu`. Rabatt i procent beräknas som `(startpris - pris nu) / startpris × 100`.

## Sidstatus

Popupen skiljer mellan:

- stödd och frisk bevakningslista;
- tom lista;
- delvis misslyckad eller möjlig stale parser;
- alla produkter otillgängliga;
- sida som inte stöds;
- genomförd sortering, återställning eller export.

Tillägget visar inte ett lyckat resultat när sidstrukturen inte känns igen.

## Behörigheter

Manifest V3 använder bara:

- `storage`: sparar lokala preferenser för sorteringsläge, färgläge och om sidknappen ska visas.
- Statiska content-script-matchningar för de uttryckligen stödda PriceRunner-domänerna nedan. Ingen `<all_urls>`, historik, cookies, webRequest, downloads eller fjärrkod används.

Popupen behöver inte `tabs`-behörigheten. Den skickar bara meddelanden till den aktiva fliken efter att användaren öppnat popupen.

## Stödda domäner

- `https://*.pricerunner.se/*`
- `https://*.pricerunner.dk/*`
- `https://*.pricerunner.no/*`
- `https://*.pricerunner.fi/*`
- `https://*.pricerunner.com/*`

Content script laddas på dessa domäner, men kontrollen visas endast när en semantiskt igenkänd bevakningslista hittas.

## Integritet

- Produktdata och priser läses bara från den öppna sidan.
- Sortering, beräkningar och CSV skapas lokalt i webbläsaren.
- Ingen produktdata, webbhistorik eller telemetri skickas till utvecklaren eller tredje part.
- Ingen affiliate-injektion, reklam, prispåverkan eller försäljning av användardata.
- `chrome.storage.local` innehåller bara användarens UI-preferenser.
- CSV-fält skyddas mot kalkylbladsformler från sidinnehåll.

Fullständig kort policy finns i [PRIVACY.md](PRIVACY.md).

## Utveckling

Krav: Node.js 24+ och npm.

```powershell
npm install
npm test
npm run build
npm run validate
```

Popupen använder React i JavaScript, Tailwind CSS, shadcn/ui-primitiver och licensierad `radix-nova`-stil från shadcndesign. Parser och content script förblir vanlig JavaScript. Licensierad Pro-källkod får inte publiceras separat eller flyttas till ett öppet komponentbibliotek.

För registry-utveckling kopieras `.env.example` till `.env.local` och den privata nyckeln sätts som `SHADCNDESIGN_LICENSE_KEY`. `.env.local` är ignorerad. Nyckeln får aldrig läggas i frontendvariabler, källkod, loggar eller commits.

## Installera lokalt

1. Kör `npm install` och `npm run build`.
2. Öppna `chrome://extensions` eller `brave://extensions`.
3. Aktivera utvecklarläge.
4. Välj **Load unpacked** och välj projektroten.
5. Öppna en stödd PriceRunner-bevakningslista och ladda om sidan.

## Testning

`npm test` täcker:

- mellanslag, NBSP, smalt NBSP, decimalpunkt, decimalkomma, valutasuffix och Unicode-streck;
- rena produktmodeller, besparing och rabatt;
- stabil sortering, originalordning och ogiltig radgrupp;
- normala, saknade, ändrade klassnamn, lokaliserade priser och slut-i-lager-fixtures;
- idempotent kontrollinjektion och debounced MutationObserver;
- parserhälsa och CSV-formelskydd.

Manuell smoke-checklista för både Chrome och Brave:

- Ladda unpacked från projektroten utan manifestfel.
- Verifiera att popupen visar **Stöds inte** på vanlig PriceRunner-sida.
- Öppna stödd bevakningslista och kontrollera totaler samt parserstatus.
- Prova alla fyra sorteringslägen och kontrollera invalid-gruppen.
- Klicka **Sortera efter rabatt**, byt direkt till en annan flik och kontrollera att hela listan laddas och sorteras utan ett andra klick.
- Välj **Ursprunglig ordning** och kontrollera exakt återställning.
- Exportera CSV och kontrollera kolumner, UTF-8 och tidpunkt.
- Stäng av sidknappen, ladda om och kontrollera att preferensen sparas.
- Kontrollera tangentbord, zoom, high contrast och reduced motion.
- Bekräfta i DevTools Network att ingen produktdata skickas.

## Felsökning

- **Stöds inte:** kontrollera att sidan verkligen är en bevakningslista. Parsern kräver semantiska prisrubriker eller kända radattribut.
- **Parservarning:** PriceRunner kan ha ändrat struktur eller enskilda rader saknar pris/URL. Raderna ligger kvar och exporteras med tomma värden.
- **Ingen sidknapp:** kontrollera popupens inställning **Visa knapp på sidan** och ladda om fliken efter extension-uppdatering.
- **Popup saknas:** kör `npm run build`; manifestet pekar på `dist/popup.html`.
- **Registry 401:** använd officiella variabeln `SHADCNDESIGN_LICENSE_KEY` i ignorerad `.env.local`.

## Produktionspaket

```powershell
npm run package
```

Kommandot testar, bygger, validerar manifest/runtimefiler och skapar `release/pricerunner-extension-2.0.0.zip`. Paketet innehåller endast runtimefiler, ikoner, README och integritetspolicy; inga tester, `.env`-filer, registrykonfigurationer eller utvecklingsberoenden.

## Chrome Web Store-checklista

- [ ] En enda tydlig purpose: lokal hantering av PriceRunner-bevakningslistor.
- [ ] Version, namn, beskrivning och ikoner verifierade.
- [ ] Behörighetsmotiveringar matchar faktisk kod.
- [ ] Privacy disclosure och Developer Dashboard-datafält matchar lokal behandling.
- [ ] Minst en korrekt skärmbild av faktisk produktupplevelse.
- [ ] Ingen fjärrkod, `eval`, CDN-script eller externt körd logik.
- [ ] Chrome- och Brave-smoke genomförd på riktig stödd sida.
- [ ] Produktionszip validerad och installerad som unpacked före uppladdning.
- [ ] Store-text nämner ingen koppling till eller officiell status hos PriceRunner.

## Framtida monetisering

Gratis kärna förblir lokal sortering och CSV. Ett framtida konto får endast lägga till uttryckligt opt-in för molnbevakningar, notiser och egna regler med tydlig betalningsinformation. Browsing activity eller användardata får aldrig monetiseras.
