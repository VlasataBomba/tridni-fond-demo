# Testy a ukázková stránka

Vše běží v simulovaném prostředí Google (tabulka, Gmail, vlastnosti skriptu) – bez připojení k Googlu a bez skutečných dat.

```bash
cd testy
npm install                      # jednou (jsqr + pngjs pro kontrolu QR kódů)
node run.js                      # projde scénář (scenario.js) nad zdrojovým kódem (v kořeni projektu, na GitHubu ve složce zdrojovy-kod)
node sestav_demo.js              # sestaví demo.html (celá aplikace v jedné stránce se smyšlenými daty)
```

- `run.js` vypíše počet QR e-mailů a kolik se jich dalo dekódovat nezávislou čtečkou (musí sedět všechny). Výsledek je normalizovaný, takže dvě verze jdou porovnat obyčejným `diff` (nebo `git stash` + dva běhy).
- `demo.html` se otevírá přes místní server (např. `python3 -m http.server --directory testy`); `demo.html?anon=1` začíná nepřihlášený (registrace, přihlášení, ověření rodiče přes dítě). Vpravo dole je „Ukázková pošta“ – e-maily, které by aplikace poslala (přihlašovací kódy apod.).
- Do repozitáře se `demo.html` ani `vysledek.json` nedávají (jsou v `.gitignore`).
