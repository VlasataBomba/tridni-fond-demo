// =============================================================
// TŘÍDNÍ FOND – správa sbírek, QR platby, kontrola plateb v Gmailu,
// automatická hodinová kontrola, souhrn pod tabulkou a historie plateb
// =============================================================

// ---------- NASTAVENÍ ----------
// Údaje konkrétní školy (číslo účtu, e-maily, název) se v kódu NEZADÁVAJÍ – nastavují se v aplikaci
// (první spuštění a Nastavení) a ukládají se do vlastností skriptu. Kód je tak pro všechny školy stejný.
var POVOLENE_BANKOVNI_DOMENY = [
  "airbank.cz", "fio.cz", "csas.cz", "kb.cz", "csob.cz", "moneta.cz", "rb.cz", "raiffeisenbank.cz", "mbank.cz",
  "creditas.cz", "unicreditbank.cz", "equabank.cz", "trinitybank.cz", "oberbank.cz", "partners.cz", "ppfbanka.cz"
];
var STITEK_RODIC = "Třídní fond";   // nadřazený štítek, pod ním vznikají štítky jednotlivých sbírek
var LIST_HISTORIE = "Historie plateb";
var LIST_ODESLANE = "Odeslané e-maily";   // přehled, komu už e-mail s QR / připomínkou odešel
var MAX_IMPORT_RADKU = 200;         // nejvíc řádků najednou při vkládání žáků do třídy
var HLEDAT_DNI = 90;               // záložní okno hledání, když SS není časové razítko
var AUTO_KONTROLA_MAX_DNI = 180;    // automatika přestane hlídat sbírky starší než tohle (ruční kontrola jde pořád)
var MAX_VLAKEN = 1000;              // pojistka proti nekonečnému stránkování
var PREFIX_RUCNE = "RUCNE-";        // ID ručně zadané platby v historii (platby z Gmailu mají ID zprávy)
var AUTO_MIN_ODSTUP_MS = 5 * 60 * 1000;   // pojistka: automatická kontrola nejde spustit častěji než jednou za 5 minut
var MAX_CASTKA = 100000;            // pojistka proti překlepu (částka na žáka / ruční platba)

var HISTORIE_HLAVICKA = [
  "Datum a čas platby", "Sbírka", "Specifický symbol", "Žák",
  "Variabilní symbol", "Částka (Kč)", "Poznámka", "E-mail s platbou", "ID zprávy"
];

// Regulární výraz pro částku: "500", "250,50", "1 500,00", "1.500,00"
var CASTKA_RE = "([0-9]{1,3}(?:[ \\u00a0.][0-9]{3})+(?:,[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)";

// ---------- OBECNÉ POMOCNÉ FUNKCE ----------
function removeAccents_(str) {
  return str ? String(str).normalize("NFD").replace(/[̀-ͯ]/g, "") : "";
}

