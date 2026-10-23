// Sestaví samostatnou ukázkovou stránku demo.html: rozhraní (Index.html) + serverový kód + simulace služeb Google, vše v jedné stránce.
// Běží celé v prohlížeči, se smyšlenými daty; nesahá do žádné skutečné tabulky ani schránky.
// Použití: node sestav_demo.js [výstup=demo.html]
//   demo.html          – přihlášený správce školy (ukázková data)
//   demo.html?anon=1   – nepřihlášený (úvodní obrazovka, registrace rodiče apod.)
// V pravém dolním rohu je „Ukázková pošta“: ukazuje e-maily, které by aplikace poslala (přihlašovací kódy, QR platby…).
const fs = require("fs"), path = require("path");
// Zdrojové soubory (tridni_fond.gs, webapp.gs, Index.html) jsou buď v kořeni projektu, nebo ve složce zdrojovy-kod (uspořádání na GitHubu).
const koren = path.resolve(__dirname, ".."), root = fs.existsSync(path.join(koren, "zdrojovy-kod", "webapp.gs")) ? path.join(koren, "zdrojovy-kod") : koren;
const out = process.argv[2] || path.join(__dirname, "demo.html");
const R = f => fs.readFileSync(path.join(root, f), "utf8");
// Ukázka se staví ze šablonové podoby (bez role vlastníka), aby v ní nebyl e-mail autora.
const webapp = R("webapp.gs").replace(/^var VLASTNIK_EMAIL = "[^"]*";/m, 'var VLASTNIK_EMAIL = "";');
const server = R("tridni_fond.gs") + "\n" + webapp;
const mocks = fs.readFileSync(path.join(__dirname, "mocks.js"), "utf8");
let index = R("Index.html");
if (/<\/script>/i.test(server + mocks)) throw new Error("Server nebo simulace obsahují </script>");

const sha = `
var __K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function __sha256bytes(bytes){var h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];var l=bytes.length,nb=((l+9+63)>>6)<<6,b=new Uint8Array(nb);b.set(bytes);b[l]=0x80;var dv=new DataView(b.buffer);dv.setUint32(nb-4,(l*8)>>>0);dv.setUint32(nb-8,Math.floor(l*8/4294967296));var w=new Uint32Array(64);function rr(x,n){return (x>>>n)|(x<<(32-n));}
for(var o=0;o<nb;o+=64){for(var i=0;i<16;i++)w[i]=dv.getUint32(o+i*4);for(i=16;i<64;i++){var s0=rr(w[i-15],7)^rr(w[i-15],18)^(w[i-15]>>>3),s1=rr(w[i-2],17)^rr(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}
var a=h[0],bb=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];for(i=0;i<64;i++){var S1=rr(e,6)^rr(e,11)^rr(e,25),ch=(e&f)^(~e&g),t1=(hh+S1+ch+__K[i]+w[i])|0,S0=rr(a,2)^rr(a,13)^rr(a,22),mj=(a&bb)^(a&c)^(bb&c),t2=(S0+mj)|0;hh=g;g=f;f=e;e=(d+t1)|0;d=c;c=bb;bb=a;a=(t1+t2)|0;}
h=[(h[0]+a)|0,(h[1]+bb)|0,(h[2]+c)|0,(h[3]+d)|0,(h[4]+e)|0,(h[5]+f)|0,(h[6]+g)|0,(h[7]+hh)|0];}
var out=[];h.forEach(function(x){out.push((x>>>24)&255,(x>>>16)&255,(x>>>8)&255,x&255);});return out;}
function __uuid4(){return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==="x"?r:(r&3|8)).toString(16);});}
var __crypto={createHash:function(){var d="";return {update:function(s){d=s;return this;},digest:function(){return __sha256bytes(Array.from(new TextEncoder().encode(d)));}};},randomUUID:function(){return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():__uuid4();}};
var Buffer={from:function(a){return {toString:function(){var s="";for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]&255);return btoa(s);}};}};
`;

