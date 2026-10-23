// Porovná dva výsledky scénáře (run.js): node porovnej.js zaklad.json vysledek.json  – vypíše, které položky se liší.
const a = require("./" + process.argv[2]), b = require("./" + process.argv[3]);
function cesty(x, y, p, out) {
  if (JSON.stringify(x) === JSON.stringify(y)) return;
  if (x && y && typeof x === "object" && typeof y === "object" && Array.isArray(x) === Array.isArray(y)) {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) cesty(x[k], y[k], p + "/" + k, out);
  } else out.push([p, JSON.stringify(x), JSON.stringify(y)]);
}
const popisky = a.log.map(r => r[0]), out = []; cesty(a.log, b.log, "", out);
const skupiny = {}; out.forEach(([p, x, y]) => { const i = Number(p.split("/")[1]); const k = (b.log[i] || a.log[i] || ["?"])[0]; (skupiny[k] = skupiny[k] || []).push([p, x, y]); });
console.log("kroků se změnou:", Object.keys(skupiny).length, "z", b.log.length);
Object.keys(skupiny).forEach(k => { console.log("•", k, "(" + skupiny[k].length + ")"); skupiny[k].slice(0, 2).forEach(([p, x, y]) => console.log("    ", p.split("/").slice(2).join("/"), "|", String(x).slice(0, 70), "→", String(y).slice(0, 70))); });