function getColIndex_(colStr) {
  colStr = String(colStr || "").toUpperCase().trim();
  if (!/^[A-Z]+$/.test(colStr)) return 0;
  var col = 0;
  for (var i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  return col;
}

function getColLetter_(colIndex) {
  var temp, letter = '';
  while (colIndex > 0) {
    temp = (colIndex - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    colIndex = Math.floor((colIndex - temp) / 26);
  }
  return letter;
}

function getNejnovejsiSloupecIndex_(sheet) {
  var userProperties = PropertiesService.getUserProperties();
  var lastColProp = userProperties.getProperty('POSLEDNI_SLOUPEC');
  if (lastColProp) {
    var colIdx = parseInt(lastColProp, 10);
    if (colIdx >= 7 && sheet.getRange(7, colIdx).getValue() !== "") return colIdx;
  }
  var lastColumn = sheet.getLastColumn();
  for (var col = lastColumn; col >= 7; col--) {
    if (sheet.getRange(7, col).getValue() !== "") return col;
  }
  return 7;
}

function generateTimestampSpecSymbol_() {
  return Math.floor(Date.now() / 1000).toString();
}

// SS = časové razítko; v celé tabulce (všech třídách) se nesmí opakovat, protože podle něj se hledají platby.
function unikatniSS_() {
  var pouzite = {}, tridy = seznamVsechTrid_();      // i archivované třídy: jejich SS se nesmí znovu použít
  for (var t = 0; t < tridy.length; t++) {
    var sb = najdiSbirky_(tridy[t].list);
    for (var i = 0; i < sb.length; i++) pouzite[sb[i].specSymbol] = true;
  }
  var ss = parseInt(generateTimestampSpecSymbol_(), 10);
  while (pouzite[String(ss)]) ss++;
  return String(ss);
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

// 1250 -> "1 250", 1250.5 -> "1 250,50"
function fmtKc_(n) {
  var s = round2_(n).toFixed(2).replace(/\.00$/, "").replace(".", ",");
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function escHtml_(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function rozdelitNaDavky_(pole, velikost) {
  var out = [];
  for (var i = 0; i < pole.length; i += velikost) out.push(pole.slice(i, i + velikost));
  return out;
}

// Hláška v tabulce; když se skript spouští automaticky (bez otevřené tabulky), jde jen do logu.
function hlaska_(titulek, text) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(titulek, text, ui.ButtonSet.OK);
  } catch (e) {
    Logger.log(titulek + ": " + text);
  }
}

// Funkce určené pro menu tabulky smí běžet jen z otevřené tabulky. Zvenčí (z webové aplikace, kam se
// může dostat kdokoli s odkazem) getUi() selže, takže se z prohlížeče nedají spustit.
function jenZMenu_() {
  SpreadsheetApp.getUi();
}

// Spustí funkci pod zámkem, aby se ruční a automatická kontrola nepralo o stejná data.
function spustSeZamkem_(fn, cekejMs) {
  var zamek = LockService.getScriptLock();
  if (!zamek.tryLock(cekejMs)) {
    throw new Error("Právě běží jiná kontrola plateb (automatická nebo ruční). Zkuste to za minutu.");
  }
  try {
    return fn();
  } finally {
    zamek.releaseLock();
  }
}

// Převod textu částky na číslo ("1 500,00" -> 1500, "250,5" -> 250.5, "1.500" -> 1500)
function parseCzAmount_(s) {
  s = String(s || "").replace(/[  ]/g, "");
  if (s.indexOf(",") !== -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^[0-9]{1,3}(\.[0-9]{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  var v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

// ---------- LISTY A ROZSAH ŽÁKŮ ----------
// Tabulka, se kterou se pracuje: aktivní (menu, spouštěče), jinak podle ID (webová aplikace).
function getSS_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (ss) {
    zapamatujTabulku_(ss, false);
    return ss;
  }
  var id = PropertiesService.getScriptProperties().getProperty("TABULKA_ID");
  if (!id) throw new Error("Aplikace zatím nezná tabulku. Otevřete tabulku (Google Tabulky) a počkejte, až se v liště objeví menu „Třídní fond“ – tabulka se tím zapamatuje. Pak obnovte aplikaci.");
  return SpreadsheetApp.openById(id);
}

// Zapamatuje si ID tabulky, aby ji našla i webová aplikace (ta neběží „nad“ otevřenou tabulkou).
// vynutit = true (při otevření tabulky) přepíše i dřívější hodnotu, např. po zkopírování šablony.
function zapamatujTabulku_(ss, vynutit) {
  try {
    var props = PropertiesService.getScriptProperties();
    var id = ss.getId();
    if (id && (vynutit || !props.getProperty("TABULKA_ID"))) props.setProperty("TABULKA_ID", id);
  } catch (e) { /* tabulka bez getId (testy) – nevadí */ }
}

function getListHistorie_(ss) {
  var list = ss.getSheetByName(LIST_HISTORIE);
  if (list) return list;

  var puvodni = ss.getActiveSheet();
  list = ss.insertSheet(LIST_HISTORIE, 1);   // druhý list v pořadí

  list.getRange(1, 1, 1, HISTORIE_HLAVICKA.length).setValues([HISTORIE_HLAVICKA])
    .setFontWeight("bold").setBackground("#d9d9d9");
  list.setFrozenRows(1);

  var radku = list.getMaxRows();
  list.getRange(1, 3, radku, 1).setNumberFormat("@");              // SS jako text
  list.getRange(1, 5, radku, 1).setNumberFormat("@");              // VS jako text (zachová úvodní nuly)
  list.getRange(1, 9, radku, 1).setNumberFormat("@");              // ID zprávy jako text (aby se nepřevedlo na číslo)
  if (radku > 1) {
    list.getRange(2, 1, radku - 1, 1).setNumberFormat("dd.MM.yyyy HH:mm");
    list.getRange(2, 6, radku - 1, 1).setNumberFormat("#,##0.00");
  }
  list.getRange(2, 9, radku - 1 > 0 ? radku - 1 : 1, 1).setFontColor("#999999");
  list.setColumnWidth(1, 140);
  list.setColumnWidth(2, 160);
  list.setColumnWidth(3, 110);
  list.setColumnWidth(4, 160);
  list.setColumnWidth(5, 110);
  list.setColumnWidth(6, 100);
  list.setColumnWidth(7, 260);
  list.setColumnWidth(8, 130);
  list.setColumnWidth(9, 150);

  try { ss.setActiveSheet(puvodni); } catch (e) {}
  return list;
}

function jeRezervovanyList_(nazev) {
  return nazev === LIST_HISTORIE || nazev === LIST_ODESLANE;
}

// První (dosavadní) list s tabulkou žáků. Od zavedení tříd slouží jen jako výchozí třída.
function getHlavniList_() {
  var ss = getSS_();
  var sheets = ss.getSheets();
  var id = PropertiesService.getScriptProperties().getProperty("HLAVNI_LIST_ID");
  var arch = nactiArchivTrid_();
  var i;
  if (id) {
    for (i = 0; i < sheets.length; i++) {
      if (String(sheets[i].getSheetId()) === id && !jeRezervovanyList_(sheets[i].getName()) && arch.indexOf(Number(id)) === -1) return sheets[i];
    }
  }
  for (i = 0; i < sheets.length; i++) {
    if (!jeRezervovanyList_(sheets[i].getName()) && arch.indexOf(Number(sheets[i].getSheetId())) === -1) return sheets[i];
  }
  return null;
}

// List, se kterým se pracuje z menu: aktivní list, ale nikdy ne list historie ani odeslaných e-mailů.
function getPracovniList_() {
  var ss = getSS_();
  var aktivni = ss.getActiveSheet();
  if (!jeRezervovanyList_(aktivni.getName())) {
    if (nactiArchivTrid_().indexOf(Number(aktivni.getSheetId())) !== -1) {
      throw new Error("Tento list je archivovaná třída (jen pro čtení). Přepněte se na list aktivní třídy, nebo třídu v aplikaci obnovte z archivu.");
    }
    return aktivni;
  }
  return getHlavniList_() || aktivni;
}

// ---------- TŘÍDY ----------
// Třída = jeden list tabulky se stejnou stavbou (SS v 6. řádku, názvy sbírek v 7., žáci od 9. řádku,
// sloupce A–E, sbírky od G). Které listy jsou třídy, pamatuje vlastnost skriptu TRIDY (ID listů).
function nactiIdTrid_() {
  var raw = PropertiesService.getScriptProperties().getProperty("TRIDY");
  if (!raw) return [];
  try {
    var pole = JSON.parse(raw);
    return Array.isArray(pole) ? pole.map(Number).filter(function(x) { return !isNaN(x); }) : [];
  } catch (e) { return []; }
}

function ulozIdTrid_(ids) {
  PropertiesService.getScriptProperties().setProperty("TRIDY", JSON.stringify(ids));
}

// ID archivovaných tříd (třída v archivu je skrytý list, jen pro čtení – nic se do ní nezapisuje, nekontroluje se
// a nerozesílá). Archivace nic nemaže: záznamy proběhlých sbírek zůstávají v listu.
function nactiArchivTrid_() {
  var raw = PropertiesService.getScriptProperties().getProperty("ARCHIV_TRIDY");
  if (!raw) return [];
  try {
    var pole = JSON.parse(raw);
    return Array.isArray(pole) ? pole.map(Number).filter(function(x) { return !isNaN(x); }) : [];
  } catch (e) { return []; }
}

function ulozArchivTrid_(ids) {
  var props = PropertiesService.getScriptProperties();
  if (ids.length) props.setProperty("ARCHIV_TRIDY", JSON.stringify(ids));
  else props.deleteProperty("ARCHIV_TRIDY");
}

// Všechny třídy včetně archivovaných v pořadí vzniku: [{ id, nazev, list, archiv }].
// Při prvním použití je jedinou třídou dosavadní hlavní list.
// ---------- RYCHLÉ HROMADNÉ ČTENÍ (jen po dobu jedné čtecí akce) ----------
// Zapíná se v api_vse_: všechno, co se během akce přečte z tabulky, se přečte jen jednou. Mimo to je __MEMO null a nic se nemění.
var __MEMO = null;
function memo_(klic, fn) {
  if (!__MEMO) return fn();
  if (!Object.prototype.hasOwnProperty.call(__MEMO, klic)) __MEMO[klic] = fn();
  return __MEMO[klic];
}
function vlastnostiSkriptu_() {
  return memo_("props", function() { return PropertiesService.getScriptProperties().getProperties(); });
}

// Hodnoty celého listu (jako getDataRange().getValues()); při hromadném čtení z paměti.
function hodnotyListuZMemo_(sheet) {
  if (!__MEMO || !__MEMO.listy) return null;
  for (var i = 0; i < __MEMO.listy.length; i++) if (__MEMO.listy[i].sheet === sheet) return __MEMO.listy[i].vals;
  return null;
}
function nactiHodnotyListu_(sheet) {
  var z = hodnotyListuZMemo_(sheet);
  if (z) return z;
  var vals = sheet.getDataRange().getValues();
  if (__MEMO) { __MEMO.listy = __MEMO.listy || []; __MEMO.listy.push({ sheet: sheet, vals: vals }); }
  return vals;
}

// Obdélníková matice jako z getValues(): řádky doplněné prázdnými řetězci, prázdný list = [[""]].
function maticeZHodnot_(rows) {
  var w = 1, i;
  for (i = 0; i < rows.length; i++) if (rows[i].length > w) w = rows[i].length;
  var out = [];
  for (i = 0; i < rows.length; i++) {
    var r = rows[i].slice();
    while (r.length < w) r.push("");
    out.push(r);
  }
  return out.length ? out : [[""]];
}

// Načte všechny třídy JEDNÍM dotazem přes pokročilou službu Sheets (batchGet). Při jakékoli potíži (služba vypnutá, chyba)
// se nic nestane a listy se přečtou běžně po jednom. Čísla zůstávají čísly, data by přišla jako sériová čísla (třídy je neobsahují).
function predNactiListy_(tridy) {
  if (!__MEMO || !tridy.length) return false;
  try {
    if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) return false;
    var ranges = tridy.map(function(t) { return "'" + String(t.nazev).replace(/'/g, "''") + "'"; });
    var r = Sheets.Spreadsheets.Values.batchGet(getSS_().getId(), { ranges: ranges, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
    if (!r || !r.valueRanges || r.valueRanges.length !== tridy.length) return false;
    __MEMO.listy = __MEMO.listy || [];
    for (var i = 0; i < tridy.length; i++) __MEMO.listy.push({ sheet: tridy[i].list, vals: maticeZHodnot_(r.valueRanges[i].values || []) });
    return true;
  } catch (e) {
    Logger.log("Sheets API: hromadné čtení se nepovedlo, čte se po listech: " + e.message);
    return false;
  }
}

// Surové řádky listu „Historie plateb“ (bez záhlaví); při hromadném čtení jen jednou.
function surovaHistorie_(ss) {
  return memo_("historieRaw", function() {
    var list = ss.getSheetByName(LIST_HISTORIE);
    if (!list) return [];
    var v = list.getDataRange().getValues();
    return v.length < 2 ? [] : v.slice(1);
  });
}

function seznamVsechTrid_() {
  return memo_("trid", seznamVsechTridBezMemo_);
}
function seznamVsechTridBezMemo_() {
  var ss = getSS_();
  var sheets = ss.getSheets();
  var ids = nactiIdTrid_();
  var arch = nactiArchivTrid_();
  var out = [], i, j;
  function zIds() {
    var res = [];
    for (j = 0; j < ids.length; j++) {
      for (i = 0; i < sheets.length; i++) {
        if (Number(sheets[i].getSheetId()) === ids[j] && !jeRezervovanyList_(sheets[i].getName())) {
          res.push({ id: ids[j], nazev: sheets[i].getName(), list: sheets[i], archiv: arch.indexOf(ids[j]) !== -1 });
          break;
        }
      }
    }
    return res;
  }
  out = zIds();
  if (!out.length) {
    var h = getHlavniList_();
    if (h) {
      ids = [Number(h.getSheetId())];
      ulozIdTrid_(ids);
      out = zIds();
    }
  }
  return out;
}

// Aktivní třídy (bez archivu). Všechno, co do tříd zapisuje nebo je kontroluje, pracuje jen s nimi.
function seznamTrid_() {
  return seznamVsechTrid_().filter(function(t) { return !t.archiv; });
}

function najdiTriduPodleId_(id) {
  var tridy = seznamTrid_();
  for (var i = 0; i < tridy.length; i++) if (tridy[i].id === Number(id)) return tridy[i];
  return null;
}

// Třída podle ID včetně archivu (jen pro čtení a pro správu archivu).
function najdiTriduVcetneArchivu_(id) {
  var tridy = seznamVsechTrid_();
  for (var i = 0; i < tridy.length; i++) if (tridy[i].id === Number(id)) return tridy[i];
  return null;
}

// Přidá list mezi třídy (volá se při zakládání třídy i při přípravě sbírky z menu na dosud neznámém listu).
function registrujTridu_(sheet) {
  var ids = nactiIdTrid_();
  var id = Number(sheet.getSheetId());
  if (ids.indexOf(id) === -1) {
    if (!ids.length) {                       // první zápis: nejdřív zapamatovat dosavadní hlavní list
      var h = getHlavniList_();
      if (h && Number(h.getSheetId()) !== id) ids.push(Number(h.getSheetId()));
    }
    ids.push(id);
    ulozIdTrid_(ids);
  }
}

// Název třídy = název listu. Tabulky nepovolují některé znaky a názvy začínající apostrofem.
function cistyNazevTridy_(s) {
  s = String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[\[\]*?:\/\\]/g, " ");
  s = s.replace(/\s+/g, " ").trim().replace(/^'+/, "").trim();
  return s.substring(0, 40);
}

function overNazevTridy_(nazev, krome) {
  var n = cistyNazevTridy_(nazev);
  if (!n) throw new Error("Zadejte název třídy.");
  if (jeRezervovanyList_(n)) throw new Error("Název „" + n + "“ je vyhrazený pro jiný list.");
  var existujici = getSS_().getSheetByName(n);
  if (existujici && (!krome || Number(existujici.getSheetId()) !== Number(krome))) {
    throw new Error("List s názvem „" + n + "“ už v tabulce existuje.");
  }
  var sheets = getSS_().getSheets();
  for (var i = 0; i < sheets.length; i++) {      // Tabulky nerozlišují velikost písmen v názvech listů
    if (sheets[i].getName().toLowerCase() === n.toLowerCase() && (!krome || Number(sheets[i].getSheetId()) !== Number(krome))) {
      throw new Error("List s názvem „" + sheets[i].getName() + "“ už v tabulce existuje.");
    }
  }
  return n;
}

var HLAVICKA_ZAKU_ = ["Příjmení", "Jméno", "Gmail", "Variabilní symbol", "Částka", "E-mail rodiče"];
var SLOUPEC_RODICE = 6;          // sloupec F: e-maily rodičů (přihlašují se vlastním Gmailem); sbírky začínají až od G
var MAX_RODICU_NA_ZAKA = 4;

// E-maily rodičů z buňky nebo vloženého textu (oddělené čárkou, středníkem nebo mezerou): { emaily: [malá písmena, bez duplicit], spatne: [...] }
function normalizujEmailyRodicu_(txt) {
  var out = { emaily: [], spatne: [] };
  String(txt == null ? "" : txt).toLowerCase().split(/[\s,;]+/).forEach(function(x) {
    if (!x) return;
    if (x.length > 80 || !jeEmail_(x)) { out.spatne.push(x); return; }
    if (out.emaily.indexOf(x) === -1) out.emaily.push(x);
  });
  return out;
}

// Starší listy tříd nemají nad sloupcem F záhlaví; doplní se, když se do něj poprvé zapíše (jen když je prázdné).
function zajistiHlavickuRodice_(list) {
  var bunka = list.getRange(7, SLOUPEC_RODICE);
  if (String(bunka.getValue()).trim() === "") bunka.setValue(HLAVICKA_ZAKU_[SLOUPEC_RODICE - 1]).setFontWeight("bold").setBackground("#d9d9d9");
}

// Založí novou třídu: nový list se stejnou stavbou jako ten dosavadní.
function zalozTridu_(nazev) {
  var n = overNazevTridy_(nazev);
  var ss = getSS_();
  var tridy = seznamTrid_();                // zároveň zaregistruje dosavadní list jako první třídu
  // Zcela prázdný list (v nové tabulce školy typicky „List 1“) se použije jako nová třída – ať tam nezůstane zbytečný prázdný list.
  for (var k = 0; k < tridy.length; k++) {
    var prazdny = tridy[k].list;
    if (prazdny.getLastRow() === 0) {
      prazdny.setName(n);
      prazdny.getRange(7, 1, 1, HLAVICKA_ZAKU_.length).setValues([HLAVICKA_ZAKU_]).setFontWeight("bold").setBackground("#d9d9d9");
      prazdny.getRange(6, 1).setValue("SS →").setFontColor("#999999");
      [140, 110, 230, 130, 80, 230].forEach(function(w, i) { prazdny.setColumnWidth(i + 1, w); });
      return { id: Number(prazdny.getSheetId()), nazev: prazdny.getName(), pouzitPrazdnyList: true };
    }
  }
  var puvodni = null;
  try { puvodni = ss.getActiveSheet(); } catch (e) {}
  var pozice = ss.getSheets().length;
  if (tridy.length) {
    try { pozice = tridy[tridy.length - 1].list.getIndex(); } catch (e2) {}   // hned za poslední třídu
  }
  var list = ss.insertSheet(n, pozice);
  list.getRange(7, 1, 1, HLAVICKA_ZAKU_.length).setValues([HLAVICKA_ZAKU_]).setFontWeight("bold").setBackground("#d9d9d9");
  list.getRange(6, 1).setValue("SS →").setFontColor("#999999");
  [140, 110, 230, 130, 80, 230].forEach(function(w, i) { list.setColumnWidth(i + 1, w); });
  registrujTridu_(list);
  if (puvodni) { try { ss.setActiveSheet(puvodni); } catch (e3) {} }
  return { id: Number(list.getSheetId()), nazev: list.getName() };
}

function prejmenujTridu_(id, nazev) {
  var t = najdiTriduPodleId_(id);
  if (!t) throw new Error("Třída nenalezena (možná byl list smazán v tabulce).");
  var n = overNazevTridy_(nazev, t.id);
  if (n !== t.list.getName()) t.list.setName(n);
  return { id: t.id, nazev: n };
}

// Žáci jedné třídy: [{ radek, prijmeni, jmeno, email, emailRodice, vs, vychozi }]
function zakyTridy_(list) {
  var rozsah = nactiRozsahStudentu_(list);
  var out = [];
  if (!rozsah) return out;
  var data = list.getRange(rozsah.startRow, 1, rozsah.numRows, SLOUPEC_RODICE).getValues();
  for (var i = 0; i < data.length; i++) {
    if (!jeZakRadek_(data[i])) continue;
    out.push({
      radek: rozsah.startRow + i,
      prijmeni: String(data[i][0] == null ? "" : data[i][0]).trim(),
      jmeno: String(data[i][1] == null ? "" : data[i][1]).trim(),
      email: String(data[i][2] == null ? "" : data[i][2]).trim(),
      emailRodice: String(data[i][5] == null ? "" : data[i][5]).trim(),
      vs: String(data[i][3] == null ? "" : data[i][3]).replace(/\s+/g, ""),
      vychozi: parseCastka_(data[i][4])
    });
  }
  return out;
}

// ---------- VLASTNÍK SBÍRKY (čí IBAN a čí e-mail pro oznámení se používá) ----------
// Sbírce se při zakládání přiřadí účet, který ji založil. QR kódy a oznámení „vše zaplaceno“ pak používají
// jeho profil. Sbírky bez vlastníka (starší nebo založené z menu tabulky) používají výchozí nastavení.
function zapamatujVlastnikaSbirky_(specSymbol, uziv) {
  var kdo = uziv && uziv.jmeno ? String(uziv.jmeno) : "";
  if (!specSymbol || !kdo) return;
  PropertiesService.getScriptProperties().setProperty("SBIRKA_VLASTNIK_" + specSymbol, kdo);
}

function nactiVlastnikaSbirky_(specSymbol) {
  if (!specSymbol) return "";
  return PropertiesService.getScriptProperties().getProperty("SBIRKA_VLASTNIK_" + specSymbol) || "";
}

// ---------- SKUPINA SBÍREK (jedna sbírka přes víc tříd) ----------
// Sbírka vybraná z více tříd vzniká jako samostatný sloupec v každé třídě (každý má vlastní specifický symbol,
// aby se platby párovaly po třídách). Aby je šlo ukázat jako JEDNU sbírku, mají společné ID skupiny.
// Starší sbírky bez ID skupiny se spojí podle stejného názvu a vzniku do 5 minut od sebe.
var SKUPINA_ODSTUP_S = 300;

function zapamatujSkupinuSbirky_(specSymbol, skupinaId) {
  if (!specSymbol || !skupinaId) return;
  PropertiesService.getScriptProperties().setProperty("SBIRKA_SKUPINA_" + specSymbol, String(skupinaId));
}

// Rozdělí sbírky ze všech tříd do skupin. polozky: [{ ss, nazev, ... }] -> [{ id, polozky:[…] }]
function seskupSbirky_(polozky, props) {
  props = props || PropertiesService.getScriptProperties().getProperties();
  var skupiny = [], poId = {};
  var bezId = [];
  polozky.forEach(function(p) {
    var id = props["SBIRKA_SKUPINA_" + p.ss];
    if (id) {
      if (!poId[id]) { poId[id] = { id: id, polozky: [] }; skupiny.push(poId[id]); }
      poId[id].polozky.push(p);
    } else {
      bezId.push(p);
    }
  });
  // starší sbírky: stejný název (bez ohledu na velikost písmen) a SS (čas vzniku) blízko u sebe, každá v jiné třídě
  bezId.sort(function(a, b) { return String(a.ss).localeCompare(String(b.ss)); });
  var pouzito = {};
  for (var i = 0; i < bezId.length; i++) {
    if (pouzito[i]) continue;
    var g = { id: String(bezId[i].ss), polozky: [bezId[i]] };
    pouzito[i] = true;
    for (var j = i + 1; j < bezId.length; j++) {
      if (pouzito[j]) continue;
      var stejneCasu = /^[0-9]{10}$/.test(bezId[i].ss) && /^[0-9]{10}$/.test(bezId[j].ss) &&
        Math.abs(parseInt(bezId[j].ss, 10) - parseInt(bezId[i].ss, 10)) <= SKUPINA_ODSTUP_S;
      var tridaUz = g.polozky.some(function(x) { return x.tridaId === bezId[j].tridaId; });
      if (stejneCasu && !tridaUz && String(bezId[j].nazev).toLowerCase() === String(bezId[i].nazev).toLowerCase()) {
        g.polozky.push(bezId[j]);
        pouzito[j] = true;
      }
    }
    skupiny.push(g);
  }
  // id skupiny = nejstarší SS (stabilní, i když se skupina později rozroste)
  skupiny.forEach(function(g) {
    g.polozky.sort(function(a, b) { return String(a.ss).localeCompare(String(b.ss)) || (a.tridaId - b.tridaId); });
  });
  return skupiny;
}

// ---------- ČÍSLO ÚČTU / IBAN ----------
// Zbytek po dělení 97 pro IBAN přepsaný na samá čísla (písmena A=10 … Z=35), po částech, aby nepřetekla čísla.
function mod97_(text) {
  var zb = 0;
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i), kod = text.charCodeAt(i);
    if (c >= "0" && c <= "9") zb = (zb * 10 + (kod - 48)) % 97;
    else zb = (zb * 100 + (kod - 55)) % 97;
  }
  return zb;
}

function ibanPlatny_(iban) {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  return mod97_(iban.substring(4) + iban.substring(0, 4)) === 1;
}

// České číslo účtu je v pořádku, když je vážený součet číslic dělitelný 11 (váhy 6 3 7 9 10 5 8 4 2 1 zprava).
function ceskaCisliceOk_(cislo) {
  var vahy = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6];
  var d = ("0000000000" + cislo).slice(-10), soucet = 0;
  for (var i = 0; i < 10; i++) soucet += parseInt(d.charAt(9 - i), 10) * vahy[i];
  return soucet % 11 === 0;
}

function cislaUctuNaIban_(predcisli, cislo, banka) {
  var bban = banka + ("000000" + (predcisli || "0")).slice(-6) + ("0000000000" + cislo).slice(-10);
  var kontrolni = 98 - mod97_(bban + "123500");        // CZ00 → 12 35 00
  return "CZ" + ("0" + kontrolni).slice(-2) + bban;
}

function ibanNaCisloUctu_(iban) {
  var m = String(iban || "").match(/^CZ[0-9]{2}([0-9]{4})([0-9]{6})([0-9]{10})$/);
  if (!m) return "";
  var pred = m[2].replace(/^0+/, ""), cislo = m[3].replace(/^0+/, "") || "0";
  return (pred ? pred + "-" : "") + cislo + "/" + m[1];
}

function formatujIban_(iban) {
  return String(iban || "").replace(/(.{4})/g, "$1 ").trim();
}

// Přijme IBAN nebo české číslo účtu („123456789/0800“, „19-2000145399/0800“). Vrací { ok, iban, cislo, chyba }.
function normalizujUcet_(vstup) {
  var s = String(vstup == null ? "" : vstup).replace(/[\s ]+/g, "").toUpperCase();
  if (!s) return { ok: false, chyba: "Zadejte číslo účtu nebo IBAN." };
  var m = s.match(/^(?:([0-9]{1,6})-)?([0-9]{1,10})\/([0-9]{4})$/);
  if (m) {
    if (m[2].length < 2) return { ok: false, chyba: "Číslo účtu je příliš krátké." };
    if ((m[1] && !ceskaCisliceOk_(m[1])) || !ceskaCisliceOk_(m[2])) return { ok: false, chyba: "Číslo účtu nesedí (překlep?). Zkontrolujte ho v bankovnictví." };
    var iban = cislaUctuNaIban_(m[1] || "", m[2], m[3]);
    return { ok: true, iban: iban, cislo: ibanNaCisloUctu_(iban) };
  }
  if (ibanPlatny_(s)) return { ok: true, iban: s, cislo: ibanNaCisloUctu_(s) };
  return { ok: false, chyba: "Neplatné číslo účtu nebo IBAN (zkontrolujte překlepy). Zadejte např. 123456789/0800 nebo CZ65 0800 0000 1920 0014 5399." };
}

// ---------- PROFIL ÚČTU (IBAN, e-maily) ----------
// Výchozí nastavení pro sbírky bez vlastníka. Nastavuje se v aplikaci (první spuštění / Nastavení);
// dokud není vyplněné, jsou položky prázdné a aplikace na to upozorní, než by měla poslat QR kód.
function nactiVychoziProfil_() {
  var raw = PropertiesService.getScriptProperties().getProperty("PROFIL_VYCHOZI");
  var p = {};
  if (raw) { try { p = JSON.parse(raw) || {}; } catch (e) { p = {}; } }
  return {
    iban: p.iban || "",
    emailOznameni: p.emailOznameni || "",
    emailPlatby: p.emailPlatby || "",
    nazevUctu: p.nazevUctu || ""
  };
}

function ulozVychoziProfil_(profil) {
  PropertiesService.getScriptProperties().setProperty("PROFIL_VYCHOZI", JSON.stringify({
    iban: profil.iban, emailOznameni: profil.emailOznameni, emailPlatby: profil.emailPlatby, nazevUctu: profil.nazevUctu || ""
  }));
}

// Profil, který se použije pro sbírku: vlastník sbírky, jinak výchozí. Chybějící položky se doplní z výchozího.
function profilSbirky_(specSymbol) {
  var p = nactiVychoziProfil_();
  var vlastnik = nactiVlastnikaSbirky_(specSymbol);
  if (vlastnik) {
    var u = null;
    try { u = nactiUzivatele_(vlastnik); } catch (e) {}
    if (u && u.profil) p = efektivniProfilUzivatele_(u);     // výchozí → účet vybraného správce → vlastní údaje učitele
  }
  p.vlastnik = vlastnik;
  return p;
}

// Schránka, kterou aplikace opravdu čte = účet, pod kterým běží skript (u webové aplikace „Spustit jako: já“
// ten, kdo ji nasadil). Google dovolí skriptu číst jen tuhle schránku, ne schránku toho, kdo se přihlásil.
// Když ji nejde zjistit, vrací prázdný text.
function mailboxCtena_() {
  try {
    var e = Session.getEffectiveUser().getEmail();
    if (e) return String(e).trim().toLowerCase();
  } catch (x) {}
  return "";
}

// ---------- SPRÁVA TŘÍD A ŽÁKŮ: smazání třídy, odstranění a přesun žáků ----------
// Všechno tohle se volá až po potvrzení v aplikaci (náhled → token → provedení), viz webapp.gs.

// Přehled sbírek třídy se stavem (pro náhled mazání třídy)
function prehledSbirekTridy_(list) {
  var rozsah = nactiRozsahStudentu_(list);
  var sbirky = najdiSbirky_(list), out = [];
  if (!rozsah) return sbirky.map(function(sb) { return { nazev: sb.nazev, specSymbol: sb.specSymbol, pocetOcekavano: 0, pocetZaplaceno: 0, vybrano: 0, ocekavano: 0 }; });
  var posl = Math.max(list.getLastColumn(), 6);
  var data = list.getRange(rozsah.startRow, 1, rozsah.numRows, posl).getValues();
  sbirky.forEach(function(sb) {
    var o = { nazev: sb.nazev, specSymbol: sb.specSymbol, pocetOcekavano: 0, pocetZaplaceno: 0, vybrano: 0, ocekavano: 0 };
    data.forEach(function(r) {
      if (!jeZakRadek_(r)) return;
      var b = rozborBunky_(r[sb.colIndex - 1], r[4]);
      if (b.stav === "nic") return;
      var ocek = b.stav === "rucne" ? getExpectedAmount_("", r[4]) : b.ocekavano;
      if (!(ocek > 0)) return;
      o.pocetOcekavano++; o.ocekavano += ocek; o.vybrano += b.zaplaceno;
      if (b.stav === "zaplaceno" || b.stav === "preplatek") o.pocetZaplaceno++;
    });
    o.ocekavano = round2_(o.ocekavano); o.vybrano = round2_(o.vybrano);
    out.push(o);
  });
  return out;
}

// Počet řádků listu, jejichž hodnota ve sloupci „sloupec“ je jedním ze specifických symbolů.
function pocetRadkuSbirek_(list, sloupec, specSymboly) {
  if (!list || list.getLastRow() < 2) return 0;
  var mapa = {}, n = 0;
  specSymboly.forEach(function(x) { mapa[String(x)] = true; });
  var v = list.getRange(2, sloupec, list.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (mapa[String(v[i][0] == null ? "" : v[i][0]).trim()]) n++;
  return n;
}

// Počet záznamů v historii plateb, které patří daným sbírkám
function pocetPlatebSbirek_(ss, specSymboly) {
  return pocetRadkuSbirek_(ss.getSheetByName(LIST_HISTORIE), 3, specSymboly);
}

// Počet záznamů v přehledu odeslaných e-mailů, které patří daným sbírkám
function pocetOdeslanychSbirek_(ss, specSymboly) {
  return pocetRadkuSbirek_(ss.getSheetByName(LIST_ODESLANE), 4, specSymboly);
}

// Archivuje třídu: list se skryje a třída se přestane používat (nové sbírky, import žáků, kontrola plateb, rozesílání),
// ale NIC se nemaže – žáci a záznamy proběhlých sbírek zůstávají a jdou dál prohlížet (jen pro čtení).
// Poslední aktivní třídu archivovat nejde – aplikace potřebuje aspoň jednu.
function archivujTridu_(id) {
  var tridy = seznamTrid_();
  var t = null, i;
  for (i = 0; i < tridy.length; i++) if (tridy[i].id === Number(id)) t = tridy[i];
  if (!t) {
    if (najdiTriduVcetneArchivu_(id)) throw new Error("Tahle třída už je v archivu.");
    throw new Error("Třída nenalezena (možná byl list smazán v tabulce). Obnovte stránku.");
  }
  if (tridy.length < 2) throw new Error("Poslední aktivní třídu archivovat nejde – aplikace potřebuje aspoň jednu. Nejdřív založte novou třídu.");
  var ss = getSS_();
  // Skrytý list nesmí být právě otevřený: přepneme se na jinou aktivní třídu.
  try {
    var akt = ss.getActiveSheet();
    if (akt && Number(akt.getSheetId()) === t.id) {
      for (i = 0; i < tridy.length; i++) if (tridy[i].id !== t.id) { ss.setActiveSheet(tridy[i].list); break; }
    }
  } catch (e0) { /* nevadí */ }
  ulozArchivTrid_(nactiArchivTrid_().concat([t.id]));
  try {
    t.list.hideSheet();
  } catch (e) {
    ulozArchivTrid_(nactiArchivTrid_().filter(function(x) { return x !== t.id; }));
    throw new Error("Třídu se nepodařilo archivovat (list nejde skrýt): " + e.message);
  }
  return { id: t.id, nazev: t.nazev };
}

// Vrátí třídu z archivu mezi aktivní (list se znovu zobrazí).
function obnovTridu_(id) {
  var t = najdiTriduVcetneArchivu_(id);
  if (!t) throw new Error("Třída nenalezena (možná byl list smazán v tabulce). Obnovte stránku.");
  if (!t.archiv) throw new Error("Tahle třída není v archivu.");
  ulozArchivTrid_(nactiArchivTrid_().filter(function(x) { return x !== t.id; }));
  try { t.list.showSheet(); } catch (e) { /* třída se obnovila i bez zobrazení listu */ }
  return { id: t.id, nazev: t.nazev };
}

// Smaže třídu NAVŽDY (list v tabulce – žáci i záznamy jejích sbírek zmizí). Jde jen u třídy v archivu.
// Historie plateb a štítky v Gmailu zůstanou.
function smazTridu_(id) {
  var tridy = seznamVsechTrid_();
  var t = null, i;
  for (i = 0; i < tridy.length; i++) if (tridy[i].id === Number(id)) t = tridy[i];
  if (!t) throw new Error("Třída nenalezena (možná už byla smazána). Obnovte stránku.");
  if (!t.archiv) throw new Error("Aktivní třídu smazat nejde. Nejdřív ji archivujte (nic se tím nemaže), a smazat nadobro jde až z archivu.");
  var nazev = t.nazev;
  var zbyva = nactiIdTrid_().filter(function(x) { return x !== t.id; });
  ulozIdTrid_(zbyva);                       // nejdřív odregistrovat, pak smazat list
  ulozArchivTrid_(nactiArchivTrid_().filter(function(x) { return x !== t.id; }));
  try {
    getSS_().deleteSheet(t.list);
  } catch (e) {
    ulozIdTrid_(nactiIdTrid_().concat([t.id]));   // list se nepodařilo smazat – třída zůstane v archivu
    ulozArchivTrid_(nactiArchivTrid_().concat([t.id]));
    throw new Error("List se nepodařilo smazat: " + e.message);
  }
  try {
    var hl = PropertiesService.getScriptProperties();
    if (hl.getProperty("HLAVNI_LIST_ID") === String(t.id)) hl.deleteProperty("HLAVNI_LIST_ID");
  } catch (e2) {}
  return { id: t.id, nazev: nazev };
}

// Smaže z listu s daným názvem všechny řádky, jejichž hodnota ve sloupci „sloupec“ je jedním ze specifických symbolů.
function smazRadkySbirek_(list, sloupec, specSymboly) {
  if (!list || list.getLastRow() < 2) return 0;
  var mapa = {};
  specSymboly.forEach(function(x) { mapa[String(x)] = true; });
  var hodnoty = list.getRange(2, sloupec, list.getLastRow() - 1, 1).getValues();
  var radky = [];
  for (var i = 0; i < hodnoty.length; i++) if (mapa[String(hodnoty[i][0] == null ? "" : hodnoty[i][0]).trim()]) radky.push(i + 2);
  var k = radky.length - 1;
  while (k >= 0) {                          // souvislé skupiny odspodu, aby se čísla řádků neposouvala
    var konec = radky[k], zacatek = konec, n = 1;
    while (k - n >= 0 && radky[k - n] === zacatek - 1) { zacatek = radky[k - n]; n++; }
    list.deleteRows(zacatek, n);
    k -= n;
  }
  return radky.length;
}

// Smaže sbírku (sloupec s platbami) z listu třídy a vlastnosti skriptu, které k ní patří.
// volby.smazatHistorii = smaže i záznamy v Historii plateb a v přehledu Odeslané e-maily.
// Štítek v Gmailu a samotné e-maily se nemažou. Vrací { nazev, specSymbol, smazanoHistorie, smazanoOdeslane }.
function smazSbirkuZTridy_(list, colIndex, specSymbol, volby) {
  volby = volby || {};
  var sb = null;
  najdiSbirky_(list).forEach(function(x) { if (x.colIndex === colIndex) sb = x; });
  if (!sb || sb.specSymbol !== String(specSymbol)) {
    throw new Error("Sbírka se mezitím změnila nebo už neexistuje. Obnovte stránku – nic se nesmazalo.");
  }
  list.deleteColumn(colIndex);
  var props = PropertiesService.getScriptProperties();
  ["SBIRKA_VLASTNIK_", "SBIRKA_SKUPINA_", "VSE_ZAPLACENO_", "KONTROLA_"].forEach(function(pref) { props.deleteProperty(pref + sb.specSymbol); });
  var res = { nazev: sb.nazev, specSymbol: sb.specSymbol, smazanoHistorie: 0, smazanoOdeslane: 0 };
  if (volby.smazatHistorii) {
    var ss = getSS_();
    res.smazanoHistorie = smazRadkySbirek_(ss.getSheetByName(LIST_HISTORIE), 3, [sb.specSymbol]);
    res.smazanoOdeslane = smazRadkySbirek_(ss.getSheetByName(LIST_ODESLANE), 4, [sb.specSymbol]);
  }
  return res;
}

// Údaje o žácích na daných řádcích + v kterých sbírkách jsou: [{ radek, prijmeni, jmeno, email, vs, ucast:[{ sbirka, stav, zaplaceno, ocekavano }] }]
function popisZakuNaRadcich_(list, radky) {
  var rozsah = nactiRozsahStudentu_(list);
  if (!rozsah) throw new Error("Ve třídě nejsou žádní žáci.");
  var posl = Math.max(list.getLastColumn(), 6);
  var data = list.getRange(rozsah.startRow, 1, rozsah.numRows, posl).getValues();
  var sbirky = najdiSbirky_(list);
  var out = [], videno = {};
  radky.forEach(function(rd) {
    var radek = parseInt(rd && rd.radek !== undefined ? rd.radek : rd, 10);
    if (!(radek >= rozsah.startRow && radek <= rozsah.lastRow)) throw new Error("Neplatný řádek žáka (" + radek + "). Obnovte stránku.");
    if (videno[radek]) return;
    videno[radek] = true;
    var r = data[radek - rozsah.startRow];
    if (!jeZakRadek_(r)) throw new Error("Na řádku " + radek + " už není žák. Obnovte stránku.");
    if (rd && typeof rd === "object" && (rd.prijmeni !== undefined || rd.jmeno !== undefined)) {
      if (normJmeno_(rd.prijmeni) !== normJmeno_(r[0]) || normJmeno_(rd.jmeno) !== normJmeno_(r[1])) {
        throw new Error("Tabulka se mezitím změnila (na řádku " + radek + " je teď jiný žák). Obnovte stránku.");
      }
    }
    var ucast = [];
    sbirky.forEach(function(sb) {
      var b = rozborBunky_(r[sb.colIndex - 1], r[4]);
      if (b.stav === "nic") return;
      ucast.push({ sbirka: sb.nazev, specSymbol: sb.specSymbol, stav: b.stav, zaplaceno: b.zaplaceno, ocekavano: b.ocekavano });
    });
    out.push({
      radek: radek, prijmeni: String(r[0] == null ? "" : r[0]).trim(), jmeno: String(r[1] == null ? "" : r[1]).trim(),
      email: String(r[2] == null ? "" : r[2]).trim(), emailRodice: String(r[SLOUPEC_RODICE - 1] == null ? "" : r[SLOUPEC_RODICE - 1]).trim(),
      vs: String(r[3] == null ? "" : r[3]).replace(/\s+/g, ""), ucast: ucast
    });
  });
  out.sort(function(a, b) { return a.radek - b.radek; });
  return out;
}

// Přepočítá stavy a souhrny všech sbírek třídy z toho, co je v tabulce a v historii plateb (bez Gmailu).
function prepocitejSbirkyTridy_(list) {
  if (!nactiRozsahStudentu_(list)) return 0;
  var sbirky = najdiSbirky_(list), n = 0;
  for (var i = 0; i < sbirky.length; i++) {
    try { zkontrolujSbirku_(list, sbirky[i].colIndex, { bezGmailu: true }); n++; } catch (e) {}
  }
  return n;
}

// Odstraní řádky žáků (souvislé skupiny najednou, odspodu, aby se čísla řádků neposouvala).
// Platby v historii zůstanou. Vrací { odstraneno, zbyva, prepocitano }.
function odstranZakyZTridy_(list, radky) {
  var zaci = popisZakuNaRadcich_(list, radky);
  if (!zaci.length) throw new Error("Nevybrali jste žádné žáky.");
  var cisla = zaci.map(function(z) { return z.radek; }).sort(function(a, b) { return b - a; });
  var i = 0;
  while (i < cisla.length) {
    var konec = cisla[i], zacatek = konec, n = 1;
    while (i + n < cisla.length && cisla[i + n] === zacatek - 1) { zacatek = cisla[i + n]; n++; }
    list.deleteRows(zacatek, n);
    i += n;
  }
  var prepocitano = prepocitejSbirkyTridy_(list);
  var rozsah = nactiRozsahStudentu_(list);
  var zbyva = 0;
  if (rozsah) {
    var d = list.getRange(rozsah.startRow, 1, rozsah.numRows, 5).getValues();
    d.forEach(function(r) { if (jeZakRadek_(r)) zbyva++; });
  }
  return { odstraneno: zaci.length, zbyva: zbyva, prepocitano: prepocitano };
}

// Co by se stalo při přesunu: [{ ... žák ..., stav: ok|chyba|preskocit, zpravy[] }]
function nahledPresunuZaku_(zdroj, cil, radky) {
  var zaci = popisZakuNaRadcich_(zdroj, radky);
  var vstup = zaci.map(function(z) { return { prijmeni: z.prijmeni, jmeno: z.jmeno, email: z.email, emailRodice: z.emailRodice, vs: z.vs, castka: "" }; });
  var kontrola = overRadkyImportu_(cil, vstup, { doplnitVs: false });
  return zaci.map(function(z, i) {
    var k = kontrola.radky[i];
    z.stav = k.stav === "ok" ? "ok" : "preskocit";
    z.zpravy = k.zpravy.slice();
    return z;
  });
}

// Přesune žáky (se stejným VS a e-mailem) do jiné třídy. Do sbírek cílové třídy se nezapojí.
// Z původní třídy se odstraní jen ti, kdo se v cílové třídě opravdu objevili.
function presunZakyDoJineTridy_(zdroj, cil, radky) {
  var zaci = popisZakuNaRadcich_(zdroj, radky);
  if (!zaci.length) throw new Error("Nevybrali jste žádné žáky.");
  var vstup = zaci.map(function(z) { return { prijmeni: z.prijmeni, jmeno: z.jmeno, email: z.email, emailRodice: z.emailRodice, vs: z.vs, castka: "" }; });
  var res = pridejZakyDoTridy_(cil, vstup, { doplnitVs: false });
  var preskoc = {};
  res.preskoceno.forEach(function(x) { preskoc[x.index] = x.duvod; });
  var presunute = [], nepresunute = [];
  zaci.forEach(function(z, i) {
    if (preskoc[i] !== undefined) nepresunute.push({ radek: z.radek, zak: jmenoZaka_(z.prijmeni, z.jmeno), duvod: preskoc[i] });
    else presunute.push(z);
  });
  var ods = presunute.length ? odstranZakyZTridy_(zdroj, presunute.map(function(z) { return z.radek; })) : { odstraneno: 0, zbyva: 0, prepocitano: 0 };
  return { presunuto: presunute.length, nepresunuto: nepresunute, zbyvaVPuvodni: ods.zbyva };
}

// Všechny používané VS napříč třídami: { normalizovanýVS: { trida, zak } }
function pouziteVs_() {
  var mapa = {}, tridy = seznamTrid_();
  for (var t = 0; t < tridy.length; t++) {
    var zaci = zakyTridy_(tridy[t].list);
    for (var i = 0; i < zaci.length; i++) {
      var k = normVs_(zaci[i].vs);
      if (k && !mapa[k]) mapa[k] = { trida: tridy[t].nazev, zak: jmenoZaka_(zaci[i].prijmeni, zaci[i].jmeno), tridaId: tridy[t].id };
    }
  }
  return mapa;
}

// Najde sbírku podle SS ve všech třídách: { trida, sbirka } nebo null.
function najdiSbirkuVTridach_(specSymbol) {
  var tridy = seznamTrid_();
  for (var t = 0; t < tridy.length; t++) {
    var sb = najdiSbirky_(tridy[t].list);
    for (var i = 0; i < sb.length; i++) {
      if (sb[i].specSymbol === String(specSymbol)) return { trida: tridy[t], sbirka: sb[i] };
    }
  }
  return null;
}

// ---------- VKLÁDÁNÍ ŽÁKŮ DO TŘÍDY (copy-paste tabulky) ----------
// Text do buňky bez řídicích znaků a bez začátku, který by Tabulky vzaly jako vzorec (= + - @).
function cistyText_(s, max) {
  s = String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^[=+\-@\s]+/, "");
  return s.substring(0, max || 80);
}

// Zkontroluje řádky k vložení do třídy (nic nezapisuje).
//  radky = [{ prijmeni, jmeno, email, vs, castka }]; volby.doplnitVs = chybějící VS se vygeneruje při vložení.
//  Každý výstupní řádek: { index, stav: ok|chyba|preskocit|prazdny, zpravy[], varovani[], prijmeni, jmeno, email, vs, castka, noveVs }
function overRadkyImportu_(list, radky, volby) {
  volby = volby || {};
  if (!Array.isArray(radky)) throw new Error("Nic k vložení.");
  if (radky.length > MAX_IMPORT_RADKU) throw new Error("Najednou jde vložit nejvíc " + MAX_IMPORT_RADKU + " řádků.");
  var tridaNazev = list.getName();
  var vTride = zakyTridy_(list);
  var vsVTride = {}, jmenaVTride = {}, i;
  for (i = 0; i < vTride.length; i++) {
    var k = normVs_(vTride[i].vs);
    if (k) vsVTride[k] = jmenoZaka_(vTride[i].prijmeni, vTride[i].jmeno);
    jmenaVTride[normJmeno_(jmenoZaka_(vTride[i].prijmeni, vTride[i].jmeno))] = true;
  }
  var vsJinde = pouziteVs_();
  var vsVeVkladani = {}, jmenaVeVkladani = {};
  var out = [], souhrn = { ok: 0, chyba: 0, preskocit: 0, noveVs: 0, bezEmailu: 0 };

  for (i = 0; i < radky.length; i++) {
    var r = radky[i] || {};
    var o = {
      index: i, stav: "ok", zpravy: [], varovani: [],
      prijmeni: cistyText_(r.prijmeni, 60), jmeno: cistyText_(r.jmeno, 60),
      email: String(r.email == null ? "" : r.email).replace(/\s+/g, "").toLowerCase(),
      vs: String(r.vs == null ? "" : r.vs).replace(/[\s ]+/g, ""),
      emailRodice: "", castka: 0, noveVs: false
    };
    var castkaSyrova = String(r.castka == null ? "" : r.castka).replace(/\s+/g, "").replace(/Kč$/i, "");
    var rodice = normalizujEmailyRodicu_(r.emailRodice);
    if (!o.prijmeni && !o.jmeno && !o.email && !o.vs && !castkaSyrova && !rodice.emaily.length && !rodice.spatne.length) { o.stav = "prazdny"; out.push(o); continue; }

    if (!o.prijmeni) o.zpravy.push("Chybí příjmení.");
    if (rodice.spatne.length) o.zpravy.push("Neplatný e-mail rodiče.");
    o.emailRodice = rodice.emaily.filter(function(x) { return x !== o.email; }).join(", ");     // e-mail žáka mezi rodiči nedává smysl
    if (rodice.emaily.length > MAX_RODICU_NA_ZAKA) o.zpravy.push("Nejvýš " + MAX_RODICU_NA_ZAKA + " e-maily rodičů na žáka.");
    if (o.email && !jeEmail_(o.email)) o.zpravy.push("Neplatný e-mail.");
    if (!o.email) o.varovani.push("Bez e-mailu – žák nedostane QR ani připomínku.");

    if (o.vs) {
      if (!/^[0-9]{1,10}$/.test(o.vs)) {
        o.zpravy.push("VS musí být číslo (nejvýš 10 číslic).");
      } else {
        var nk = normVs_(o.vs);
        if (!nk) o.zpravy.push("VS nesmí být samé nuly.");
        else if (vsVTride[nk]) o.zpravy.push("VS už má v této třídě " + vsVTride[nk] + ".");
        else if (vsVeVkladani[nk] !== undefined) o.zpravy.push("VS je ve vkládané tabulce dvakrát (řádek " + (vsVeVkladani[nk] + 1) + ").");
        else if (vsJinde[nk]) o.varovani.push("VS už je ve třídě „" + vsJinde[nk].trida + "“ (" + vsJinde[nk].zak + ").");
      }
    } else if (volby.doplnitVs) {
      o.noveVs = true;
    } else {
      o.varovani.push("Bez VS – nepůjdou párovat platby ani poslat QR.");
      if (!o.email) o.zpravy.push("Chybí e-mail i VS – řádek by se v aplikaci neukázal.");
    }

    if (castkaSyrova !== "") {
      var cc = parseFloat(castkaSyrova.replace(",", "."));
      if (isNaN(cc) || !/^[0-9]+([.,][0-9]{1,2})?$/.test(castkaSyrova)) o.zpravy.push("Neplatná částka.");
      else if (cc < 0 || cc > MAX_CASTKA) o.zpravy.push("Částka musí být 0 – " + MAX_CASTKA + " Kč.");
      else o.castka = round2_(cc);
    }

    if (!o.zpravy.length) {
      var nj = normJmeno_(jmenoZaka_(o.prijmeni, o.jmeno));
      if (jmenaVTride[nj]) { o.stav = "preskocit"; o.zpravy.push("Žák se stejným jménem už ve třídě je."); }
      else if (jmenaVeVkladani[nj] !== undefined) { o.stav = "preskocit"; o.zpravy.push("Stejné jméno je ve vkládané tabulce dvakrát (řádek " + (jmenaVeVkladani[nj] + 1) + ")."); }
    } else {
      o.stav = "chyba";
    }
    if (o.stav === "ok") {
      if (o.vs && /^[0-9]{1,10}$/.test(o.vs)) vsVeVkladani[normVs_(o.vs)] = i;
      jmenaVeVkladani[normJmeno_(jmenoZaka_(o.prijmeni, o.jmeno))] = i;
      souhrn.ok++;
      if (o.noveVs) souhrn.noveVs++;
      if (!o.email) souhrn.bezEmailu++;
    } else if (o.stav === "chyba") souhrn.chyba++;
    else souhrn.preskocit++;
    out.push(o);
  }
  return { radky: out, souhrn: souhrn, trida: tridaNazev, vsVse: vsJinde };
}

// Náhodné devítimístné VS, které zatím nikdo nemá.
function generujVs_(pouzite) {
  for (var pokus = 0; pokus < 1000; pokus++) {
    var v = String(Math.floor(100000000 + Math.random() * 900000000));
    if (!pouzite[v]) { pouzite[v] = true; return v; }
  }
  throw new Error("Nepodařilo se vygenerovat volný variabilní symbol.");
}

// Vloží platné řádky pod poslední žáky třídy. Souhrny pod tabulkou (v sloupcích sbírek) se tím posunou
// níž, takže zůstanou hned pod posledním žákem. Nové žáky ve stávajících sbírkách nikdo nečeká (prázdná buňka).
function pridejZakyDoTridy_(list, radky, volby) {
  volby = volby || {};
  var kontrola = overRadkyImportu_(list, radky, volby);
  var k = kontrola.radky.filter(function(r) { return r.stav === "ok"; });
  var res = {
    pridano: 0, preskoceno: [], vygenerovanoVs: 0, prvniRadek: 0,
    zak: []
  };
  kontrola.radky.forEach(function(r) {
    if (r.stav === "chyba" || r.stav === "preskocit") res.preskoceno.push({ index: r.index, duvod: r.zpravy.join(" ") });
  });
  if (!k.length) {
    throw new Error("Není co přidat – žádný řádek není v pořádku." + (res.preskoceno.length ? " " + res.preskoceno[0].duvod : ""));
  }

  var pouzite = {};
  Object.keys(kontrola.vsVse).forEach(function(x) { pouzite[x] = true; });     // VS ze všech tříd už zná kontrola (bez dalšího čtení všech listů)
  var hodnoty = k.map(function(r) {
    var vs = r.vs;
    if (!vs && r.noveVs) { vs = generujVs_(pouzite); res.vygenerovanoVs++; }
    return [r.prijmeni, r.jmeno, r.email, vs, r.castka > 0 ? r.castka : ""];
  });
  var rodice = k.map(function(r) { return [r.emailRodice || ""]; });

  var rozsah = nactiRozsahStudentu_(list);
  var prvni;
  if (rozsah) {
    prvni = rozsah.lastRow + 1;
    list.insertRowsAfter(rozsah.lastRow, hodnoty.length);
  } else {
    prvni = 9;
    var potreba = prvni + hodnoty.length - 1;
    if (potreba > list.getMaxRows()) list.insertRowsAfter(list.getMaxRows(), potreba - list.getMaxRows());
  }
  var poslSloupec = Math.max(list.getLastColumn(), 6);
  if (poslSloupec > 5) {
    // vložené řádky zdědí barvy řádku nad sebou – ve sloupcích sbírek musí být bílé (žák v nich není)
    var sbBarvy = [];
    for (var i = 0; i < hodnoty.length; i++) {
      var radekBarev = [];
      for (var c = 6; c <= poslSloupec; c++) radekBarev.push("#ffffff");
      sbBarvy.push(radekBarev);
    }
    list.getRange(prvni, 6, hodnoty.length, poslSloupec - 5).setBackgrounds(sbBarvy);
  }
  list.getRange(prvni, 4, hodnoty.length, 1).setNumberFormat("@");        // VS jako text (zachová nuly)
  list.getRange(prvni, 1, hodnoty.length, 5).setValues(hodnoty);
  if (rodice.some(function(x) { return x[0] !== ""; })) {                    // e-maily rodičů (sloupec F), jen když nějaké jsou
    zajistiHlavickuRodice_(list);
    list.getRange(prvni, SLOUPEC_RODICE, rodice.length, 1).setValues(rodice);
  }
  res.pridano = hodnoty.length;
  res.prvniRadek = prvni;
  res.zak = k.map(function(r, idx) { return { prijmeni: r.prijmeni, jmeno: r.jmeno, vs: hodnoty[idx][3], radek: prvni + idx }; });
  return res;
}

// Doplní e-mail rodiče do sloupce F u žáka (žáků), jehož vlastní e-mail (sloupec C) je diteEmail. Starší obsah buňky se nemění,
// jen se za něj přidá adresa. Volat pod zámkem (spustSeZamkem_). Vrací [{ tridaId, tridaNazev, radek, zak }] – i žáky, u kterých už rodič je.
function pripojRodiceKZakovi_(diteEmail, rodicEmail) {
  diteEmail = String(diteEmail == null ? "" : diteEmail).trim().toLowerCase();
  rodicEmail = String(rodicEmail == null ? "" : rodicEmail).trim().toLowerCase();
  var out = [], tridy = seznamTrid_();
  if (!diteEmail || !rodicEmail) return out;
  for (var t = 0; t < tridy.length; t++) {
    var zaci = zakyTridy_(tridy[t].list);
    for (var i = 0; i < zaci.length; i++) {
      var z = zaci[i];
      if (emailyBunky_(z.email).indexOf(diteEmail) === -1) continue;
      var info = { tridaId: tridy[t].id, tridaNazev: tridy[t].nazev, radek: z.radek, zak: jmenoZaka_(z.prijmeni, z.jmeno) };
      var jizTam = emailyBunky_(z.emailRodice);
      if (jizTam.indexOf(rodicEmail) !== -1) { out.push(info); continue; }
      if (jizTam.length >= MAX_RODICU_NA_ZAKA) continue;
      zajistiHlavickuRodice_(tridy[t].list);
      tridy[t].list.getRange(z.radek, SLOUPEC_RODICE).setValue(z.emailRodice ? z.emailRodice + ", " + rodicEmail : rodicEmail);
      out.push(info);
    }
  }
  return out;
}

// Řádky žáků začínají na 9. řádku a končí posledním řádkem, kde je ve sloupcích B–D něco vyplněno.
// (Souhrn pod tabulkou už se tak nepočítá jako další žák.)
function nactiRozsahStudentu_(sheet) {
  var start = 9;
  var posl = sheet.getLastRow();
  if (posl < start) return null;
  var data = sheet.getRange(start, 2, posl - start + 1, 3).getValues();
  var last = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][0]).trim() !== "" || String(data[i][1]).trim() !== "" || String(data[i][2]).trim() !== "") {
      last = start + i;
      break;
    }
  }
  if (!last) return null;
  return { startRow: start, lastRow: last, numRows: last - start + 1 };
}

// Sloupce se sbírkami (od sloupce G): v 6. řádku specifický symbol, v 7. název.
function najdiSbirky_(sheet) {
  var zMemo = hodnotyListuZMemo_(sheet);
  if (zMemo) return sbirkyZHodnot_(zMemo);                // při hromadném čtení už list známe
  var posl = sheet.getLastColumn();
  var out = [];
  if (posl < 7) return out;
  var ssRadek = sheet.getRange(6, 7, 1, posl - 6).getValues()[0];
  var nazvy = sheet.getRange(7, 7, 1, posl - 6).getValues()[0];
  for (var i = 0; i < ssRadek.length; i++) {
    var ss = String(ssRadek[i]).trim();
    var nazev = String(nazvy[i]).trim();
    if (/^[0-9]{6,10}$/.test(ss) && nazev !== "") {
      out.push({ colIndex: 7 + i, specSymbol: ss, nazev: nazev });
    }
  }
  return out;
}

// Stáří sbírky ve dnech podle SS (SS je časové razítko vzniku). Když SS razítko není, vrací 0.
function stariSbirkyVDnech_(specSymbol) {
  var s = String(specSymbol || "").trim();
  if (!/^[0-9]{10}$/.test(s)) return 0;
  return (Date.now() / 1000 - parseInt(s, 10)) / 86400;
}

// ---------- QR PLATBA (SPAYD) ----------
function sestavSpayd_(castka, vs, specSymbol, zprava) {
  var msg = removeAccents_(zprava).replace(/\*/g, " ").trim().substring(0, 60);
  return "SPD*1.0*ACC:" + profilSbirky_(specSymbol).iban + "*AM:" + castka.toFixed(2) + "*CC:CZK*X-VS:" + vs +
         "*X-SS:" + specSymbol + "*MSG:" + msg;
}

// QR kód se tvoří přímo ve skriptu (žádná externí webová služba). Obsah QR je pořád přesně tentýž
// text SPAYD jako dřív – mění se jen to, kdo obrázek nakreslí.
function vytvorQrBlob_(spayd, nazevSouboru) {
  return Utilities.newBlob(qrNaPodepsane_(qrPngBajty_(spayd)), "image/png", nazevSouboru);
}

// Obrázek QR kódu jako data URI (pro ukázku v náhledu odeslání v aplikaci).
function qrDataUri_(spayd) {
  return "data:image/png;base64," + Utilities.base64Encode(qrNaPodepsane_(qrPngBajty_(spayd)));
}

// ---------- VLASTNÍ GENERÁTOR QR KÓDU (ISO/IEC 18004, bajtový režim) ----------
// Postup: text -> UTF-8 -> datová slova -> Reed-Solomon -> proložení bloků -> matice modulů
// (vyhledávací vzory, časování, zarovnávací vzory, informace o formátu a verzi) -> nejlepší maska -> PNG.
var QR_UROVEN_BITY_ = { L: 1, M: 0, Q: 3, H: 2 };
// [úroveň][verze] – počet korekčních slov na jeden blok / počet bloků (index 0 se nepoužívá)
var QR_ECC_NA_BLOK_ = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
};
var QR_BLOKU_ = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
};
var QR_GF_EXP_ = null;
var QR_GF_LOG_ = null;

function qrInitGf_() {
  if (QR_GF_EXP_) return;
  QR_GF_EXP_ = [];
  QR_GF_LOG_ = [];
  var x = 1, i;
  for (i = 0; i < 256; i++) QR_GF_LOG_[i] = 0;
  for (i = 0; i < 255; i++) {
    QR_GF_EXP_[i] = x;
    QR_GF_LOG_[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (i = 255; i < 512; i++) QR_GF_EXP_[i] = QR_GF_EXP_[i - 255];
}

function qrNasob_(a, b) {
  if (!a || !b) return 0;
  return QR_GF_EXP_[QR_GF_LOG_[a] + QR_GF_LOG_[b]];
}

// Text -> bajty UTF-8
function qrUtf8_(text) {
  var out = [], s = String(text == null ? "" : text);
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
      var d = s.charCodeAt(i + 1);
      if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function qrSurovychModulu_(ver) {
  var r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    var n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

function qrDatovychSlov_(ver, ecl) {
  return Math.floor(qrSurovychModulu_(ver) / 8) - QR_ECC_NA_BLOK_[ecl][ver] * QR_BLOKU_[ecl][ver];
}

// Korekční slova (Reed-Solomon) pro jeden blok datových slov
function qrKorekce_(data, pocet) {
  var gen = [1], i, j;
  for (i = 0; i < pocet; i++) {                       // generující polynom (x-α^0)…(x-α^(pocet-1))
    var n = [];
    for (j = 0; j <= gen.length; j++) n.push(0);
    for (j = 0; j < gen.length; j++) {
      n[j] ^= gen[j];
      n[j + 1] ^= qrNasob_(gen[j], QR_GF_EXP_[i]);
    }
    gen = n;
  }
  var r = [];
  for (i = 0; i < pocet; i++) r.push(0);
  for (i = 0; i < data.length; i++) {
    var f = data[i] ^ r[0];
    r.shift();
    r.push(0);
    if (f) for (j = 0; j < pocet; j++) r[j] ^= qrNasob_(gen[j + 1], f);
  }
  return r;
}

function qrPoziceZarovnani_(ver) {
  if (ver === 1) return [];
  var n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  var krok = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  var out = [6];
  for (var pos = size - 7; out.length < n; pos -= krok) out.splice(1, 0, pos);
  return out;
}

// Vrací { verze, size, moduly[y][x] (true = tmavý) }
function qrMatice_(bajty, ecl, vynutMasku) {
  qrInitGf_();
  ecl = ecl || "M";
  var ver, i, j, k;
  for (ver = 1; ver <= 40; ver++) {
    var cc = ver < 10 ? 8 : 16;
    if (4 + cc + 8 * bajty.length <= qrDatovychSlov_(ver, ecl) * 8) break;
  }
  if (ver > 40) throw new Error("Text je na QR kód příliš dlouhý.");

  // --- datová slova
  var bity = [];
  function pridej(hodnota, pocet) { for (var b = pocet - 1; b >= 0; b--) bity.push((hodnota >>> b) & 1); }
  pridej(4, 4);                                       // bajtový režim
  pridej(bajty.length, ver < 10 ? 8 : 16);
  for (i = 0; i < bajty.length; i++) pridej(bajty[i], 8);
  var kapacita = qrDatovychSlov_(ver, ecl) * 8;
  for (i = 0; i < 4 && bity.length < kapacita; i++) bity.push(0);
  while (bity.length % 8 !== 0) bity.push(0);
  var slova = [];
  for (i = 0; i < bity.length; i += 8) {
    var w = 0;
    for (j = 0; j < 8; j++) w = (w << 1) | bity[i + j];
    slova.push(w);
  }
  for (var pad = 0xEC; slova.length < kapacita / 8; pad ^= 0xEC ^ 0x11) slova.push(pad);

  // --- bloky + korekce + proložení
  var pocetBloku = QR_BLOKU_[ecl][ver], eccBloku = QR_ECC_NA_BLOK_[ecl][ver];
  var vsechnaSlova = Math.floor(qrSurovychModulu_(ver) / 8);
  var kratkych = pocetBloku - vsechnaSlova % pocetBloku;
  var delkaKratkeho = Math.floor(vsechnaSlova / pocetBloku);
  var bloky = [], k0 = 0;
  for (i = 0; i < pocetBloku; i++) {
    var delkaDat = delkaKratkeho - eccBloku + (i < kratkych ? 0 : 1);
    var dat = slova.slice(k0, k0 + delkaDat);
    k0 += delkaDat;
    bloky.push({ dat: dat, ecc: qrKorekce_(dat, eccBloku) });
  }
  var vysledna = [];
  for (i = 0; i < delkaKratkeho - eccBloku + 1; i++) {
    for (j = 0; j < pocetBloku; j++) if (i < bloky[j].dat.length) vysledna.push(bloky[j].dat[i]);
  }
  for (i = 0; i < eccBloku; i++) for (j = 0; j < pocetBloku; j++) vysledna.push(bloky[j].ecc[i]);

  // --- matice
  var size = ver * 4 + 17;
  var m = [], fn = [];
  for (i = 0; i < size; i++) {
    var r1 = [], r2 = [];
    for (j = 0; j < size; j++) { r1.push(false); r2.push(false); }
    m.push(r1); fn.push(r2);
  }
  function nastav(x, y, tmavy) { m[y][x] = !!tmavy; fn[y][x] = true; }

  for (i = 0; i < size; i++) { nastav(6, i, i % 2 === 0); nastav(i, 6, i % 2 === 0); }   // časování
  function hledac(cx, cy) {
    for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
      var xx = cx + dx, yy = cy + dy;
      if (xx < 0 || xx >= size || yy < 0 || yy >= size) continue;
      var d = Math.max(Math.abs(dx), Math.abs(dy));
      nastav(xx, yy, d !== 2 && d !== 4);
    }
  }
  hledac(3, 3); hledac(size - 4, 3); hledac(3, size - 4);
  var poz = qrPoziceZarovnani_(ver), np = poz.length;
  for (i = 0; i < np; i++) for (j = 0; j < np; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === np - 1) || (i === np - 1 && j === 0)) continue;
    for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) {
      nastav(poz[i] + ax, poz[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
    }
  }
  function formatBity(maska) {
    var data = (QR_UROVEN_BITY_[ecl] << 3) | maska, rem = data;
    for (var b = 0; b < 10; b++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    function bit(n) { return ((bits >>> n) & 1) !== 0; }
    for (var q = 0; q <= 5; q++) nastav(8, q, bit(q));
    nastav(8, 7, bit(6)); nastav(8, 8, bit(7)); nastav(7, 8, bit(8));
    for (q = 9; q < 15; q++) nastav(14 - q, 8, bit(q));
    for (q = 0; q < 8; q++) nastav(size - 1 - q, 8, bit(q));
    for (q = 8; q < 15; q++) nastav(8, size - 15 + q, bit(q));
    nastav(8, size - 8, true);                         // vždy tmavý modul
  }
  formatBity(0);                                       // zatím jen rezervuje místo
  if (ver >= 7) {
    var rv = ver;
    for (i = 0; i < 12; i++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1F25);
    var vb = (ver << 12) | rv;
    for (i = 0; i < 18; i++) {
      var bt = ((vb >>> i) & 1) !== 0, a = size - 11 + i % 3, b2 = Math.floor(i / 3);
      nastav(a, b2, bt); nastav(b2, a, bt);
    }
  }

  // --- umístění dat (klikatě po dvou sloupcích zprava)
  var idx = 0, celkemBitu = vysledna.length * 8;
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (var vert = 0; vert < size; vert++) {
      for (j = 0; j < 2; j++) {
        var x = right - j, nahoru = ((right + 1) & 2) === 0, y = nahoru ? size - 1 - vert : vert;
        if (!fn[y][x] && idx < celkemBitu) {
          m[y][x] = ((vysledna[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0;
          idx++;
        }
      }
    }
  }

  // --- maska
  function pouzijMasku(maska) {
    for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
      if (fn[yy][xx]) continue;
      var inv;
      switch (maska) {
        case 0: inv = (xx + yy) % 2 === 0; break;
        case 1: inv = yy % 2 === 0; break;
        case 2: inv = xx % 3 === 0; break;
        case 3: inv = (xx + yy) % 3 === 0; break;
        case 4: inv = (Math.floor(xx / 3) + Math.floor(yy / 2)) % 2 === 0; break;
        case 5: inv = (xx * yy) % 2 + (xx * yy) % 3 === 0; break;
        case 6: inv = ((xx * yy) % 2 + (xx * yy) % 3) % 2 === 0; break;
        default: inv = ((xx + yy) % 2 + (xx * yy) % 3) % 2 === 0;
      }
      if (inv) m[yy][xx] = !m[yy][xx];
    }
  }
  function pokuta() {
    var skore = 0, yy, xx, c;
    var VZ1 = [true, false, true, true, true, false, true, false, false, false, false];
    var VZ2 = [false, false, false, false, true, false, true, true, true, false, true];
    function radek(ziskej) {                           // N1 + N3 pro jeden řádek/sloupec
      var s = 0, run = 1, t;
      for (var q = 1; q <= size; q++) {
        if (q < size && ziskej(q) === ziskej(q - 1)) run++;
        else { if (run >= 5) s += 3 + (run - 5); run = 1; }
      }
      for (q = 0; q + 11 <= size; q++) {
        var a = true, b = true;
        for (t = 0; t < 11 && (a || b); t++) {
          var v = ziskej(q + t);
          if (v !== VZ1[t]) a = false;
          if (v !== VZ2[t]) b = false;
        }
        if (a) s += 40;
        if (b) s += 40;
      }
      return s;
    }
    for (yy = 0; yy < size; yy++) { (function (y0) { skore += radek(function (q) { return m[y0][q]; }); })(yy); }
    for (xx = 0; xx < size; xx++) { (function (x0) { skore += radek(function (q) { return m[q][x0]; }); })(xx); }
    for (yy = 0; yy < size - 1; yy++) for (xx = 0; xx < size - 1; xx++) {   // N2
      c = m[yy][xx];
      if (c === m[yy][xx + 1] && c === m[yy + 1][xx] && c === m[yy + 1][xx + 1]) skore += 3;
    }
    var tmavych = 0;
    for (yy = 0; yy < size; yy++) for (xx = 0; xx < size; xx++) if (m[yy][xx]) tmavych++;
    var celkem = size * size;
    skore += (Math.ceil(Math.abs(tmavych * 20 - celkem * 10) / celkem) - 1) * 10;   // N4
    return skore;
  }
  var nejlepsi = 0, nejSkore = Infinity;
  for (k = 0; k < 8; k++) {
    if (vynutMasku >= 0 && vynutMasku <= 7 && k !== vynutMasku) continue;   // jen pro zkoušky
    pouzijMasku(k);
    formatBity(k);
    var sk = pokuta();
    if (sk < nejSkore) { nejSkore = sk; nejlepsi = k; }
    pouzijMasku(k);                                    // vrátit zpět
  }
  pouzijMasku(nejlepsi);
  formatBity(nejlepsi);
  return { verze: ver, size: size, maska: nejlepsi, moduly: m };
}

var QR_CRC_TAB_ = null;
function qrCrc32_(bajty) {
  if (!QR_CRC_TAB_) {
    QR_CRC_TAB_ = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      QR_CRC_TAB_.push(c >>> 0);
    }
  }
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < bajty.length; i++) crc = QR_CRC_TAB_[(crc ^ bajty[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function qrCtyri_(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }

function qrPngBlok_(typ, data) {
  var tb = [typ.charCodeAt(0), typ.charCodeAt(1), typ.charCodeAt(2), typ.charCodeAt(3)];
  var vse = tb.concat(data);
  return qrCtyri_(data.length).concat(vse, qrCtyri_(qrCrc32_(vse)));
}

// PNG, 1 bit na pixel (černobílé), zlib s nekomprimovanými bloky. Obsah je malý (asi 15 kB).
function qrPngZMatice_(matice, mierka, okraj) {
  var size = matice.size, sirka = (size + 2 * okraj) * mierka, bajtuNaRadek = Math.ceil(sirka / 8);
  var surova = [], mr, px, i, q;
  for (mr = -okraj; mr < size + okraj; mr++) {
    var radek = [0];                                   // filtr 0
    for (q = 0; q < bajtuNaRadek; q++) radek.push(0xFF);
    if (mr >= 0 && mr < size) {
      for (px = 0; px < sirka; px++) {
        var mx = Math.floor(px / mierka) - okraj;
        if (mx >= 0 && mx < size && matice.moduly[mr][mx]) radek[1 + (px >> 3)] &= ~(0x80 >> (px & 7));
      }
    }
    for (i = 0; i < mierka; i++) for (q = 0; q < radek.length; q++) surova.push(radek[q]);
  }
  var vyska = (size + 2 * okraj) * mierka;
  var z = [0x78, 0x01];                                // zlib hlavička
  for (var pos = 0; pos < surova.length || pos === 0; pos += 65535) {
    var kus = Math.min(65535, surova.length - pos), posledni = pos + kus >= surova.length;
    z.push(posledni ? 1 : 0, kus & 255, (kus >> 8) & 255, (~kus) & 255, ((~kus) >> 8) & 255);
    for (i = 0; i < kus; i++) z.push(surova[pos + i]);
    if (posledni) break;
  }
  var a = 1, b = 0;
  for (i = 0; i < surova.length; i++) { a = (a + surova[i]) % 65521; b = (b + a) % 65521; }
  z = z.concat(qrCtyri_(((b << 16) | a) >>> 0));
  var hlavicka = qrCtyri_(sirka).concat(qrCtyri_(vyska), [1, 0, 0, 0, 0]);   // hloubka 1 bit, šedá, bez prokládání
  var png = [137, 80, 78, 71, 13, 10, 26, 10];
  return png.concat(qrPngBlok_("IHDR", hlavicka), qrPngBlok_("IDAT", z), qrPngBlok_("IEND", []));
}

// Text (např. SPAYD) -> bajty PNG obrázku s QR kódem (kvalita opravy chyb M, tichá zóna 4 moduly).
function qrPngBajty_(text) {
  var matice = qrMatice_(qrUtf8_(text), "M");
  var mierka = Math.max(4, Math.ceil(300 / (matice.size + 8)));
  return qrPngZMatice_(matice, mierka, 4);
}

// Apps Script chce bajty se znaménkem (-128…127).
function qrNaPodepsane_(bajty) {
  var out = new Array(bajty.length);
  for (var i = 0; i < bajty.length; i++) out[i] = bajty[i] > 127 ? bajty[i] - 256 : bajty[i];
  return out;
}

// ---------- GMAIL ŠTÍTKY ----------
function getOrCreateLabel_(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
  }
  return label;
}

function getLabelName_(nazevSbirky, specSymbol) {
  var nazevBezZnaku = String(nazevSbirky || "Sbirka").replace(/[\/\\:*?"<>|]/g, "_");
  return STITEK_RODIC + "/" + nazevBezZnaku + " (" + specSymbol + ")";
}

// Štítek sbírky se hledá podle specifického symbolu (ne podle názvu), takže přežije
// i přejmenování sbírky v tabulce.
function najdiStitekPodleSS_(specSymbol) {
  var suffix = "(" + specSymbol + ")";
  var labels = GmailApp.getUserLabels();
  for (var i = 0; i < labels.length; i++) {
    var n = labels[i].getName();
    if (n.indexOf(STITEK_RODIC + "/") === 0 && n.slice(-suffix.length) === suffix) {
      return labels[i];
    }
  }
  return null;
}

function getOrCreateSbirkovyStitek_(nazevSbirky, specSymbol) {
  var existujici = najdiStitekPodleSS_(specSymbol);
  if (existujici) return existujici;
  getOrCreateLabel_(STITEK_RODIC); // nadřazený štítek, aby se podštítky správně zanořily
  return getOrCreateLabel_(getLabelName_(nazevSbirky, specSymbol));
}

// Pokročilá služba "Gmail API" (Služby -> Gmail API) umožňuje štítkovat jednotlivé
// ZPRÁVY. Bez ní umí GmailApp štítkovat jen celé KONVERZACE.
function gmailApiDostupne_() {
  try {
    return (typeof Gmail !== "undefined") && !!Gmail.Users;
  } catch (e) {
    return false;
  }
}

function getGmailLabelId_(labelName) {
  for (var pokus = 0; pokus < 3; pokus++) {
    var labels = Gmail.Users.Labels.list("me").labels || [];
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].name === labelName) return labels[i].id;
    }
    Utilities.sleep(700);
  }
  return null;
}

// Nastaví štítek přesně na platné platební zprávy dané sbírky:
// přidá chybějící a odebere ty, které už k sbírce nepatří.
function aplikovatStitek_(label, zpravy) {
  var info = { rezim: "konverzace", celkem: 0, pridano: 0, odebrano: 0, poznamka: "" };
  var i, id;

  if (gmailApiDostupne_()) {
    try {
      var labelId = getGmailLabelId_(label.getName());
      if (labelId) {
        var platne = {};
        for (i = 0; i < zpravy.length; i++) platne[zpravy[i].id] = true;

        var aktualni = {};
        var pageToken = null;
        do {
          var opts = { labelIds: [labelId], maxResults: 500 };
          if (pageToken) opts.pageToken = pageToken;
          var res = Gmail.Users.Messages.list("me", opts);
          var msgs = res.messages || [];
          for (i = 0; i < msgs.length; i++) aktualni[msgs[i].id] = true;
          pageToken = res.nextPageToken;
        } while (pageToken);

        var pridat = [], odebrat = [];
        for (id in platne) if (!aktualni[id]) pridat.push(id);
        for (id in aktualni) if (!platne[id]) odebrat.push(id);

        var davkyPridat = rozdelitNaDavky_(pridat, 1000);
        for (i = 0; i < davkyPridat.length; i++) {
          Gmail.Users.Messages.batchModify({ ids: davkyPridat[i], addLabelIds: [labelId] }, "me");
        }
        var davkyOdebrat = rozdelitNaDavky_(odebrat, 1000);
        for (i = 0; i < davkyOdebrat.length; i++) {
          Gmail.Users.Messages.batchModify({ ids: davkyOdebrat[i], removeLabelIds: [labelId] }, "me");
        }

        info.rezim = "zprávy";
        info.celkem = Object.keys(platne).length;
        info.pridano = pridat.length;
        info.odebrano = odebrat.length;
        return info;
      }
      info.poznamka = "Štítek se nepodařilo najít přes Gmail API, použit záložní režim po konverzacích. ";
    } catch (e) {
      info.poznamka = "Gmail API selhalo (" + e.message + "), použit záložní režim po konverzacích. ";
    }
  } else {
    info.poznamka = "Služba Gmail API není zapnutá – štítek se dává celým konverzacím. " +
                    "Pro označení jednotlivých e-mailů zapněte v editoru skriptu Služby (+) -> Gmail API. ";
  }

  // ----- Záložní režim: štítky po konverzacích -----
  var platnaVlakna = {};
  for (i = 0; i < zpravy.length; i++) platnaVlakna[zpravy[i].threadId] = zpravy[i].thread;

  var aktualniVlakna = {};
  var start = 0;
  while (start < MAX_VLAKEN) {
    var davka = label.getThreads(start, 100);
    for (i = 0; i < davka.length; i++) aktualniVlakna[davka[i].getId()] = davka[i];
    if (davka.length < 100) break;
    start += 100;
  }

  for (id in aktualniVlakna) {
    if (!platnaVlakna[id]) {
      label.removeFromThread(aktualniVlakna[id]);
      info.odebrano++;
    }
  }
  for (id in platnaVlakna) {
    if (!aktualniVlakna[id]) {
      platnaVlakna[id].addLabel(label);
      info.pridano++;
    }
  }
  info.celkem = Object.keys(platnaVlakna).length;
  return info;
}

function popisStitkovani_(label, info) {
  var txt = "• Štítek: " + label.getName() + "\n";
  if (info.rezim === "zprávy") {
    txt += "   označeno e-mailů: " + info.celkem + " (přidáno " + info.pridano + ", odebráno " + info.odebrano + ")\n";
  } else {
    txt += "   označeno konverzací: " + info.celkem + " (přidáno " + info.pridano + ", odebráno " + info.odebrano + ")\n";
  }
  if (info.poznamka) txt += "   POZNÁMKA: " + info.poznamka + "\n";
  return txt;
}

// ---------- ROZPOZNÁNÍ PLATBY V E-MAILU ----------
function isIncomingPayment_(bodyRaw) {
  var norm = removeAccents_(String(bodyRaw || "").toLowerCase());
  if (norm.indexOf("se snizil") !== -1 || norm.indexOf("odchozi uhrada") !== -1 || norm.indexOf("odchozi") !== -1 ||
      norm.indexOf("odepsano") !== -1 || norm.indexOf("odepsana") !== -1) return false;
  if (norm.indexOf("se zvysil") !== -1 || norm.indexOf("prichozi uhrada") !== -1 || norm.indexOf("prichozi") !== -1 || norm.indexOf("pripsano") !== -1 ||
      norm.indexOf("pripsana") !== -1 || norm.indexOf("prijem na uctu") !== -1 || norm.indexOf("prijem na ucte") !== -1 || norm.indexOf("prijata platba") !== -1 || norm.indexOf("dosla platba") !== -1) return true;
  return false;
}

// Obsahuje zpráva přesně tento specifický symbol (jako samostatné číslo)?
function obsahujeSS_(bodyRaw, specSymbol) {
  var ss = String(specSymbol || "").trim();
  if (!ss) return false;
  var bodyNorm = removeAccents_(String(bodyRaw || "").toLowerCase());
  return new RegExp("(?:^|[^0-9])" + ss + "(?:[^0-9]|$)").test(bodyNorm);
}

// ---------- ROZBOR BANKOVNÍHO E-MAILU (na míru Air Bank) ----------
// Air Bank píše například:
//   „zůstatek na účtu Třídní fond číslo 123456789/0800 se zvýšil o částku 100,00 CZK. Dostupný zůstatek …“
//   „Příchozí úhrada z účtu Jan Novák číslo 987654321/0100“
//   „Částka: 100,00 CZK“, „Datum zaúčtování: 11.10.2026“, „Variabilní symbol: 604189568“,
//   „Specifický symbol: 1791752729“, „Zpráva pro příjemce: divadlo“, „Kód transakce: 171228199272“
// Pole se čtou podle popisků (a jen z řádku s popiskem), takže se nepletou s „Dostupným zůstatkem“ ani s textem
// patičky. Co e-mail nemá, zůstane prázdné a platí dosavadní obecné rozpoznání (jiné banky).
function rozborBankovnihoEmailu_(bodyRaw) {
  var t = String(bodyRaw == null ? "" : bodyRaw).replace(/[   ​]/g, " ");
  var out = { smer: "", castka: 0, vs: null, ss: null, zprava: "", kod: "", datum: "", odJmeno: "", odUcet: "", naUcet: "" };
  var m;

  m = t.match(/z[ůu]statek\s+na\s+[úu][čc]tu\s+(.*?)\s+[čc][íi]slo\s+([0-9]+(?:-[0-9]+)?\/[0-9]{4})\s+se\s+(zv[ýy][šs]il|sn[íi][žz]il)/i);
  if (m) {
    out.naUcet = m[2];
    out.smer = /^zv/i.test(m[3]) ? "prichozi" : "odchozi";
  }
  m = t.match(/(P[řr][íi]choz[íi]|Odchoz[íi])\s+[úu]hrada\s+(?:z|na)\s+[úu][čc]tu\s+(.*?)\s+[čc][íi]slo\s+([0-9]+(?:-[0-9]+)?\/[0-9]{4})/i);
  if (m) {
    if (!out.smer) out.smer = /^p/i.test(m[1]) ? "prichozi" : "odchozi";
    out.odJmeno = String(m[2]).replace(/\s+/g, " ").trim();
    out.odUcet = m[3];
  }
  m = t.match(/(?:Variabiln[ií]\s+symbol|Var\.?\s*symbol|\bVS)\s*[:=]\s*([0-9]*)/i);
  if (m) out.vs = m[1];
  m = t.match(/(?:Specifick[ýy]\s+symbol|Spec\.?\s*symbol|\bSS)\s*[:=]\s*([0-9]*)/i);
  if (m) out.ss = m[1];
  m = t.match(new RegExp("(?:^|[\\s.])(?:Částka|Castka)(?:[ \\t]+platby|[ \\t]+transakce)?[ \\t]*[:=]?[ \\t]*[+]?" + CASTKA_RE, "i"));
  if (m && m[1]) { var v = parseCzAmount_(m[1]); if (v > 0) out.castka = v; }
  if (!(out.castka > 0)) {
    m = t.match(new RegExp("se\\s+zv[ýy][šs]il\\s+o\\s+[čc][áa]stku\\s*" + CASTKA_RE, "i"));
    if (m && m[1]) { var v2 = parseCzAmount_(m[1]); if (v2 > 0) out.castka = v2; }
  }
  m = t.match(/Zpr[áa]va\s+pro\s+p[řr][íi]jemce\s*:\s*([^\r\n]*?)\s*(?=K[óo]d\s+transakce\s*:|Datum\s+za[úu][čc]tov|Variabiln[ií]\s+symbol|Specifick[ýy]\s+symbol|\r|\n|$)/i);
  if (m) out.zprava = String(m[1]).replace(/\s+/g, " ").trim().substring(0, 140);
  m = t.match(/K[óo]d\s+transakce\s*:\s*([0-9A-Za-z]+)/i);
  if (m) out.kod = m[1];
  m = t.match(/Datum\s+za[úu][čc]tov[áa]n[íi]\s*:\s*([0-9]{1,2}\.\s?[0-9]{1,2}\.\s?[0-9]{4})/i);
  if (m) out.datum = m[1].replace(/\s+/g, "");
  return out;
}

// Je e-mail příchozí platba? Když banka směr uvádí přímo („se zvýšil“ / „Příchozí úhrada“), věří se tomu.
// Jinak platí dosavadní obecné hledání slov.
function jePrichoziPlatba_(bodyRaw, rozbor) {
  if (rozbor && rozbor.smer) return rozbor.smer === "prichozi";
  return isIncomingPayment_(bodyRaw);
}

// Patří e-mail k tomuto specifickému symbolu? Když má pole „Specifický symbol“, musí se shodovat přesně;
// bez něj (jiná banka) stačí, že číslo v textu je jako samostatné.
function ssEmailuSedi_(bodyRaw, rozbor, specSymbol) {
  var ss = String(specSymbol || "").trim();
  if (rozbor && rozbor.ss !== null && rozbor.ss !== undefined) {
    return rozbor.ss !== "" && normVs_(rozbor.ss) === normVs_(ss);
  }
  return obsahujeSS_(bodyRaw, ss);
}

function popisPlaticeZEmailu_(r) {
  var casti = [];
  if (r.odJmeno || r.odUcet) casti.push("Od: " + (r.odJmeno ? r.odJmeno : "") + (r.odUcet ? (r.odJmeno ? " (" + r.odUcet + ")" : r.odUcet) : ""));
  if (r.zprava) casti.push("Zpráva: " + r.zprava);
  return casti.join(" · ");
}

function extractAmountFromText_(text) {
  var lines = text.split(/\r?\n/);
  var reCastka = new RegExp("(?:Částka|Castka|Připsáno|Pripsano|Objem)[:\\s]*" + CASTKA_RE, "i");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var lineNorm = removeAccents_(line.toLowerCase());
    if (lineNorm.indexOf("dostupny zustatek") !== -1 || lineNorm.indexOf("zustatek k") !== -1 || lineNorm.indexOf("kod transakce") !== -1) continue;
    if (lineNorm.indexOf("castka:") !== -1 || lineNorm.indexOf("pripsano:") !== -1 || lineNorm.indexOf("objem:") !== -1) {
      var match = line.match(reCastka);
      if (match && match[1]) {
        var val = parseCzAmount_(match[1]);
        if (val > 0) return val;
      }
    }
  }
  var fallbackMatch = text.match(new RegExp("se\\s*zvýšil\\s*o\\s*částku\\s*" + CASTKA_RE, "i"));
  if (fallbackMatch && fallbackMatch[1]) {
    var fVal = parseCzAmount_(fallbackMatch[1]);
    if (fVal > 0) return fVal;
  }
  return 0;
}

// Variabilní symbol z textu e-mailu. Vrací null, pokud e-mail pole VS vůbec nemá,
// prázdný řetězec, pokud je pole prázdné, jinak číslo.
function parseVsFromBody_(bodyNorm) {
  var m = bodyNorm.match(/(?:variabiln\w*\s+symbol|\bvs)\s*[:=]?\s*([0-9]*)/);
  return m ? m[1] : null;
}

function normVs_(v) {
  return String(v == null ? "" : v).replace(/\s+/g, "").replace(/^0+/, "");
}

// Patří platba žákovi s tímto VS? (Dřív se hledal VS jako podřetězec celého e-mailu,
// takže krátké VS „zapadlo“ třeba do specifického symbolu nebo čísla účtu.)
function messageMatchesVs_(msgObj, vsClean) {
  var vsN = normVs_(vsClean);
  if (!vsN) return false;
  if (msgObj.vs !== null && msgObj.vs !== undefined) {
    return normVs_(msgObj.vs) === vsN;
  }
  var esc = vsN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?:^|[^0-9])0*" + esc + "(?:[^0-9]|$)").test(msgObj.bodyNorm);
}

function getExpectedAmount_(colCellVal, colEVal) {
  var colStr = String(colCellVal || "").trim();
  var eStr = String(colEVal || "").trim();
  if (colStr.indexOf('/') !== -1) {
    var m = colStr.match(/\/\s*([0-9]+(?:[.,][0-9]{1,2})?)/);
    if (m && m[1]) return parseFloat(m[1].replace(',', '.'));
  }
  var numCol = colStr.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (numCol) {
    var v1 = parseFloat(numCol[1].replace(',', '.'));
    if (v1 > 0) return v1;
  }
  var numE = eStr.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (numE) {
    var v2 = parseFloat(numE[1].replace(',', '.'));
    if (v2 > 0) return v2;
  }
  return 0;
}

// ---------- VYHLEDÁNÍ PLATEB V GMAILU ----------
// Dotaz se hledá od vzniku sbírky (SS je časové razítko), takže se s přibývajícím časem neztrácejí
// starší platby. Když SS razítko není, použije se okno HLEDAT_DNI.
function sestavDotazGmail_(specSymbol) {
  var ss = String(specSymbol || "").trim();
  var omezeni;
  var cas = parseInt(ss, 10);
  if (/^[0-9]{10}$/.test(ss) && cas > 1500000000 && cas < 4000000000) {
    var od = new Date((cas - 86400) * 1000);   // o den dřív pro jistotu (časová pásma)
    omezeni = "after:" + od.toISOString().slice(0, 10).replace(/-/g, "/");
  } else {
    omezeni = "newer_than:" + HLEDAT_DNI + "d";
  }
  return omezeni + ' "' + ss + '" -from:me';
}

// Domény bank, jejichž e-maily se berou jako platby: vestavěné + ty, které správce přidal v Nastavení.
function bankovniDomeny_() {
  var extra = PropertiesService.getScriptProperties().getProperty("BANKOVNI_DOMENY_NAVIC") || "";
  var pole = POVOLENE_BANKOVNI_DOMENY.slice();
  extra.split(/[\s,;]+/).forEach(function(d) {
    d = d.trim().toLowerCase();
    if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d) && pole.indexOf(d) === -1) pole.push(d);
  });
  return pole;
}

// Doména odesílatele z hlavičky From („Air Bank <info@airbank.cz>“ i „info@airbank.cz“).
function domenaOdesilatele_(from) {
  var s = String(from == null ? "" : from).toLowerCase();
  var m = s.match(/<([^<>\s]+)>\s*$/) || s.match(/([^\s<>"']+@[^\s<>"']+)/);
  var adresa = m ? m[1] : "";
  var i = adresa.lastIndexOf("@");
  return i === -1 ? "" : adresa.slice(i + 1).replace(/[>.,;]+$/, "");
}

// Patří odesílatel bance? Doména musí být přesně doména banky nebo její poddoména (info.airbank.cz). Dřív stačilo, že
// text domény byl kdekoli v hlavičce, takže třeba „x@kb.cz.neco.example“ nebo jméno „kb.cz“ prošlo jako banka.
function odesilatelZBanky_(from, domeny) {
  var d = domenaOdesilatele_(from);
  if (!d) return false;
  return domeny.some(function(b) { return d === b || (d.length > b.length && d.slice(-(b.length + 1)) === "." + b); });
}

// Zaznamená (nejvýš 15) e-maily, které se SS našly, ale nebyly přijaty – aby šlo uživateli říct proč.
function zaznamejOdmitnuti_(out, datum, rozbor, duvod) {
  if (out.stat.odmitnuto.length >= 15) return;
  var jeDatum = Object.prototype.toString.call(datum) === "[object Date]" && !isNaN(datum.getTime());
  out.stat.odmitnuto.push({ datum: jeDatum ? datum.toISOString() : "", castka: rozbor.castka || 0, vs: rozbor.vs || "", duvod: duvod });
}

// Vrací platné platební zprávy dané sbírky + statistiku, proč byly ostatní odmítnuty.
function najdiPlatebniZpravy_(specSymbol) {
  var query = sestavDotazGmail_(specSymbol);
  var out = {
    query: query,
    vlakna: 0,
    zpravy: [],
    stat: { celkemZprav: 0, neZBanky: 0, neobsahujeSS: 0, neprichozi: 0, bezCastky: 0, ukazkyOdesilatelu: [], odmitnuto: [] }
  };
  var videno = {};
  var start = 0, davka = 100;
  var domeny = bankovniDomeny_();

  while (start < MAX_VLAKEN) {
    var threads = GmailApp.search(query, start, davka);
    if (!threads.length) break;
    out.vlakna += threads.length;

    for (var t = 0; t < threads.length; t++) {
      var thread = threads[t];
      var msgs = thread.getMessages();
      for (var m = 0; m < msgs.length; m++) {
        var msg = msgs[m];
        var id = msg.getId();
        if (videno[id]) continue;
        videno[id] = true;
        out.stat.celkemZprav++;

        if (!odesilatelZBanky_(msg.getFrom(), domeny)) {
          out.stat.neZBanky++;
          if (out.stat.ukazkyOdesilatelu.length < 3) out.stat.ukazkyOdesilatelu.push(msg.getFrom());
          continue;
        }

        var bodyRaw = msg.getPlainBody();
        var rozbor = rozborBankovnihoEmailu_(bodyRaw);
        var datumZpravy = msg.getDate();
        if (!ssEmailuSedi_(bodyRaw, rozbor, specSymbol)) { out.stat.neobsahujeSS++; zaznamejOdmitnuti_(out, datumZpravy, rozbor, "e-mail neobsahuje specifický symbol " + specSymbol + (rozbor.ss ? " (má SS " + rozbor.ss + ")" : "")); continue; }
        if (!jePrichoziPlatba_(bodyRaw, rozbor)) { out.stat.neprichozi++; zaznamejOdmitnuti_(out, datumZpravy, rozbor, "nejde o příchozí platbu (odchozí úhrada / snížení zůstatku)"); continue; }
        var amt = rozbor.castka > 0 ? rozbor.castka : extractAmountFromText_(bodyRaw);
        if (!(amt > 0)) { out.stat.bezCastky++; zaznamejOdmitnuti_(out, datumZpravy, rozbor, "v e-mailu se nepodařilo najít částku"); continue; }

        var bodyNorm = removeAccents_(bodyRaw.toLowerCase());
        out.zpravy.push({
          id: id,
          threadId: thread.getId(),
          thread: thread,
          datum: datumZpravy,
          bodyNorm: bodyNorm,
          amount: amt,
          vs: rozbor.vs !== null ? rozbor.vs : parseVsFromBody_(bodyNorm),
          odJmeno: rozbor.odJmeno, odUcet: rozbor.odUcet, zprava: rozbor.zprava, kod: rozbor.kod
        });
      }
    }
    if (threads.length < davka) break;
    start += davka;
  }
  return out;
}

// ---------- STAV BUŇKY SBÍRKY ----------
// Buňku ve sloupci sbírky smí skript přepisovat jen když je prázdná, číselná, nebo je to
// jeho vlastní text (Zaplaceno…/Přeplatek…/Vybráno…). Ruční poznámka (např. „hotově“) zůstane nedotčená.
function jeSpravovanaBunka_(val) {
  if (val === "" || val === null || val === undefined) return true;
  if (typeof val === "number") return true;
  var s = String(val).trim();
  if (s === "") return true;
  if (/^[0-9]+(?:[.,][0-9]+)?$/.test(s)) return true;
  // Jen přesné tvary, které píše skript. Ruční „Zaplaceno hotově“ zůstane nedotčené.
  return /^(Zaplaceno\s*\(\s*[0-9.,]+\s*\/|Zaplaceno\s+[0-9.,]+\s*\/|Přeplatek\s*\(|Vybráno)/i.test(s);
}

function cisloZBunky_(s) {
  var v = parseFloat(String(s).replace(",", "."));
  return isNaN(v) ? 0 : v;
}

// Rozbor obsahu buňky sbírky -> stav pro aplikaci a pro výběr příjemců e-mailů.
// stav: zaplaceno | preplatek | castecne | nezaplaceno | rucne | nic
var BUNKA_CISLO_ = "([0-9]+(?:[.,][0-9]+)?)";
var RE_BUNKA_PREPLATEK_ = new RegExp("^Přeplatek\\s*\\(\\s*" + BUNKA_CISLO_ + "\\s*\\/\\s*" + BUNKA_CISLO_, "i");
var RE_BUNKA_ZAPLACENO_ = new RegExp("^Zaplaceno\\s*\\(\\s*" + BUNKA_CISLO_ + "\\s*\\/\\s*" + BUNKA_CISLO_, "i");
var RE_BUNKA_CASTECNE_ = new RegExp("^Zaplaceno\\s+" + BUNKA_CISLO_ + "\\s*\\/\\s*" + BUNKA_CISLO_, "i");

function rozborBunky_(val, eVal) {
  var out = { stav: "nic", zaplaceno: 0, ocekavano: 0, upravenoRucne: false, text: String(val == null ? "" : val).trim() };
  var s = out.text, m;
  if (typeof val === "number") {
    if (val > 0) { out.stav = "nezaplaceno"; out.ocekavano = val; }
    return out;
  }
  if (s === "" || /^Vybráno/i.test(s)) return out;
  if (/^[0-9]+(?:[.,][0-9]+)?$/.test(s)) {
    out.ocekavano = cisloZBunky_(s);
    out.stav = out.ocekavano > 0 ? "nezaplaceno" : "nic";
    return out;
  }
  // Text, který píše skript, končí „, ručně“, pokud se na částce podílí ručně zadaná platba.
  var konecRucne = /,\s*ručně\s*$/i.test(s);
  m = s.match(RE_BUNKA_PREPLATEK_);
  if (m) { out.stav = "preplatek"; out.upravenoRucne = konecRucne; out.zaplaceno = cisloZBunky_(m[1]); out.ocekavano = cisloZBunky_(m[2]); return out; }
  m = s.match(RE_BUNKA_ZAPLACENO_);
  if (m) { out.stav = "zaplaceno"; out.upravenoRucne = konecRucne; out.zaplaceno = cisloZBunky_(m[1]); out.ocekavano = cisloZBunky_(m[2]); return out; }
  m = s.match(RE_BUNKA_CASTECNE_);
  if (m) { out.stav = "castecne"; out.upravenoRucne = konecRucne; out.zaplaceno = cisloZBunky_(m[1]); out.ocekavano = cisloZBunky_(m[2]); return out; }
  out.stav = "rucne";
  return out;
}

// ---------- PŘIŘAZENÍ PLATEB ŽÁKŮM ----------
function jmenoZaka_(prijmeni, jmeno) {
  return (String(prijmeni == null ? "" : prijmeni).trim() + " " + String(jmeno == null ? "" : jmeno).trim()).trim();
}

function normJmeno_(s) {
  return removeAccents_(String(s == null ? "" : s).toLowerCase()).replace(/\s+/g, " ").trim();
}

// Ruční platba patří žákovi podle VS; když platba VS nemá (třeba hotovost žákovi bez VS), podle jména.
function rucniPatriZakovi_(zprava, prijmeni, jmeno, vsClean) {
  var vsP = normVs_(zprava.vs);
  if (vsP) return normVs_(vsClean) === vsP;
  var n = normJmeno_(zprava.zak);
  return n !== "" && n === normJmeno_(jmenoZaka_(prijmeni, jmeno));
}

function platbaPatriZakovi_(zprava, prijmeni, jmeno, vsClean) {
  if (zprava.rucni) return rucniPatriZakovi_(zprava, prijmeni, jmeno, vsClean);
  return vsClean !== "" && messageMatchesVs_(zprava, vsClean);
}

// ---------- VYHODNOCENÍ PLATEB PRO ŽÁKY + SOUHRN ----------
// Do sbírky patří jen žák, který má ve sloupci sbírky částku (číslo nebo text „Zaplaceno…“).
// Prázdná buňka = žák ve sbírce není (nespadne se ke sloupci E!).
// Upraví targetValues/targetBackgrounds podle zaplacených částek (platby z Gmailu + ručně zadané) a spočítá souhrn.
// Řádek je „žák“, když má vyplněný e-mail nebo VS (řádek typu „Celkem“ se ignoruje).
function vyhodnotStudenty_(mainData, targetValues, targetBackgrounds, zpravy) {
  var souhrn = {
    ocekavano: 0, vybrano: 0, pocetOcekavano: 0, pocetZaplaceno: 0,
    aktualizovano: 0, rucne: 0, bezVs: 0, upravenoRucne: 0, mimoSbirku: 0, vse: false
  };
  var prirazeni = {};   // id platby -> { jmeno, vs }

  for (var i = 0; i < mainData.length; i++) {
    var prijmeni = String(mainData[i][0] == null ? "" : mainData[i][0]).trim();
    var jmeno = String(mainData[i][1] == null ? "" : mainData[i][1]).trim();
    var email = String(mainData[i][2] == null ? "" : mainData[i][2]).trim();
    var vsClean = String(mainData[i][3] == null ? "" : mainData[i][3]).trim().replace(/\s+/g, '');
    if (email === "" && vsClean === "") continue;

    var bunka = targetValues[i][0];
    if (/^Vybráno/i.test(String(bunka == null ? "" : bunka))) bunka = "";
    var spravovana = jeSpravovanaBunka_(bunka);

    // Které platby žákovi patří (Gmail podle VS, ruční podle VS nebo jména)
    var gmailCelkem = 0, rucniCelkem = 0, rucniPocet = 0, mojeId = [];
    for (var v = 0; v < zpravy.length; v++) {
      var z = zpravy[v];
      if (!platbaPatriZakovi_(z, prijmeni, jmeno, vsClean)) continue;
      if (z.rucni) { rucniCelkem += z.amount; rucniPocet++; } else { gmailCelkem += z.amount; }
      mojeId.push(z.id);
    }
    var celkemZaplaceno = round2_(gmailCelkem + rucniCelkem);

    // Ruční text v buňce (např. „Zaplaceno hotově“) skript nepřepisuje – leda že u žáka
    // přibyla platba zadaná v aplikaci. Částka se pak vezme ze sloupce E (jako dřív).
    var ocek = spravovana ? round2_(getExpectedAmount_(bunka, "")) : round2_(getExpectedAmount_("", mainData[i][4]));
    // Platby žáka se v historii označí jménem; když žák ve sbírce není, platba se jen zapíše s poznámkou.
    for (var q = 0; q < mojeId.length; q++) {
      prirazeni[mojeId[q]] = { jmeno: jmenoZaka_(prijmeni, jmeno), vs: vsClean, mimo: ocek <= 0 };
    }
    if (ocek <= 0) { souhrn.mimoSbirku++; continue; }   // žák ve sbírce není

    souhrn.pocetOcekavano++;
    souhrn.ocekavano += ocek;

    if (!spravovana && rucniPocet === 0) { souhrn.rucne++; continue; }   // ruční poznámka: buňku neměníme
    if (vsClean === "" && rucniPocet === 0) souhrn.bezVs++;              // bez VS nelze párovat s bankou

    souhrn.vybrano += celkemZaplaceno;
    if (celkemZaplaceno >= ocek - 0.005) souhrn.pocetZaplaceno++;
    var priponaRucne = rucniPocet > 0 ? ", ručně" : "";

    if (celkemZaplaceno > 0) {
      if (celkemZaplaceno > ocek + 0.005) {
        targetValues[i][0] = "Přeplatek (" + celkemZaplaceno + "/" + ocek + " Kč)" + priponaRucne;
        targetBackgrounds[i][0] = "#93c47d";
      } else if (Math.abs(celkemZaplaceno - ocek) <= 0.005) {
        targetValues[i][0] = "Zaplaceno (" + celkemZaplaceno + "/" + ocek + " Kč)" + priponaRucne;
        targetBackgrounds[i][0] = "#d9ead3";
      } else {
        targetValues[i][0] = "Zaplaceno " + celkemZaplaceno + "/" + ocek + " Kč" + priponaRucne;
        targetBackgrounds[i][0] = "#fff2cc";
      }
      if (rucniPocet > 0) souhrn.upravenoRucne++;
      souhrn.aktualizovano++;
    } else {
      // Pokud žák nezaplatil nic, obnovíme výchozí neuhrazený stav
      targetValues[i][0] = ocek;
      targetBackgrounds[i][0] = "#f4cccc";
    }
  }

  souhrn.ocekavano = round2_(souhrn.ocekavano);
  souhrn.vybrano = round2_(souhrn.vybrano);
  souhrn.vse = souhrn.pocetOcekavano > 0 && souhrn.pocetZaplaceno === souhrn.pocetOcekavano;
  return { souhrn: souhrn, prirazeni: prirazeni };
}

function souhrnText_(s) {
  return "Vybráno " + fmtKc_(s.vybrano) + " / " + fmtKc_(s.ocekavano) + " Kč (" +
         s.pocetZaplaceno + "/" + s.pocetOcekavano + " žáků)";
}

// Souhrn „vybráno z kolika“ pod posledním řádkem žáků ve sloupci sbírky.
function zapisSouhrn_(sheet, colIndex, radek, souhrn) {
  var maxRadku = sheet.getMaxRows();
  if (radek > maxRadku) sheet.insertRowsAfter(maxRadku, radek - maxRadku);
  var bunka = sheet.getRange(radek, colIndex);
  bunka.setValue(souhrnText_(souhrn));
  bunka.setFontWeight("bold").setWrap(true).setBackground(souhrn.vse ? "#b6d7a8" : "#e8eaed");
}

// ---------- HISTORIE PLATEB ----------
// Odkaz míří na účet, kam chodí bankovní e-maily (GMAIL_UCET), a na konkrétní zprávu. Parametr authuser
// řekne Gmailu, který z přihlášených účtů má použít; když v prohlížeči přihlášený není, Google nabídne
// přihlášení (dřív tvar /u/<adresa>/ v takovém případě skončil chybou 404). E-mail jde vždy otevřít
// i přímo v aplikaci (tlačítko „Zobrazit“ v historii plateb), bez ohledu na to, kdo je v prohlížeči přihlášený.
var ODKAZY_VERZE = "4";

function odkazNaEmail_(idZpravy) {
  var ucet = mailboxCtena_();
  return "https://mail.google.com/mail/" + (ucet ? "?authuser=" + encodeURIComponent(ucet) : "") + "#all/" + idZpravy;
}

// Odkaz v buňce jako formátovaný text s odkazem (ne vzorec =HYPERLINK, který v některých
// nastaveních Tabulek končil chybou #ERROR!).
function nastavOdkazy_(list, prvniRadek, ids) {
  if (!ids.length) return;
  var rich = ids.map(function(id) {
    var b = SpreadsheetApp.newRichTextValue();
    id = String(id == null ? "" : id).trim();
    if (!id) return [b.setText("").build()];
    if (jeRucniId_(id)) return [b.setText("Zadáno ručně").build()];   // ruční platba nemá e-mail
    return [b.setText("Otevřít e-mail").setLinkUrl(odkazNaEmail_(id)).build()];
  });
  var rng = list.getRange(prvniRadek, 8, ids.length, 1);
  rng.clearContent();
  rng.setRichTextValues(rich);
}

// Přepíše odkazy u už zapsaných plateb podle ID zprávy ve sloupci I.
// Automaticky proběhne jednou po nasazení této verze; ručně přes opravitOdkazyVHistorii().
function opravOdkazyVHistorii_(ss, vynutit) {
  var props = PropertiesService.getScriptProperties();
  if (!vynutit && props.getProperty("HISTORIE_ODKAZY_VERZE") === ODKAZY_VERZE) return 0;
  var list = ss.getSheetByName(LIST_HISTORIE);
  if (!list) return 0;

  list.getRange(1, 9, list.getMaxRows(), 1).setNumberFormat("@");   // ID zprávy jako text
  var posl = list.getLastRow();
  var opraveno = 0;
  if (posl >= 2) {
    var ids = list.getRange(2, 9, posl - 1, 1).getValues();
    nastavOdkazy_(list, 2, ids.map(function(r) { return r[0]; }));
    opraveno = posl - 1;
  }
  props.setProperty("HISTORIE_ODKAZY_VERZE", ODKAZY_VERZE);
  return opraveno;
}

function opravitOdkazyVHistorii() {
  jenZMenu_();
  try {
    var n = opravOdkazyVHistorii_(getSS_(), true);
    hlaska_("Odkazy v historii", "Opraveno odkazů: " + n + "\nOdkazy teď míří na účet " + mailboxCtena_() + ".");
  } catch (e) {
    hlaska_("Chyba", e.message);
  }
}

// Formáty nastavit PŘED zápisem, jinak by se SS/VS/ID podobné číslu převedly na číslo.
function formatujRadkyHistorie_(list, prvniRadek, pocet) {
  list.getRange(prvniRadek, 1, pocet, 1).setNumberFormat("dd.MM.yyyy HH:mm");
  list.getRange(prvniRadek, 3, pocet, 1).setNumberFormat("@");
  list.getRange(prvniRadek, 5, pocet, 1).setNumberFormat("@");
  list.getRange(prvniRadek, 6, pocet, 1).setNumberFormat("#,##0.00");
  list.getRange(prvniRadek, 9, pocet, 1).setNumberFormat("@").setFontColor("#999999");
}

function jeRucniId_(id) {
  return String(id == null ? "" : id).indexOf(PREFIX_RUCNE) === 0;
}

// Poznámka k ruční platbě: jednořádková, bez řídicích znaků, nejvýše 200 znaků.
function cistaPoznamka_(s) {
  return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().substring(0, 200);
}

// Záznamy historie jedné sbírky (podle SS): platby z Gmailu i ruční.
function nactiZaznamyHistorie_(ss, specSymbol) {
  var out = [];
  var v = surovaHistorie_(ss);
  if (!v.length) return out;
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][2] == null ? "" : v[i][2]).trim() !== String(specSymbol)) continue;
    var id = String(v[i][8] == null ? "" : v[i][8]).trim();
    if (!id) continue;
    out.push({
      listRadek: i + 2, id: id, rucni: jeRucniId_(id), datum: v[i][0],
      zak: String(v[i][3] == null ? "" : v[i][3]).trim(),
      vs: String(v[i][4] == null ? "" : v[i][4]).trim(),
      castka: typeof v[i][5] === "number" ? v[i][5] : cisloZBunky_(v[i][5]),
      poznamka: String(v[i][6] == null ? "" : v[i][6]).trim()
    });
  }
  return out;
}

// Obsah bankovního e-mailu z historie plateb pro zobrazení přímo v aplikaci (funguje bez ohledu na to, jaký
// Google účet je v prohlížeči přihlášený). Smí se číst jen zprávy, které jsou zapsané v historii plateb.
function nactiZpravuZHistorie_(ss, id) {
  id = String(id == null ? "" : id).trim();
  if (!/^[0-9a-fA-F]{8,32}$/.test(id)) throw new Error("Neplatné ID zprávy.");
  var list = ss.getSheetByName(LIST_HISTORIE);
  var nalezeno = false;
  if (list && list.getLastRow() >= 2) {
    var ids = list.getRange(2, 9, list.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0] == null ? "" : ids[i][0]).trim() === id) { nalezeno = true; break; }
    }
  }
  if (!nalezeno) throw new Error("Tahle zpráva není v historii plateb.");
  var msg = null;
  try { msg = GmailApp.getMessageById(id); } catch (e) { msg = null; }
  if (!msg) throw new Error("E-mail už v Gmailu není (byl smazán) nebo je v jiné schránce, než ze které aplikace čte.");
  var telo = String(msg.getPlainBody() || "");
  var MAX = 6000;
  var d = null;
  try { d = msg.getDate(); } catch (e2) {}
  return {
    id: id,
    od: String(msg.getFrom() || ""),
    predmet: String(msg.getSubject() || ""),
    datum: d && !isNaN(d.getTime()) ? d.toISOString() : "",
    text: telo.length > MAX ? telo.substring(0, MAX) : telo,
    zkraceno: telo.length > MAX,
    odkaz: odkazNaEmail_(id)
  };
}