const seed = `
(function(){
  var ANON = /[?&]anon=1/.test(location.search), LAT = 220;
  var JMENA = [["Novotná","Anna"],["Svoboda","Jakub"],["Dvořáková","Eliška"],["Černý","Matěj"],["Procházková","Tereza"],["Kučera","Filip"],["Veselá","Nela"],["Horák","Adam"],["Němcová","Sofie"],["Marek","Daniel"],["Pospíšilová","Lucie"],["Pokorný","Ondřej"],["Králová","Klára"],["Fiala","David"]];
  function trida(nazev, id, od, n) { var rows = [[], [], [], [], []]; rows.push(["SS →"]); rows.push(["Příjmení", "Jméno", "Gmail", "Variabilní symbol", "Částka", "E-mail rodiče"]); rows.push([]);
    for (var k = 0; k < n; k++) { var j = JMENA[(k + od) % JMENA.length]; rows.push([j[0], j[1], "zak" + id + "." + k + "@example.cz", String(310000 + id * 100 + k), 0, "rodic" + id + "." + k + "@example.cz"]); } return { name: nazev, id: id, rows: rows }; }
  __SS = __mkSpreadsheet([trida("5.A", 11, 0, 14), trida("5.B", 22, 5, 12)]);
  __props.TABULKA_ID = "SSID"; __props.TRIDY = "[11,22]";
  function C(a, args, t) { return JSON.parse(apiVolej(a, JSON.stringify(args || {}), t || "")); }
  function kod() { for (var i = __sent.length - 1; i >= 0; i--) { var m = __sent[i].text.match(/: (\\d{6})/); if (m) return m[1]; } return ""; }
  C("registrovat", { typ: "ucitel", jmeno: "Ukázkový správce", email: "admin@gmail.com", iban: "19-2000145399/0800", nazevUctu: "Třídní fond", skola: "ZŠ Ukázková", skolaId: "ukazkova.example.cz", heslo: "ukazkove-heslo-123", heslo2: "ukazkove-heslo-123" });
  C("registraceOverit", { email: "admin@gmail.com", kod: kod() });
  C("kodPoslat", { email: "admin@gmail.com" });
  var r1 = C("prihlasitKodem", { email: "admin@gmail.com", kod: kod() });
  var tok = C("prihlasitSpravce", { email: "admin@gmail.com", propustka: r1.data.propustka, heslo: "ukazkove-heslo-123" }).data.token;
  var sb = C("zalozitSbirku", { nazev: "Divadlo", skupiny: [
    { tridaId: 11, zaci: Array.from({ length: 14 }, function(_, i) { return { radek: 9 + i, castka: 180 }; }) },
    { tridaId: 22, zaci: Array.from({ length: 12 }, function(_, i) { return { radek: 9 + i, castka: 180 }; }) }] }, tok);
  C("zalozitSbirku", { nazev: "Fotografování", tridaId: 11, castka: 120 }, tok);
  var ss1 = sb.data.sbirky[0].specSymbol;
  function banka(id, vs, castka, od, ss) { __gmail.messages.push({ id: "b00000" + id, thread: "t" + id, from: od || "Air Bank <info@airbank.cz>", date: new Date(Date.now() - 86400000),
    body: "Dobrý den,\\nzůstatek na účtu Třídní fond číslo 19-2000145399/0800 se zvýšil o částku " + castka + ",00 CZK.\\nPříchozí úhrada z účtu Rodič číslo 123456789/0100\\nČástka: " + castka + ",00 CZK\\nDatum zaúčtování: 20.10.2026\\nVariabilní symbol: " + vs + "\\nSpecifický symbol: " + (ss || ss1) + "\\nZpráva pro příjemce: divadlo\\nKód transakce: 17" + id + "\\n" }); }
  for (var i = 0; i < 7; i++) banka(100 + i, 311100 + i, 180);
  banka(120, 311107, 100);
  banka(140, 311108, 180, "Air Bank <info@airbank.cz.neco.example>");      // „falešný“ e-mail: aplikace ho nezapočítá a ukáže proč
  var ss2 = sb.data.sbirky[1].specSymbol;
  for (var j = 0; j < 4; j++) banka(130 + j, 312200 + j, 180, null, ss2);       // druhá třída má vlastní specifický symbol
  C("zkontrolovatSkupinu", { skupina: sb.data.skupina }, tok);
  C("rucniPlatba", { tridaId: 11, colIndex: sb.data.sbirky[0].colIndex, radek: 17, prijmeni: "Horák", jmeno: "Adam", castka: 180, poznamka: "hotově" }, tok);
  __sent.length = 0;                                   // seed e-maily se nezobrazují
  __demoToken = ANON ? "" : tok;
  if (!ANON) { try { sessionStorage.setItem("tridniFondToken", tok); } catch (e) {} }
  else { try { sessionStorage.removeItem("tridniFondToken"); localStorage.removeItem("tridniFondToken"); } catch (e) {} }
  window.google = { script: { run: (function () { function mk() { var ok, fail, o = { withSuccessHandler: function (f) { ok = f; return o; }, withFailureHandler: function (f) { fail = f; return o; },
    apiVolej: function (a, j, t) { setTimeout(function () { try { var r = apiVolej(a, j, t); ok && ok(r); } catch (e) { fail && fail(e); } schranka(); }, LAT); } }; return o; }
    return { withSuccessHandler: function (f) { return mk().withSuccessHandler(f); }, withFailureHandler: function (f) { return mk().withFailureHandler(f); } }; })() } };

  // Ukázková pošta: co by aplikace odeslala
  var box = document.createElement("div");
  box.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:60;font:13px system-ui,sans-serif";
  box.innerHTML = '<button id="dm-btn" style="padding:8px 12px;border-radius:10px;border:1px solid #888;background:#fff;color:#111;cursor:pointer">✉ Ukázková pošta (0)</button>' +
    '<div id="dm-box" hidden style="margin-top:6px;width:min(420px,calc(100vw - 24px));max-height:55vh;overflow:auto;background:#fff;color:#111;border:1px solid #888;border-radius:10px;padding:10px"></div>';
  document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(box); });
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function schranka() {
    var b = document.getElementById("dm-btn"), p = document.getElementById("dm-box"); if (!b) return;
    b.textContent = "✉ Ukázková pošta (" + __sent.length + ")";
    p.innerHTML = '<div style="color:#555;margin-bottom:6px">Tohle je jen ukázka: aplikace by e-maily poslala přes Gmail školy. Tady vidíte jejich text (třeba přihlašovací kód).</div>' +
      (__sent.length ? __sent.slice().reverse().map(function (m) { return '<div style="border-top:1px solid #ddd;padding:6px 0"><b>Komu:</b> ' + esc(m.to) + '<br><b>Předmět:</b> ' + esc(m.subject) + '<pre style="white-space:pre-wrap;margin:4px 0 0;font:12px system-ui">' + esc(m.text) + "</pre></div>"; }).join("") : "<i>zatím nic</i>");
  }
  document.addEventListener("click", function (e) { if (e.target && e.target.id === "dm-btn") { var p = document.getElementById("dm-box"); p.hidden = !p.hidden; schranka(); } });
  window.__sent = __sent;
})();
`;

