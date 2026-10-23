// Spuštění: node run.js <složka s tridni_fond.gs a webapp.gs> <výstupní.json>
// Načte kód aplikace spolu se simulací služeb Google (mocks.js) a projde scénář (scenario.js). Výsledek (normalizovaný, ať jde
// porovnat dvě verze) uloží do JSON. QR kódy z odeslaných e-mailů se dekódují nezávislou čtečkou (jsQR).
const vm = require("vm"), fs = require("fs"), path = require("path");
const koren = path.resolve(__dirname, "..");
const dir = path.resolve(process.argv[2] || (fs.existsSync(path.join(koren, "zdrojovy-kod", "webapp.gs")) ? path.join(koren, "zdrojovy-kod") : koren)), out = process.argv[3] || "vysledek.json";
const jsQR = require("jsqr"), { PNG } = require("pngjs");
const code = ["tridni_fond.gs", "webapp.gs"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
const src = code + "\n" + fs.readFileSync(path.join(__dirname, "mocks.js"), "utf8") + "\n" + fs.readFileSync(path.join(__dirname, "scenario.js"), "utf8") + "\n__scenario();";
const ctx = vm.createContext({ __crypto: require("crypto"), Buffer, TextEncoder, console });
let res;
try { res = vm.runInContext(src, ctx, { filename: "app+mocks.js" }); } catch (e) { console.error("CHYBA scénáře:", e.stack.split("\n").slice(0, 6).join("\n")); process.exit(2); }
const qrs = res.sent.filter(m => m.opts && m.opts.inlineImages && m.opts.inlineImages.qrCodeImage).map(m => {
  const b = Buffer.from(m.opts.inlineImages.qrCodeImage.bytes.map(x => x & 255)); const png = PNG.sync.read(b);
  const q = jsQR(new Uint8ClampedArray(png.data), png.width, png.height); return { to: m.to, subject: m.subject, qr: q ? q.data : null, size: png.width };
});
let txt = JSON.stringify({ log: res.log, sent: res.sent.map(m => ({ to: m.to, subject: m.subject, text: m.text, html: (m.opts && m.opts.htmlBody) || "", name: m.opts && m.opts.name })), qrs, props: res.props }, null, 1);
const map = {}; let n = 0; const id = (p, v) => map[p + v] || (map[p + v] = "<" + p + (++n) + ">");
txt = txt.replace(/data:image\/png;base64,[A-Za-z0-9+\/=]+/g, "<PNG>").replace(/"(token|propustka)": "[^"]+"/g, '"$1": "<T>"').replace(/\b[0-9a-f]{24,}\b/g, v => id("H", v))
  .replace(/\b1[78][0-9]{8}\b/g, v => id("SS", v)).replace(/\b1[78][0-9]{11}\b/g, "0")
  .replace(/20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z/g, "<TS>").replace(/\d+\. \d+\. 20\d\d \d+:\d\d/g, "<DT>")
  .replace(/RUCNE-[0-9a-f]{12}/g, "RUCNE-<id>").replace(/(RELACE_|UZIVATEL_G|KOD_|SBIRKA_[A-Z]+_|ADMPROP_|DITELIM_[RD]_)[0-9a-zA-Z<>_]+/g, "$1<k>")
  .replace(/Váš kód pro ([^:]+): \d{6}/g, "Váš kód pro $1: <KOD>").replace(/váš kód \d{6}/g, "váš kód <KOD>").replace(/kód pro propojení rodiče: \d{6}/g, "kód pro propojení rodiče: <KOD>")
  .replace(/tento kód: \d{6}/g, "tento kód: <KOD>");
fs.writeFileSync(out, txt);
console.log("OK", out, txt.length, "B; QR e-mailů:", qrs.length, "dekódováno:", qrs.filter(q => q.qr).length);