// Záznamy z historie ve tvaru „zprávy“, který čeká vyhodnotStudenty_ (jenRucni = jen ručně zadané platby).
function zaznamyJakoZpravy_(zaznamy, jenRucni) {
  var out = [];
  for (var i = 0; i < zaznamy.length; i++) {
    var z = zaznamy[i];
    if (jenRucni && !z.rucni) continue;
    if (!(z.castka > 0)) continue;
    out.push({ id: z.id, threadId: "", thread: null, datum: z.datum, bodyNorm: "", amount: z.castka, vs: z.vs, zak: z.zak, poznamka: z.poznamka, rucni: z.rucni });
  }
  return out;
}

// Ruční platba (hotovost apod.) se zapíše jako řádek historie s ID „RUCNE-…“. Díky tomu přežije
// každou další kontrolu Gmailu: stav žáka se vždy počítá z Gmailu + ručních plateb dohromady.
function zapisRucniPlatbu_(ss, nazevSbirky, specSymbol, zak, vs, castka, poznamka, kdo) {
  opravOdkazyVHistorii_(ss, false);
  var list = getListHistorie_(ss);
  var radek = Math.max(list.getLastRow(), 1) + 1;
  if (radek > list.getMaxRows()) list.insertRowsAfter(list.getMaxRows(), radek - list.getMaxRows());
  var id = PREFIX_RUCNE + Utilities.getUuid().replace(/-/g, "").substring(0, 12);
  var pozn = cistaPoznamka_(poznamka);
  formatujRadkyHistorie_(list, radek, 1);
  list.getRange(radek, 1, 1, HISTORIE_HLAVICKA.length).setValues([[
    new Date(), nazevSbirky, String(specSymbol), zak, vs, round2_(castka),
    "Ručně zadáno" + (kdo ? " (" + cistaPoznamka_(kdo).replace(/[()]/g, "") + ")" : "") + (pozn ? ": " + pozn : ""), "Zadáno ručně", id
  ]]);
  nastavOdkazy_(list, radek, [id]);
  return id;
}