const marker = '<script>\n(function () {\n  "use strict";';
if (index.split(marker).length !== 2) throw new Error("V Index.html se nenašla značka hlavního skriptu");
index = index.replace(marker, () => "<script>\nvar __demoToken = '';\n" + sha + "\n" + server + "\n" + mocks + "\n" + seed + "\n</script>\n" + marker);   // funkce, aby se v kódu nevykládalo „$&“
index = index.replace("<title>Třídní fond</title>", '<title>Třídní fond – ukázka</title>\n<meta name="robots" content="noindex">');
const pruh = '<div id="demo-pruh" style="background:#fff3cd;color:#5c4400;padding:8px 14px;font:13px/1.4 system-ui,sans-serif;text-align:center;border-bottom:1px solid #e0c36a">' +
  '<b>Ukázková verze se smyšlenými daty.</b> Běží celá ve vašem prohlížeči, nic se neodesílá ani neukládá a po obnovení stránky se vrátí do původního stavu. ' +
  'E-maily, které by aplikace poslala (třeba přihlašovací kód), uvidíte vlevo dole v „Ukázkové poště“.</div>\n';
index = index.replace("<body>\n", () => "<body>\n" + pruh);
// kontrola: v ukázce nesmí zůstat osobní údaje autora (e-mail vlastníka, e-maily a IBAN z migrace_nastaveni.gs)
const puvodni = R("webapp.gs");
let zdroje = (puvodni.match(/^var VLASTNIK_EMAIL = "([^"]*)";/m) || [])[1] || "";
const migrace = path.join(root, "migrace_nastaveni.gs");
if (fs.existsSync(migrace)) zdroje += " " + fs.readFileSync(migrace, "utf8");
const osobni = [...new Set([...(zdroje.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []), ...(zdroje.match(/\bCZ\d{22}\b/g) || [])].map(x => x.toLowerCase()))];
const nalezeno = osobni.filter(x => index.toLowerCase().includes(x));
if (nalezeno.length) throw new Error("V ukázce zůstal osobní údaj autora: " + nalezeno.join(", "));
fs.writeFileSync(out, index);
console.log("Sestaveno:", out, Math.round(index.length / 1024) + " kB");
