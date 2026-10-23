// Připraví soubory pro šablonu určenou školám: node sestav_sablonu.js  →  testy/sablona/{tridni_fond.gs, webapp.gs, Index.html}
// Z webapp.gs se odstraní role vlastníka (VLASTNIK_EMAIL = ""), zkontroluje se, že v souborech nezůstal žádný osobní údaj autora.
// Soubory pak vložte do projektu Apps Script šablony (Kód.gs = tridni_fond.gs, webapp.gs, Index.html) a uložte.
const fs = require("fs"), path = require("path");
// Zdrojové soubory (tridni_fond.gs, webapp.gs, Index.html) jsou buď v kořeni projektu, nebo ve složce zdrojovy-kod (uspořádání na GitHubu).
const koren = path.resolve(__dirname, ".."), root = fs.existsSync(path.join(koren, "zdrojovy-kod", "webapp.gs")) ? path.join(koren, "zdrojovy-kod") : koren;
const out = path.join(__dirname, "sablona");
fs.mkdirSync(out, { recursive: true });
const webapp = fs.readFileSync(path.join(root, "webapp.gs"), "utf8").replace(/^var VLASTNIK_EMAIL = "[^"]*";/m, 'var VLASTNIK_EMAIL = "";');
if (!/^var VLASTNIK_EMAIL = "";/m.test(webapp)) throw new Error("VLASTNIK_EMAIL se nepodařilo vyprázdnit");
fs.writeFileSync(path.join(out, "webapp.gs"), webapp);
for (const f of ["tridni_fond.gs", "Index.html"]) fs.copyFileSync(path.join(root, f), path.join(out, f));
// Osobní údaje autora se hledají podle toho, co je v projektu: e-mail vlastníka z webapp.gs a všechny e-maily a čísla účtů (IBAN) z migrace_nastaveni.gs (soubor jen pro autora). Testy (scenario.js) mají autorův IBAN záměrně; do šablony se nedostane.
const puvodniWebapp = fs.readFileSync(path.join(root, "webapp.gs"), "utf8");
let zdroje = (puvodniWebapp.match(/^var VLASTNIK_EMAIL = "([^"]*)";/m) || [])[1] || "";
const migrace = path.join(root, "migrace_nastaveni.gs");
if (fs.existsSync(migrace)) zdroje += " " + fs.readFileSync(migrace, "utf8");
const osobni = [...new Set([...(zdroje.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []), ...(zdroje.match(/\bCZ\d{22}\b/g) || [])].map(x => x.toLowerCase()))];   // e-maily a IBAN autora
for (const f of fs.readdirSync(out)) {
  const obsah = fs.readFileSync(path.join(out, f), "utf8").toLowerCase();
  const nalezeno = osobni.filter(x => obsah.includes(x));
  if (nalezeno.length) throw new Error("V souboru " + f + " zůstal osobní údaj autora: " + nalezeno.join(", "));
}
console.log("Hotovo:", out, "(verze " + (webapp.match(/VERZE_APLIKACE = "([^"]+)"/) || [])[1] + ", bez osobních údajů)");