// Smaže ručně zadanou platbu (platby z Gmailu mazat nejde). Vrací SS sbírky, ke které patřila.
function smazRucniPlatbu_(ss, id, zakazaneSS) {
  id = String(id == null ? "" : id).trim();
  if (!jeRucniId_(id)) throw new Error("Smazat jde jen ručně zadanou platbu.");
  var list = ss.getSheetByName(LIST_HISTORIE);
  if (!list || list.getLastRow() < 2) throw new Error("Platba nenalezena.");
  var v = list.getRange(2, 1, list.getLastRow() - 1, HISTORIE_HLAVICKA.length).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][8] == null ? "" : v[i][8]).trim() === id) {
      var specSymbol = String(v[i][2] == null ? "" : v[i][2]).trim();
      if (zakazaneSS && zakazaneSS[specSymbol]) throw new Error("Sbírka je v archivované třídě (jen pro čtení). Chcete-li platbu smazat, nejdřív třídu obnovte.");
      list.deleteRow(i + 2);
      return specSymbol;
    }
  }
  throw new Error("Platba nenalezena (možná už byla smazána).");
}

// Každá platba (= jeden bankovní e-mail) se zapíše jednou; podle ID zprávy se nic nezdvojuje.
function zapisDoHistorie_(ss, nazevSbirky, specSymbol, zpravy, prirazeni) {
  opravOdkazyVHistorii_(ss, false);   // jednorázová oprava starých odkazů
  if (!zpravy.length) return 0;
  var list = getListHistorie_(ss);
  var posl = list.getLastRow();

  var existujici = {};
  if (posl >= 2) {
    var ids = list.getRange(2, HISTORIE_HLAVICKA.length, posl - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) existujici[String(ids[i][0])] = true;
  }

  var nove = zpravy.filter(function(z) { return !existujici[z.id]; });
  if (!nove.length) return 0;
  nove.sort(function(a, b) { return a.datum - b.datum; });

  var radky = nove.map(function(z) {
    var p = prirazeni[z.id];
    var poznamka = "";
    if (!p) {
      poznamka = z.vs ? "Nepřiřazeno – VS " + z.vs + " nepatří žádnému žákovi" : "Nepřiřazeno – platba bez VS";
    } else if (p.mimo) {
      poznamka = "Žák v době zápisu nebyl v této sbírce – platba se nezapočítala";
    }
    var platce = popisPlaticeZEmailu_(z);
    if (platce) poznamka = poznamka ? poznamka + " · " + platce : platce;
    var odkaz = "Otevřít e-mail";   // skutečný odkaz se doplní níže jako rich text
    return [
      z.datum,
      nazevSbirky,
      String(specSymbol),
      p ? p.jmeno : "",
      p ? p.vs : (z.vs || ""),
      z.amount,
      poznamka,
      odkaz,
      z.id
    ];
  });

  var prvniRadek = Math.max(posl, 1) + 1;
  var potrebaRadku = prvniRadek + radky.length - 1;
  if (potrebaRadku > list.getMaxRows()) {
    list.insertRowsAfter(list.getMaxRows(), potrebaRadku - list.getMaxRows());
  }
  formatujRadkyHistorie_(list, prvniRadek, radky.length);
  list.getRange(prvniRadek, 1, radky.length, HISTORIE_HLAVICKA.length).setValues(radky);
  nastavOdkazy_(list, prvniRadek, radky.map(function(r) { return r[8]; }));
  return radky.length;
}

// ---------- E-MAIL „VŠE ZAPLACENO“ ----------
function odeslatEmailVseZaplaceno_(nazevSbirky, souhrn, urlTabulky, komu) {
  var predmet = "Sbírka „" + nazevSbirky + "“ – vše zaplaceno ✓";
  var text = "Všichni žáci (" + souhrn.pocetZaplaceno + "/" + souhrn.pocetOcekavano + ") už zaplatili sbírku „" +
             nazevSbirky + "“.\nVybráno: " + fmtKc_(souhrn.vybrano) + " / " + fmtKc_(souhrn.ocekavano) + " Kč.\n\nTabulka: " + urlTabulky;
  var html = "<p>Všichni žáci (<b>" + souhrn.pocetZaplaceno + "/" + souhrn.pocetOcekavano + "</b>) už zaplatili sbírku <b>„" +
             escHtml_(nazevSbirky) + "“</b>. ✓</p>" +
             "<p>Vybráno: <b>" + fmtKc_(souhrn.vybrano) + " / " + fmtKc_(souhrn.ocekavano) + " Kč</b></p>" +
             "<p><a href='" + escHtml_(urlTabulky) + "'>Otevřít tabulku</a></p>";
  if (!jeEmail_(komu)) throw new Error("Není nastavený e-mail pro oznámení o platbách (Nastavení → Můj profil).");
  posliSystemovyEmail_(komu, predmet, text, html);
}

// E-mail se pošle jednou, když se sbírka dostane do stavu „všichni zaplatili“.
// Když se to později změní (např. přibude žák), příznak se smaže a může přijít znovu.
function jeUpozorneniZapnuto_() {
  return PropertiesService.getScriptProperties().getProperty("UPOZORNENI_VSE_ZAPLACENO") !== "0";
}

function oznamVseZaplaceno_(nazevSbirky, specSymbol, souhrn, urlTabulky) {
  var props = PropertiesService.getScriptProperties();
  var klic = "VSE_ZAPLACENO_" + specSymbol;
  if (souhrn.vse) {
    if (!jeUpozorneniZapnuto_()) return false;
    if (props.getProperty(klic)) return false;
    odeslatEmailVseZaplaceno_(nazevSbirky, souhrn, urlTabulky, profilSbirky_(specSymbol).emailOznameni);
    props.setProperty(klic, new Date().toISOString());   // až po úspěšném odeslání
    return true;
  }
  if (props.getProperty(klic)) props.deleteProperty(klic);
  return false;
}

// ---------- NESPÁROVANÉ PLATBY ----------
// Z plateb sbírky (záznamy z historie) vybere ty, které žádnému žákovi ve sbírce nepatří, a ke každé
// napíše důvod. Počítá se z toho, co je teď v tabulce, takže po opravě (např. přidání žáka do sbírky)
// platba ze seznamu sama zmizí.
//  studenti: [{ prijmeni, jmeno, vs, stav }] (stav „nic“ = žák ve sbírce není)
function nesparovaneZHistorie_(zaznamy, studenti) {
  var out = [], vsMapa = null;
  for (var i = 0; i < zaznamy.length; i++) {
    var z = zaznamy[i];
    if (z.rucni || !(z.castka > 0)) continue;
    var vsN = normVs_(z.vs);
    var shoda = null;
    for (var k = 0; k < studenti.length; k++) {
      if (vsN && normVs_(studenti[k].vs) === vsN) { shoda = studenti[k]; break; }
    }
    if (!shoda && !vsN && z.zak) {                       // platba bez VS, kterou skript přiřadil jinak (podle textu e-mailu)
      for (var k2 = 0; k2 < studenti.length; k2++) {
        if (normJmeno_(jmenoZaka_(studenti[k2].prijmeni, studenti[k2].jmeno)) === normJmeno_(z.zak)) { shoda = studenti[k2]; break; }
      }
    }
    var duvod = "";
    if (shoda) {
      if (shoda.stav !== "nic") continue;                // spárováno
      duvod = "Žák " + jmenoZaka_(shoda.prijmeni, shoda.jmeno) + " ve třídě je, ale v téhle sbírce není – platba se nezapočítala. Přidejte ho do sbírky.";
    } else if (!vsN) {
      duvod = "Platba nemá variabilní symbol, nejde přiřadit žákovi. Zapište ji ručně u správného žáka.";
    } else {
      if (vsMapa === null) { try { vsMapa = pouziteVs_(); } catch (e) { vsMapa = {}; } }
      var jinde = vsMapa[vsN];
      duvod = jinde
        ? "VS " + z.vs + " patří žákovi " + jinde.zak + " (třída " + jinde.trida + "), který v téhle sbírce není. Sbírka patří jiné třídě – zapište platbu ručně nebo žáka přesuňte."
        : "Žádný žák nemá VS " + z.vs + ". Zkontrolujte VS ve třídě nebo platbu zapište ručně.";
    }
    var jeDatum = Object.prototype.toString.call(z.datum) === "[object Date]" && !isNaN(z.datum.getTime());
    out.push({
      id: z.id, datum: jeDatum ? z.datum.toISOString() : "", castka: z.castka, vs: z.vs,
      platce: String(z.poznamka || "").split(" · ").filter(function(c) { return /^(Od|Zpráva):/.test(c); }).join(" · "),
      duvod: duvod, mimo: !!shoda
    });
  }
  return out;
}

// ---------- JÁDRO KONTROLY JEDNÉ SBÍRKY (používá ruční i automatická kontrola) ----------
// volby.bezGmailu = true: Gmail se neprohledává, platby z Gmailu se vezmou z historie (rychlé přepočítání
// po ruční úpravě). Ručně zadané platby se do výpočtu zahrnují VŽDY.
function zkontrolujSbirku_(sheet, colIndex, volby) {
  volby = volby || {};
  var rozsah = nactiRozsahStudentu_(sheet);
  if (!rozsah) throw new Error("V tabulce chybí data studentů (od řádku 9).");

  var specSymbol = String(sheet.getRange(6, colIndex).getValue()).trim();
  var zpravaSbirky = String(sheet.getRange(7, colIndex).getValue()).trim();
  if (!specSymbol) throw new Error("Chybí Specifický symbol v 6. řádku sloupce " + getColLetter_(colIndex) + "!");
  var nazev = zpravaSbirky || ("sloupec " + getColLetter_(colIndex));

  var mainData = sheet.getRange(rozsah.startRow, 1, rozsah.numRows, 5).getValues();
  var targetRange = sheet.getRange(rozsah.startRow, colIndex, rozsah.numRows, 1);
  var targetValues = targetRange.getValues();
  var targetBackgrounds = targetRange.getBackgrounds();
  var tabulka = sheet.getParent();

  var res = {
    nazev: nazev, specSymbol: specSymbol, colIndex: colIndex,
    pocetPlateb: 0, souhrn: null, stitekText: "", historiePridano: 0,
    emailPoslan: false, bezGmailu: !!volby.bezGmailu, chyby: [], diag: null, nesparovano: []
  };

  var zaznamy = nactiZaznamyHistorie_(tabulka, specSymbol);
  var validMessages, platby;

  if (volby.bezGmailu) {
    // Platby z Gmailu už jsou v historii (zapsala je předchozí kontrola)
    validMessages = zaznamyJakoZpravy_(zaznamy.filter(function(z) { return !z.rucni; }), false);
    res.pocetPlateb = validMessages.length;
    res.stitekText = "";
  } else {
    // KROK A: Najdi platební e-maily v Gmailu podle přesného specifického symbolu
    var nalez = najdiPlatebniZpravy_(specSymbol);
    validMessages = nalez.zpravy;
    res.pocetPlateb = validMessages.length;
    res.diag = {
      dotaz: nalez.query, vlaken: nalez.vlakna, zprav: nalez.stat.celkemZprav, neZBanky: nalez.stat.neZBanky,
      neobsahujeSS: nalez.stat.neobsahujeSS, neprichozi: nalez.stat.neprichozi, bezCastky: nalez.stat.bezCastky,
      prijato: validMessages.length, ukazkyOdesilatelu: nalez.stat.ukazkyOdesilatelu, odmitnuto: nalez.stat.odmitnuto
    };

    // KROK B: Štítek sbírky – chyba ve štítkování nesmí zablokovat vyhodnocení plateb
    try {
      var stitek = getOrCreateSbirkovyStitek_(zpravaSbirky, specSymbol);
      var stitekInfo = aplikovatStitek_(stitek, validMessages);
      res.stitekText = popisStitkovani_(stitek, stitekInfo);
    } catch (eStitek) {
      res.stitekText = "• Štítkování v Gmailu selhalo: " + eStitek.message + "\n";
      res.chyby.push("Štítky: " + eStitek.message);
    }
  }
  var rucniPlatby = zaznamyJakoZpravy_(zaznamy, true);
  platby = validMessages.concat(rucniPlatby);

  // KROK C: Vyhodnocení plateb pro jednotlivé žáky (Gmail + ručně zadané) + souhrn pod tabulkou
  var v = vyhodnotStudenty_(mainData, targetValues, targetBackgrounds, platby);
  res.souhrn = v.souhrn;
  targetRange.setValues(targetValues);
  targetRange.setBackgrounds(targetBackgrounds);
  zapisSouhrn_(sheet, colIndex, rozsah.lastRow + 1, v.souhrn);

  // KROK D: Historie plateb na druhém listu (jen nové platby z Gmailu; ruční tam už jsou)
  if (!volby.bezGmailu) {
    try {
      res.historiePridano = zapisDoHistorie_(tabulka, nazev, specSymbol, validMessages, v.prirazeni);
    } catch (eHist) {
      res.chyby.push("Historie: " + eHist.message);
    }
  }

  // Platby, které se nepodařilo přiřadit žákovi (aby bylo vidět proč)
  try {
    var studentiProRozbor = [];
    for (var qi = 0; qi < mainData.length; qi++) {
      var rr = mainData[qi];
      if (!jeZakRadek_(rr)) continue;
      studentiProRozbor.push({ prijmeni: String(rr[0] == null ? "" : rr[0]).trim(), jmeno: String(rr[1] == null ? "" : rr[1]).trim(), vs: String(rr[3] == null ? "" : rr[3]).trim(), stav: rozborBunky_(targetValues[qi][0], rr[4]).stav });
    }
    res.nesparovano = nesparovaneZHistorie_(nactiZaznamyHistorie_(tabulka, specSymbol), studentiProRozbor);
  } catch (eN) {}

  // KROK E: Všichni zaplatili -> e-mail na osobní Gmail
  try {
    res.emailPoslan = oznamVseZaplaceno_(nazev, specSymbol, v.souhrn, tabulka.getUrl());
  } catch (eMail) {
    res.chyby.push("E-mail „vše zaplaceno“: " + eMail.message);
  }

  if (!volby.bezGmailu) {
    try {
      PropertiesService.getScriptProperties().setProperty("KONTROLA_" + specSymbol, new Date().toISOString());
    } catch (eK) {}
  }
  return res;
}

function sestavHlaseniKontroly_(res) {
  var s = res.souhrn;
  var txt = "Kontrola dokončena! (sbírka „" + res.nazev + "“)\n" +
    "• Ověřeno platných e-mailů se SS: " + res.pocetPlateb + "\n" +
    "• Zaktualizováno žáků: " + s.aktualizovano + "\n" +
    "• Vybráno: " + fmtKc_(s.vybrano) + " / " + fmtKc_(s.ocekavano) + " Kč (" + s.pocetZaplaceno + "/" + s.pocetOcekavano + " žáků)\n" +
    "• Do historie přidáno nových plateb: " + res.historiePridano + "\n";
  if (res.emailPoslan) txt += "• VŠICHNI ZAPLATILI – poslán e-mail na " + profilSbirky_(res.specSymbol).emailOznameni + "\n";
  if (s.upravenoRucne > 0) txt += "• Ručně upraveno žáků: " + s.upravenoRucne + "\n";
  if (s.rucne > 0 || s.bezVs > 0) {
    txt += "• Pozor: " + (s.rucne > 0 ? s.rucne + "× ruční poznámka v buňce (ponechána beze změny)" : "") +
           (s.rucne > 0 && s.bezVs > 0 ? ", " : "") +
           (s.bezVs > 0 ? s.bezVs + "× žák bez VS" : "") +
           " – tito žáci se počítají jako nezaplacení.\n";
  }
  txt += res.stitekText;
  if (res.chyby.length) txt += "• Chyby: " + res.chyby.join(" | ") + "\n";
  return txt;
}

// -------------------------------------------------------------
// 1. PŘÍPRAVA SBÍRKY (s vytvořením štítku v Gmailu)
// -------------------------------------------------------------
// Název sbírky bez znaků, které by Tabulky vzaly jako vzorec (= + - @ na začátku).
function cistyNazev_(s) {
  s = String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").trim();
  s = s.replace(/^[=+\-@\s]+/, "");
  return s.substring(0, 60);
}

// Sloupec je volný, když nemá SS, název ani žádné hodnoty u žáků.
function jeSloupecVolny_(sheet, colIndex, rozsah) {
  var hlav = sheet.getRange(6, colIndex, 2, 1).getValues();
  if (String(hlav[0][0]).trim() !== "" || String(hlav[1][0]).trim() !== "") return false;
  var bunky = sheet.getRange(rozsah.startRow, colIndex, rozsah.numRows, 1).getValues();
  for (var i = 0; i < bunky.length; i++) {
    if (String(bunky[i][0]).trim() !== "") return false;
  }
  return true;
}

function najdiVolnySloupec_(sheet, rozsah) {
  var posl = sheet.getLastColumn();
  for (var c = 7; c <= posl + 1; c++) {
    if (jeSloupecVolny_(sheet, c, rozsah)) return c;
  }
  return Math.max(7, posl + 1);   // sbírky začínají vždy ve sloupci G (nová třída má jen sloupce A–E)
}

// Řádek je žák, když má vyplněný e-mail nebo VS.
function jeZakRadek_(radek) {
  return String(radek[2] == null ? "" : radek[2]).trim() !== "" || String(radek[3] == null ? "" : radek[3]).trim() !== "";
}

function parseCastka_(x) {
  var v = parseFloat(String(x == null ? "" : x).replace(/\s+/g, "").replace(",", "."));
  return isNaN(v) ? 0 : round2_(v);
}

// Zkontroluje výběr žáků { radek, castka } a vrátí mapu řádek -> částka. Při chybě vyhodí výjimku.
function overVyberZaku_(vyber, rozsah, mainData) {
  if (!Array.isArray(vyber)) throw new Error("Neplatný výběr žáků.");
  var urceni = {}, pocet = 0;
  for (var k = 0; k < vyber.length; k++) {
    var r = parseInt(vyber[k] && vyber[k].radek, 10);
    var c = parseCastka_(vyber[k] && vyber[k].castka);
    if (!(r >= rozsah.startRow && r <= rozsah.lastRow) || !jeZakRadek_(mainData[r - rozsah.startRow])) {
      throw new Error("Neplatný žák ve výběru (řádek " + (vyber[k] && vyber[k].radek) + ").");
    }
    if (!(c > 0) || c > MAX_CASTKA) {
      throw new Error("Neplatná částka u žáka " + jmenoZaka_(mainData[r - rozsah.startRow][0], mainData[r - rozsah.startRow][1]) + " (povoleno 0,01 – " + MAX_CASTKA + " Kč).");
    }
    if (urceni[r] !== undefined) throw new Error("Žák je ve výběru dvakrát (řádek " + r + ").");
    urceni[r] = c;
    pocet++;
  }
  if (!pocet) throw new Error("Vyberte aspoň jednoho žáka, který má platit.");
  return urceni;
}

// Jádro přípravy sbírky (používá menu i webová aplikace).
//  vyber = pole { radek, castka }: platí jen vybraní žáci, každý svou částku (ostatní jsou mimo sbírku);
//  jinak castkaVsem > 0 = všem žákům se dá tahle částka; jinak se vezme částka ze sloupce E.
function pripravSbirku_(sheet, colIndex, nazevSbirky, castkaVsem, vyber) {
  if (!(colIndex >= 7)) throw new Error("Sbírky patří do sloupců od G dál.");
  var colLetter = getColLetter_(colIndex);
  var nazev = cistyNazev_(nazevSbirky) || ("Sbírka " + colLetter);
  var rozsah = nactiRozsahStudentu_(sheet);
  if (!rozsah) throw new Error("V tabulce chybí data studentů (od řádku 9).");
  if (colIndex > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), colIndex - sheet.getMaxColumns());
  }
  if (!jeSloupecVolny_(sheet, colIndex, rozsah)) {
    throw new Error("Sloupec " + colLetter + " už něco obsahuje (název, SS nebo hodnoty u žáků). Vyberte prázdný sloupec.");
  }

  var mainData = sheet.getRange(rozsah.startRow, 1, rozsah.numRows, 5).getValues();
  var urceni = (vyber === undefined || vyber === null) ? null : overVyberZaku_(vyber, rozsah, mainData);   // chyby dřív, než se cokoli zapíše

  registrujTridu_(sheet);   // tenhle list je třída – hlídá ho automatická kontrola
  var fixni = parseCastka_(castkaVsem);

  var specSymbol = unikatniSS_();
  // Štítek v Gmailu se vytváří dřív než zápis do tabulky – kdyby selhal, tabulka zůstane nedotčená.
  var stitek = getOrCreateSbirkovyStitek_(nazev, specSymbol);

  sheet.getRange(6, colIndex).setValue(specSymbol);
  sheet.getRange(7, colIndex).setValue(nazev);

  var stavValues = [];
  var backgroundColors = [];
  for (var i = 0; i < mainData.length; i++) {
    var c = 0;
    if (urceni) {
      c = urceni[rozsah.startRow + i] || 0;
    } else if (fixni > 0) {
      c = jeZakRadek_(mainData[i]) ? fixni : 0;
    } else {
      var e = mainData[i][4];
      c = (typeof e === "number") ? e : parseFloat(String(e).replace(",", "."));
      if (isNaN(c)) c = 0;
    }
    if (c > 0) {
      stavValues.push([c]);
      backgroundColors.push(["#f4cccc"]);
    } else {
      stavValues.push([""]);
      backgroundColors.push(["#ffffff"]);
    }
  }
  var stavRange = sheet.getRange(rozsah.startRow, colIndex, rozsah.numRows, 1);
  stavRange.setValues(stavValues);
  stavRange.setBackgrounds(backgroundColors);

  // Úvodní souhrn „Vybráno 0 / celkem“ pod posledním žákem
  var kopieHodnot = stavValues.map(function(r) { return [r[0]]; });
  var kopieBarev = backgroundColors.map(function(r) { return [r[0]]; });
  var v = vyhodnotStudenty_(mainData, kopieHodnot, kopieBarev, []);
  zapisSouhrn_(sheet, colIndex, rozsah.lastRow + 1, v.souhrn);

  PropertiesService.getUserProperties().setProperty('POSLEDNI_SLOUPEC', colIndex.toString());
  return {
    colIndex: colIndex, colLetter: colLetter, nazev: nazev, specSymbol: specSymbol, stitek: stitek.getName(),
    pocetZaku: v.souhrn.pocetOcekavano, celkem: v.souhrn.ocekavano
  };
}

// Přidá žáka do sbírky / změní mu částku (castka > 0) nebo ho ze sbírky vyřadí (castka = 0).
// Vyřadit nejde žáka, který už má zaplaceno (z banky nebo ručně) – nejdřív se musí smazat ruční platby.
function nastavUcastnika_(sheet, colIndex, radek, castka) {
  var rozsah = nactiRozsahStudentu_(sheet);
  if (!rozsah) throw new Error("V tabulce chybí data studentů (od řádku 9).");
  radek = parseInt(radek, 10);
  if (!(radek >= rozsah.startRow && radek <= rozsah.lastRow)) throw new Error("Neplatný řádek žáka.");
  var zak = sheet.getRange(radek, 1, 1, 5).getValues()[0];
  if (!jeZakRadek_(zak)) throw new Error("Řádek " + radek + " není žák (chybí e-mail i VS).");
  var syrova = String(castka == null ? "" : castka).trim();
  if (syrova !== "" && isNaN(parseFloat(syrova.replace(",", ".")))) throw new Error("Neplatná částka.");
  var nova = parseCastka_(syrova);
  if (nova < 0) throw new Error("Částka nesmí být záporná (0 = žák ve sbírce nebude).");
  if (nova > MAX_CASTKA) throw new Error("Částka je moc velká (nejvíc " + MAX_CASTKA + " Kč).");

  var bunka = sheet.getRange(radek, colIndex);
  var b = rozborBunky_(bunka.getValue(), zak[4]);
  if (nova > 0) {
    bunka.setValue(nova);
    bunka.setBackground("#f4cccc");
  } else {
    if (b.stav === "zaplaceno" || b.stav === "preplatek" || b.stav === "castecne") {
      throw new Error("Žák už má zaplaceno, ze sbírky ho vyřadit nejde. Nejdřív smažte ručně zadané platby (platby z banky smazat nejdou).");
    }
    bunka.setValue("");
    bunka.setBackground("#ffffff");
  }
  return zkontrolujSbirku_(sheet, colIndex, { bezGmailu: true });
}

function pripravitSloupecPlateb() {
  jenZMenu_();
  var ui = SpreadsheetApp.getUi();
  try {
    var responseCol = ui.prompt("Příprava sbírky (1/2)", "Zadejte písmeno sloupce (např. G, H, I):", ui.ButtonSet.OK_CANCEL);
    if (responseCol.getSelectedButton() != ui.Button.OK) return;
    var colIndex = getColIndex_(responseCol.getResponseText());
    if (isNaN(colIndex) || colIndex < 1) { ui.alert("Neplatné písmeno sloupce!"); return; }

    var responseName = ui.prompt("Příprava sbírky (2/2)", "Zadejte název / zprávu sbírky (např. Divadlo, qwe):", ui.ButtonSet.OK_CANCEL);
    if (responseName.getSelectedButton() != ui.Button.OK) return;

    var sheet = getPracovniList_();
    var r = spustSeZamkem_(function() {
      return pripravSbirku_(sheet, colIndex, responseName.getResponseText(), 0);
    }, 20000);
    ui.alert("Sbírka „" + r.nazev + "“ připravena ve sloupci " + r.colLetter + "!\n\nSS: " + r.specSymbol + "\nVytvořen Gmail štítek: " + r.stitek);
  } catch (e) {
    ui.alert("Chyba při přípravě sloupce: " + e.message);
  }
}

// -------------------------------------------------------------
// 2. ODESÍLÁNÍ E-MAILŮ ŽÁKŮM (QR platby a připomínky) – VŽDY AŽ PO POTVRZENÍ
// -------------------------------------------------------------
var TYP_QR = "qr";
var TYP_PRIPOMINKA = "pripominka";

function jeEmail_(s) {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(s || "").trim());
}

function popisTypu_(typ) {
  return typ === TYP_QR ? "QR platby" : "připomínky";
}

// Kdo by dostal e-mail: žák s platným e-mailem a VS, který ještě (úplně) nezaplatil.
// Nic neodesílá, jen sestaví seznam – odeslání je až po potvrzení.
function sestavPrijemce_(sheet, colIndex, typ) {
  var rozsah = nactiRozsahStudentu_(sheet);
  if (!rozsah) throw new Error("V tabulce chybí data studentů (od řádku 9).");
  var specSymbol = String(sheet.getRange(6, colIndex).getValue()).trim();
  if (!specSymbol) throw new Error("Chybí Specifický symbol v 6. řádku sloupce " + getColLetter_(colIndex) + "!");
  var nazev = String(sheet.getRange(7, colIndex).getValue()).trim() || ("sloupec " + getColLetter_(colIndex));

  var data = sheet.getRange(rozsah.startRow, 1, rozsah.numRows, SLOUPEC_RODICE).getValues();
  var bunky = sheet.getRange(rozsah.startRow, colIndex, rozsah.numRows, 1).getValues();
  var s = {
    colIndex: colIndex, specSymbol: specSymbol, nazev: nazev, typ: typ, prijemci: [],
    preskoceno: { bezEmailu: 0, bezVs: 0, uhrazeno: 0, castecne: 0, rucne: 0, bezCastky: 0, mimoSbirku: 0 }
  };

  for (var i = 0; i < data.length; i++) {
    var prijmeni = String(data[i][0] == null ? "" : data[i][0]).trim();
    var jmeno = String(data[i][1] == null ? "" : data[i][1]).trim();
    var email = String(data[i][2] == null ? "" : data[i][2]).trim();
    var vs = String(data[i][3] == null ? "" : data[i][3]).replace(/\s+/g, "");
    if (!prijmeni && !jmeno && !email && !vs) continue;

    var b = rozborBunky_(bunky[i][0], data[i][4]);
    var ocek = b.ocekavano;     // částka jen z buňky sbírky – prázdná buňka = žák ve sbírce není (žádný návrat ke sloupci E)
    var castka = 0, zaplaceno = 0;

    if (b.stav === "nic") { s.preskoceno.mimoSbirku++; continue; }
    if (b.stav === "rucne") { s.preskoceno.rucne++; continue; }
    if (b.stav === "nezaplaceno") {
      castka = ocek;
    } else if (b.stav === "castecne") {
      if (typ !== TYP_PRIPOMINKA) { s.preskoceno.castecne++; continue; }
      zaplaceno = b.zaplaceno;
      castka = ocek - zaplaceno;
    } else {                                   // zaplaceno / přeplatek
      s.preskoceno.uhrazeno++;
      continue;
    }
    castka = round2_(castka);
    if (castka <= 0) { s.preskoceno.bezCastky++; continue; }
    var emailZak = emailyBunky_(email), emailRodice = normalizujEmailyRodicu_(data[i][SLOUPEC_RODICE - 1]).emaily;
    if (!emailZak.length && !emailRodice.length) { s.preskoceno.bezEmailu++; continue; }       // ani žák, ani rodič nemá použitelný e-mail
    if (!vs) { s.preskoceno.bezVs++; continue; }

    s.prijemci.push({
      radek: rozsah.startRow + i, prijmeni: prijmeni, jmeno: jmeno, email: emailZak.join(", "), emailZak: emailZak, emailRodice: emailRodice, vs: vs,
      castka: castka, zaplaceno: round2_(zaplaceno), ocekavano: round2_(ocek)
    });
  }
  return s;
}

function popisPreskoceno_(s) {
  var p = s.preskoceno, casti = [];
  if (p.uhrazeno) casti.push(p.uhrazeno + "× už zaplaceno");
  if (p.castecne) casti.push(p.castecne + "× zaplaceno jen část (ty oslovte připomínkou)");
  if (p.rucne) casti.push(p.rucne + "× ruční poznámka v buňce");
  if (p.bezEmailu) casti.push(p.bezEmailu + "× chybí/neplatný e-mail");
  if (p.bezVs) casti.push(p.bezVs + "× chybí VS");
  if (p.bezCastky) casti.push(p.bezCastky + "× bez částky");
  if (p.mimoSbirku) casti.push(p.mimoSbirku + "× žák není v této sbírce");
  return casti.length ? "Přeskočeno: " + casti.join(", ") + "." : "";
}

// ---------- PŘEHLED ODESLANÝCH E-MAILŮ ----------
// Každý odeslaný e-mail žákovi se zapíše na list „Odeslané e-maily“. Z něj aplikace pozná, komu už QR
// a připomínky odešly (a kdy), a v náhledu odeslání ty žáky předem odškrtne.
var ODESLANE_HLAVICKA = ["Datum a čas", "Typ", "Sbírka", "Specifický symbol", "Žák", "Variabilní symbol", "E-mail", "Částka (Kč)", "Odeslal", "Komu"];

function popisTypuZaznamu_(typ) {
  return typ === TYP_QR ? "QR platba" : "Připomínka";
}

// Komu e-mail odešel (sloupec „Komu“: „žák“, „rodič“, „žák + rodič“). Starší záznamy sloupec nemají a jdou na adresu ve sloupci E-mail = žák.
function cilZeZaznamu_(txt) {
  var n = removeAccents_(String(txt == null ? "" : txt).toLowerCase());
  var rodic = n.indexOf("rod") !== -1;
  return { zak: n.indexOf("zak") !== -1 || !rodic, rodic: rodic };
}

function typZeZaznamu_(txt) {
  var n = removeAccents_(String(txt == null ? "" : txt).toLowerCase());
  if (n.indexOf("qr") === 0) return TYP_QR;
  if (n.indexOf("pripom") === 0) return TYP_PRIPOMINKA;
  return "";
}

function getListOdeslane_(ss) {
  var list = ss.getSheetByName(LIST_ODESLANE);
  if (list) return list;
  var puvodni = null;
  try { puvodni = ss.getActiveSheet(); } catch (e) {}
  list = ss.insertSheet(LIST_ODESLANE, ss.getSheets().length);   // úplně na konec
  list.getRange(1, 1, 1, ODESLANE_HLAVICKA.length).setValues([ODESLANE_HLAVICKA]).setFontWeight("bold").setBackground("#d9d9d9");
  list.setFrozenRows(1);
  var radku = list.getMaxRows();
  list.getRange(2, 1, radku - 1, 1).setNumberFormat("dd.MM.yyyy HH:mm");
  list.getRange(2, 4, radku - 1, 1).setNumberFormat("@");          // SS jako text
  list.getRange(2, 6, radku - 1, 1).setNumberFormat("@");          // VS jako text (zachová nuly)
  list.getRange(2, 8, radku - 1, 1).setNumberFormat("#,##0.00");
  [140, 100, 160, 120, 170, 110, 220, 100, 120, 90].forEach(function(w, i) { list.setColumnWidth(i + 1, w); });
  if (puvodni) { try { ss.setActiveSheet(puvodni); } catch (e2) {} }
  return list;
}

// Připíše řádky na konec listu (formáty sloupců jsou nastavené celému listu už při vzniku).
function zapisRadkyOdeslane_(ss, radky) {
  if (!radky.length) return 0;
  var list = getListOdeslane_(ss);
  var hlavickaKomu = list.getRange(1, ODESLANE_HLAVICKA.length);
  if (String(hlavickaKomu.getValue()).trim() === "") hlavickaKomu.setValue(ODESLANE_HLAVICKA[ODESLANE_HLAVICKA.length - 1]).setFontWeight("bold").setBackground("#d9d9d9");     // starší list nemá sloupec „Komu“
  var prvni = Math.max(list.getLastRow(), 1) + 1;
  var potreba = prvni + radky.length - 1;
  if (potreba > list.getMaxRows()) list.insertRowsAfter(list.getMaxRows(), potreba - list.getMaxRows());
  list.getRange(prvni, 1, radky.length, ODESLANE_HLAVICKA.length).setValues(radky);
  return radky.length;
}

// Dřívější verze si „naposledy odesláno“ pamatovala ve vlastnostech skriptu (ODESLANO_<typ>_<SS>_<VS>).
// Při prvním použití se přenesou na list a vlastnosti se smažou.
var __odeslaneMigrovano = false;      // jen v rámci jednoho spuštění (ušetří čtení vlastnosti při každém dotazu)
function migrujOdeslane_(ss) {
  if (__odeslaneMigrovano) return 0;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("ODESLANE_MIGRACE") === "1") { __odeslaneMigrovano = true; return 0; }
  var vse = props.getProperties();
  var klice = Object.keys(vse).filter(function(k) { return k.indexOf("ODESLANO_") === 0; });
  var radky = [];
  klice.forEach(function(k) {
    var m = k.match(/^ODESLANO_(qr|pripominka)_([0-9]{6,10})_([0-9]+)$/);
    if (!m) return;
    var d = new Date(vse[k]);
    var nazev = "";
    try { var nalez = najdiSbirkuVTridach_(m[2]); if (nalez) nazev = nalez.sbirka.nazev; } catch (e) {}
    radky.push([isNaN(d.getTime()) ? "" : d, popisTypuZaznamu_(m[1]), nazev, m[2], "", m[3], "", "", "dříve (bez podrobností)", "žák"]);
  });
  if (radky.length) zapisRadkyOdeslane_(ss, radky);
  klice.forEach(function(k) { props.deleteProperty(k); });
  props.setProperty("ODESLANE_MIGRACE", "1");
  return radky.length;
}

// Co a komu už odešlo: { SS: { normalizovanýVS: { qr: { pocet, posledni(ms), zak: {pocet, posledni}, rodic: {…} }, pripominka: {…} } } }
function nactiOdeslane_(ss) {
  return memo_("odeslane", function() { return nactiOdeslaneBezMemo_(ss); });
}
function nactiOdeslaneBezMemo_(ss) {
  migrujOdeslane_(ss);
  var mapa = {};
  var list = ss.getSheetByName(LIST_ODESLANE);
  if (!list) return mapa;
  var v = list.getDataRange().getValues();          // jedno čtení (bez zvláštního getLastRow)
  if (v.length < 2) return mapa;
  v = v.slice(1);
  for (var i = 0; i < v.length; i++) {
    var typ = typZeZaznamu_(v[i][1]);
    var ssv = String(v[i][3] == null ? "" : v[i][3]).trim();
    var vs = normVs_(v[i][5]);
    if (!typ || !ssv || !vs) continue;
    var ms = Object.prototype.toString.call(v[i][0]) === "[object Date]" && !isNaN(v[i][0].getTime()) ? v[i][0].getTime() : 0;
    var poSS = mapa[ssv] = mapa[ssv] || {};
    var poVs = poSS[vs] = poSS[vs] || {};
    var t = poVs[typ] = poVs[typ] || { pocet: 0, posledni: 0, zak: { pocet: 0, posledni: 0 }, rodic: { pocet: 0, posledni: 0 } };
    var cil = cilZeZaznamu_(v[i][9]);
    t.pocet++;
    if (ms > t.posledni) t.posledni = ms;
    ["zak", "rodic"].forEach(function(k) { if (cil[k]) { t[k].pocet++; if (ms > t[k].posledni) t[k].posledni = ms; } });
  }
  return mapa;
}

// Sestaví a odešle jeden e-mail s QR kódem na jednu adresu. komu = "zak" (oslovení žáka) nebo "rodic" (oslovení rodiče, jméno žáka je v textu).
function posliEmailPrijemci_(typ, s, p, adresa, komu, blob) {
  var prof = profilSbirky_(s.specSymbol);
  if (!prof.iban) throw new Error("U sbírky chybí číslo účtu. Doplňte ho v Nastavení (Můj profil / Výchozí nastavení).");
  blob = blob || vytvorQrBlob_(sestavSpayd_(p.castka, p.vs, s.specSymbol, s.nazev), typ === TYP_QR ? "qr_platba.png" : "qr_platba_pripominka.png");
  var rodic = komu === "rodic", jmenoZaka = jmenoZaka_(p.prijmeni, p.jmeno);
  var predmet, htmlBody;
  var ucetHtml = "Číslo účtu: <b>" + escHtml_(ibanNaCisloUctu_(prof.iban) || formatujIban_(prof.iban)) + "</b>" +
                 (prof.nazevUctu ? " (" + escHtml_(prof.nazevUctu) + ")" : "") + "<br>";
  var osloveni = rodic ? "<p>Dobrý den,</p>" : "<p>Ahoj " + escHtml_(p.jmeno || p.prijmeni) + ",</p>";
  var zaKoho = rodic ? " za žáka <b>" + escHtml_(jmenoZaka) + "</b>" : "";

  if (typ === TYP_QR) {
    predmet = "Platba: " + s.nazev + (rodic ? " – " + jmenoZaka : "");
    htmlBody = osloveni +
               "<p>" + (rodic ? "posíláme" : "posílám") + " podklady pro platbu na <b>" + escHtml_(s.nazev) + "</b>" + zaKoho + " ve výši <b>" + p.castka + " Kč</b>.</p>" +
               "<p>" + ucetHtml + "Variabilní symbol (VS): <b>" + escHtml_(p.vs) + "</b><br>" +
               "Specifický symbol (SS): <b>" + s.specSymbol + "</b></p>" +
               "<p>QR kód pro rychlou platbu:</p>" +
               "<p><img src='cid:qrCodeImage' width='200' height='200'></p><p>" + (rodic ? "Děkujeme!" : "Díky!") + "</p>";
  } else {
    predmet = "Připomínka platby: " + s.nazev + (rodic ? " – " + jmenoZaka : "");
    var textStavu;
    if (p.zaplaceno > 0) {
      textStavu = "<p>Evidujeme Vaši částečnou úhradu" + zaKoho + " ve výši <b>" + p.zaplaceno + " Kč</b> z celkových <b>" + p.ocekavano + " Kč</b>.</p>" +
                  "<p>Zbývá doplatit: <b>" + p.castka + " Kč</b>.</p>";
    } else {
      textStavu = "<p>Dovolujeme se připomenout s úhradou částky <b>" + p.castka + " Kč</b> na <b>" + escHtml_(s.nazev) + "</b>" + zaKoho + ".</p>";
    }
    htmlBody = osloveni +
               textStavu +
               "<p>" + ucetHtml + "Variabilní symbol (VS): <b>" + escHtml_(p.vs) + "</b><br>" +
               "Specifický symbol (SS): <b>" + s.specSymbol + "</b></p>" +
               "<p>QR kód pro doplatek zbývající částky:</p>" +
               "<p><img src='cid:qrCodeImage' width='200' height='200'></p>" +
               "<p>Pokud jste platbu již v posledních dnech odeslali, považujte prosím tento e-mail za bezpředmětný.</p>" +
               "<p>Děkujeme!</p>";
  }
  posliGmail_(adresa, predmet, "", { htmlBody: htmlBody, inlineImages: { qrCodeImage: blob } }, "");
}

// Adresy, na které se e-mail pošle: cile = { zak: bool, rodic: bool } (žák = sloupec E-mail, rodič = sloupec E-mail rodiče).
function adresyPrijemce_(p, cile) {
  return { zak: cile.zak ? (p.emailZak || []) : [], rodic: cile.rodic ? (p.emailRodice || []) : [] };
}

// Odešle e-maily vybraným příjemcům (volat jen po potvrzení uživatelem!), žákovi, rodičům, nebo oběma (cile). Pro každého žáka
// se na list „Odeslané e-maily“ zapíše jeden řádek (kdo je adresát, je ve sloupci „Komu“). kdo = kdo odeslání potvrdil.
function odesliEmailyPrijemcum_(s, typ, prijemci, kdo, cile) {
  cile = cile || { zak: true, rodic: false };
  var out = { odeslano: 0, chyby: [], zapsanoDoPrehledu: true, bezAdresy: 0 };
  var ss = getSS_();
  for (var i = 0; i < prijemci.length; i++) {
    var p = prijemci[i], adresy = adresyPrijemce_(p, cile);
    if (!adresy.zak.length && !adresy.rodic.length) { out.bezAdresy++; continue; }
    var blob = null;
    try {
      blob = vytvorQrBlob_(sestavSpayd_(p.castka, p.vs, s.specSymbol, s.nazev), typ === TYP_QR ? "qr_platba.png" : "qr_platba_pripominka.png");
    } catch (eQr) {
      out.chyby.push(p.jmeno + " " + p.prijmeni + ": " + eQr.message);
      continue;
    }
    var poslano = { zak: [], rodic: [] };
    ["zak", "rodic"].forEach(function(komu) {
      adresy[komu].forEach(function(adresa) {
        try {
          posliEmailPrijemci_(typ, s, p, adresa, komu, blob);
          out.odeslano++;
          poslano[komu].push(adresa);
        } catch (e) {
          out.chyby.push(p.jmeno + " " + p.prijmeni + " (" + adresa + "): " + e.message);
        }
      });
    });
    if (!poslano.zak.length && !poslano.rodic.length) continue;
    try {
      zapisRadkyOdeslane_(ss, [[
        new Date(), popisTypuZaznamu_(typ), s.nazev, String(s.specSymbol), jmenoZaka_(p.prijmeni, p.jmeno),
        String(p.vs), poslano.zak.concat(poslano.rodic).join(", "), p.castka, cistaPoznamka_(kdo || ""),
        poslano.zak.length && poslano.rodic.length ? "žák + rodič" : (poslano.rodic.length ? "rodič" : "žák")
      ]]);
    } catch (e2) {
      out.zapsanoDoPrehledu = false;     // e-mail odešel, jen se nepodařilo udělat záznam
    }
  }
  return out;
}

// Potvrzení v menu tabulky: ukáže, komu e-maily půjdou, a odešle jen po kliknutí na ANO.
function potvrdOdeslaniVMenu_(ui, s, typ) {
  var radky = s.prijemci.slice(0, 12).map(function(p) {
    return "• " + p.jmeno + " " + p.prijmeni + " <" + p.email + "> – " + fmtKc_(p.castka) + " Kč";
  });
  if (s.prijemci.length > 12) radky.push("… a dalších " + (s.prijemci.length - 12));
  var text = "Opravdu odeslat " + s.prijemci.length + " e-mailů (" + popisTypu_(typ) + ") pro sbírku „" + s.nazev + "“?\n\n" +
             radky.join("\n") + "\n\n" + popisPreskoceno_(s);
  return ui.alert("Potvrzení odeslání e-mailů", text, ui.ButtonSet.YES_NO) === ui.Button.YES;
}

function odeslatEmailyZMenu_(typ) {
  var ui = SpreadsheetApp.getUi();
  try {
    var sheet = getPracovniList_();
    var nejnovejsiPismeno = getColLetter_(getNejnovejsiSloupecIndex_(sheet));
    var response = ui.prompt("Odeslání – " + popisTypu_(typ), "Zadejte písmeno sloupce (např. " + nejnovejsiPismeno + "):", ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) return;

    var colLetterInput = response.getResponseText().trim();
    var colIndex = getColIndex_(colLetterInput ? colLetterInput : nejnovejsiPismeno);
    if (isNaN(colIndex) || colIndex < 1) { ui.alert("Neplatné písmeno sloupce!"); return; }

    var s = sestavPrijemce_(sheet, colIndex, typ);
    s.prijemci = s.prijemci.filter(function(p) { return p.emailZak.length; });       // z menu se posílá jen na e-mail žáka (rodičům jde posílat v aplikaci)
    if (!s.prijemci.length) {
      ui.alert("Není komu posílat", "Pro sbírku „" + s.nazev + "“ nemá nikdo nárok na e-mail (" + popisTypu_(typ) + ").\n" + popisPreskoceno_(s), ui.ButtonSet.OK);
      return;
    }
    if (!potvrdOdeslaniVMenu_(ui, s, typ)) {
      ui.alert("Odeslání zrušeno, nic se neodeslalo.");
      return;
    }
    var res = spustSeZamkem_(function() { return odesliEmailyPrijemcum_(s, typ, s.prijemci, "menu tabulky"); }, 20000);
    zneplatniCacheDat_();
    ui.alert("Odesláno " + res.odeslano + " z " + s.prijemci.length + " e-mailů (" + popisTypu_(typ) + ") pro sbírku „" + s.nazev + "“." +
             (res.chyby.length ? "\n\nChyby:\n" + res.chyby.join("\n") : ""));
  } catch (e) {
    ui.alert("Chyba při odesílání: " + e.message);
  }
}

function odeslatQrPlatby() { jenZMenu_(); odeslatEmailyZMenu_(TYP_QR); }

// -------------------------------------------------------------
// 3. RUČNÍ KONTROLA PLATEB (štítky + souhrn + historie + e-mail „vše zaplaceno“)
// -------------------------------------------------------------
function zkontrolovatPlatby() {
  jenZMenu_();
  var ui = SpreadsheetApp.getUi();
  try {
    var sheet = getPracovniList_();
    var nejnovejsiIndex = getNejnovejsiSloupecIndex_(sheet);
    var nejnovejsiPismeno = getColLetter_(nejnovejsiIndex);

    var response = ui.prompt("Kontrola plateb", "Zadejte písmeno sloupce (např. " + nejnovejsiPismeno + "):", ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) return;

    var colLetterInput = response.getResponseText().trim();
    var colLetter = colLetterInput ? colLetterInput : nejnovejsiPismeno;
    var colIndex = getColIndex_(colLetter);
    if (isNaN(colIndex) || colIndex < 1) { ui.alert("Neplatné písmeno sloupce!"); return; }

    var res = spustSeZamkem_(function() { return zkontrolujSbirku_(sheet, colIndex); }, 25000);
    zneplatniCacheDat_();
    ui.alert(sestavHlaseniKontroly_(res));
  } catch (err) {
    ui.alert("Chyba při kontrole: " + err.toString());
  }
}

// -------------------------------------------------------------
// 4. ODESLÁNÍ PŘIPOMÍNEK NEPLATIČŮM A ČÁSTEČNĚ ZAPLACENÝM (až po potvrzení)
// -------------------------------------------------------------
function odeslatPripominky() { jenZMenu_(); odeslatEmailyZMenu_(TYP_PRIPOMINKA); }

// -------------------------------------------------------------
// 5. AUTOMATICKÁ HODINOVÁ KONTROLA
// -------------------------------------------------------------
// Tuto funkci volá časový spouštěč. Projde sbírky na hlavním listu, které ještě nejsou kompletně
// zaplacené (a nejsou starší než AUTO_KONTROLA_MAX_DNI), a pro každou provede stejnou kontrolu
// jako ruční „Kontrola plateb“: štítky v Gmailu, stavy žáků, souhrn, historie a e-mail „vše zaplaceno“.
function automatickaKontrola() {
  zneplatniCacheDat_();     // automatika zapisuje platby (i když skončí chybou)
  var zamek = LockService.getScriptLock();
  if (!zamek.tryLock(30000)) {
    Logger.log("Automatická kontrola přeskočena – běží jiná kontrola.");
    return;
  }
  try {
    var props = PropertiesService.getScriptProperties();
    // Funkce je veřejná (kvůli časovému spouštěči), proto pojistka: častěji než jednou za pár minut neběží.
    var posledniStart = parseInt(props.getProperty("AUTO_POSLEDNI_START") || "0", 10);
    if (posledniStart && Date.now() - posledniStart < AUTO_MIN_ODSTUP_MS) {
      Logger.log("Automatická kontrola přeskočena – naposledy běžela před chvílí.");
      return;
    }
    props.setProperty("AUTO_POSLEDNI_START", String(Date.now()));
    var tridy = seznamTrid_();
    if (!tridy.length) throw new Error("Nenalezen list s tabulkou žáků.");

    var start = Date.now();
    var zkontrolovano = 0, preskoceno = 0, chyby = [];
    var konec = false;
    var hotove = props.getProperties();      // „vše zaplaceno“ se čte jednou, ne zvlášť pro každou sbírku (každé čtení vlastnosti je volání služby)

    for (var t = 0; t < tridy.length && !konec; t++) {
      var sheet = tridy[t].list;
      var predpona = tridy.length > 1 ? tridy[t].nazev + " / " : "";
      var sbirky = najdiSbirky_(sheet);
      for (var i = 0; i < sbirky.length; i++) {
        var s = sbirky[i];
        if (Date.now() - start > 270000) {   // Apps Script končí po 6 minutách
          chyby.push("Došel čas, zbylé sbírky se zkontrolují příště.");
          konec = true;
          break;
        }
        if (hotove["VSE_ZAPLACENO_" + s.specSymbol]) { preskoceno++; continue; }
        if (stariSbirkyVDnech_(s.specSymbol) > AUTO_KONTROLA_MAX_DNI) { preskoceno++; continue; }
        try {
          zkontrolujSbirku_(sheet, s.colIndex);
          zkontrolovano++;
        } catch (e) {
          chyby.push(predpona + s.nazev + ": " + e.message);
        }
      }
    }

    props.setProperty("POSLEDNI_AUTO_KONTROLA", JSON.stringify({
      cas: new Date().toISOString(), zkontrolovano: zkontrolovano, preskoceno: preskoceno, chyby: chyby
    }));
    if (chyby.length) throw new Error("Automatická kontrola – chyby: " + chyby.join(" | "));
  } finally {
    zneplatniCacheDat_();     // po zápisech plateb: čerstvá data
    zamek.releaseLock();
  }
}

function smazAutomatickeSpoustece_() {
  var triggers = ScriptApp.getProjectTriggers();
  var smazano = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "automatickaKontrola") {
      ScriptApp.deleteTrigger(triggers[i]);
      smazano++;
    }
  }
  return smazano;
}

// Čisté zapnutí/vypnutí spouštěče (bez oken) – používá menu i webová aplikace.
function zapniAutoTrigger_() {
  seznamTrid_();                 // zapamatuje dosavadní list jako první třídu
  getListHistorie_(getSS_());
  smazAutomatickeSpoustece_();
  ScriptApp.newTrigger("automatickaKontrola").timeBased().everyHours(1).create();
}

function vypniAutoTrigger_() {
  return smazAutomatickeSpoustece_();
}

function jeAutoZapnuta_() {
  return ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === "automatickaKontrola"; });
}

// Zapne kontrolu každou hodinu (spustit stačí jednou; opakované spuštění spouštěč nezdvojí).
function zapnoutAutomatickouKontrolu() {
  jenZMenu_();
  try {
    zapniAutoTrigger_();
    zneplatniCacheDat_();
    hlaska_("Automatická kontrola zapnuta",
      "Platby se budou kontrolovat každou hodinu ve všech třídách (" + seznamTrid_().map(function(t) { return t.nazev; }).join(", ") + ").\n\n" +
      "• Hlídají se sbírky, které ještě nejsou kompletně zaplacené a nejsou starší než " + AUTO_KONTROLA_MAX_DNI + " dní.\n" +
      "• Když všichni zaplatí, přijde e-mail na adresu z profilu majitele sbírky (výchozí: " + nactiVychoziProfil_().emailOznameni + ").\n" +
      "• Historie plateb se zapisuje na list „" + LIST_HISTORIE + "“.\n" +
      "• Automatika NIKDY neposílá e-maily žákům ani rodičům, jen označuje platby.");
  } catch (e) {
    hlaska_("Chyba při zapnutí automatické kontroly", e.message);
  }
}

function vypnoutAutomatickouKontrolu() {
  jenZMenu_();
  try {
    var n = vypniAutoTrigger_();
    zneplatniCacheDat_();
    hlaska_("Automatická kontrola", n > 0 ? "Automatická kontrola je vypnutá." : "Automatická kontrola nebyla zapnutá.");
  } catch (e) {
    hlaska_("Chyba", e.message);
  }
}

function stavAutomatickeKontroly() {
  jenZMenu_();
  try {
    var triggers = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === "automatickaKontrola"; });
    var txt = "Automatická kontrola: " + (triggers.length ? "ZAPNUTÁ (každou hodinu)" : "vypnutá") + "\n";
    var raw = PropertiesService.getScriptProperties().getProperty("POSLEDNI_AUTO_KONTROLA");
    if (raw) {
      var p = JSON.parse(raw);
      txt += "Poslední běh: " + Utilities.formatDate(new Date(p.cas), Session.getScriptTimeZone(), "d.M.yyyy HH:mm") + "\n" +
             "Zkontrolováno sbírek: " + p.zkontrolovano + ", přeskočeno (hotovo/staré): " + p.preskoceno + "\n";
      if (p.chyby && p.chyby.length) txt += "Chyby: " + p.chyby.join(" | ") + "\n";
    } else {
      txt += "Zatím neproběhl žádný automatický běh.\n";
    }
    hlaska_("Stav automatické kontroly", txt);
  } catch (e) {
    hlaska_("Chyba", e.message);
  }
}

// -------------------------------------------------------------
// 6. DIAGNOSTIKA – proč se (ne)označují e-maily štítkem
//    Nic nemění, jen ukáže, co skript v Gmailu našel a proč něco odmítl.
//    Spustíte z editoru skriptu (Spustit -> diagnostikaStitku) nebo si ji přidejte do menu.
// -------------------------------------------------------------
function diagnostikaStitku() {
  jenZMenu_();
  var ui = SpreadsheetApp.getUi();
  try {
    var sheet = getPracovniList_();
    var nejnovejsiPismeno = getColLetter_(getNejnovejsiSloupecIndex_(sheet));
    var response = ui.prompt("Diagnostika štítků", "Zadejte písmeno sloupce (např. " + nejnovejsiPismeno + "):", ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) return;

    var colLetterInput = response.getResponseText().trim();
    var colIndex = getColIndex_(colLetterInput ? colLetterInput : nejnovejsiPismeno);
    if (colIndex < 1) { ui.alert("Neplatné písmeno sloupce!"); return; }

    var specSymbol = String(sheet.getRange(6, colIndex).getValue()).trim();
    var zpravaSbirky = String(sheet.getRange(7, colIndex).getValue()).trim();
    if (!specSymbol) { ui.alert("Chybí Specifický symbol v 6. řádku!"); return; }

    var nalez = najdiPlatebniZpravy_(specSymbol);
    var s = nalez.stat;
    var existujici = najdiStitekPodleSS_(specSymbol);

    var text = "Hledání v Gmailu: " + nalez.query + "\n\n" +
      "Nalezených konverzací: " + nalez.vlakna + "\n" +
      "Zpráv v nich celkem: " + s.celkemZprav + "\n" +
      "  – odmítnuto, odesílatel není z povolené banky: " + s.neZBanky + "\n" +
      "  – odmítnuto, zpráva neobsahuje tento SS: " + s.neobsahujeSS + "\n" +
      "  – odmítnuto, nepoznána jako příchozí platba: " + s.neprichozi + "\n" +
      "  – odmítnuto, nepodařilo se přečíst částku: " + s.bezCastky + "\n" +
      "PLATNÝCH PLATEB: " + nalez.zpravy.length + "\n\n" +
      "Štítek: " + (existujici ? existujici.getName() : "zatím neexistuje (vytvoří se jako " + getLabelName_(zpravaSbirky, specSymbol) + ")") + "\n" +
      "Gmail API (štítky po e-mailech): " + (gmailApiDostupne_() ? "zapnuto" : "VYPNUTO – štítky půjdou po celých konverzacích");
    if (s.ukazkyOdesilatelu.length) {
      text += "\n\nPříklady odmítnutých odesílatelů: " + s.ukazkyOdesilatelu.join("; ");
    }
    ui.alert("Diagnostika štítků", text, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("Chyba diagnostiky: " + e.message);
  }
}

// -------------------------------------------------------------
// MENU V TABULCE
// -------------------------------------------------------------
function ukazAdresuAplikace() {
  jenZMenu_();
  var url = "";
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  hlaska_("Webová aplikace", url ? "Adresa aplikace:\n" + url : "Aplikace zatím není nasazená (Nasadit → Nové nasazení → Webová aplikace).");
}

function onOpen() {
  try { zapamatujTabulku_(SpreadsheetApp.getActiveSpreadsheet(), true); } catch (e0) {}
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("Třídní fond")
    .addItem("1. Připravit sbírku", "pripravitSloupecPlateb")
    .addItem("2. Odeslat QR platby", "odeslatQrPlatby")
    .addItem("3. Zkontrolovat platby", "zkontrolovatPlatby")
    .addItem("4. Odeslat připomínky", "odeslatPripominky")
    .addSeparator()
    .addItem("Zapnout automatickou kontrolu (každou hodinu)", "zapnoutAutomatickouKontrolu")
    .addItem("Vypnout automatickou kontrolu", "vypnoutAutomatickouKontrolu")
    .addItem("Stav automatické kontroly", "stavAutomatickeKontroly")
    .addItem("Opravit odkazy v historii", "opravitOdkazyVHistorii")
    .addItem("Diagnostika štítků", "diagnostikaStitku")
    .addSeparator()
    .addItem("Adresa webové aplikace", "ukazAdresuAplikace")
    .addSubMenu(ui.createMenu("Přístup do aplikace")
      .addItem("Přidat správce (přihlašuje se e-mailem a heslem)", "nastavitAdminaGmail")
      .addItem("Odebrat uživatele", "odebratUzivateleAplikace")
      .addItem("Obnovit heslo správce", "obnovitHesloSpravce")
      .addItem("Odhlásit všechny a odemknout přihlašování", "odhlasitVsechnyZAplikace"))
    .addToUi();
}
