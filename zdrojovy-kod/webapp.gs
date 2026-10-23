// =============================================================
// WEBOVÁ APLIKACE TŘÍDNÍ FOND – serverová část
// (spolu s tridni_fond.gs a Index.html; nasazení: Nasadit → Webová aplikace)
//
// Jak je to postavené:
//  • Rozhraní (Index.html) volá JEDINOU funkci apiVolej(akce, argumenty, token).
//    Žádná jiná serverová funkce z prohlížeče volatelná není: všechny ostatní funkce mají
//    v názvu na konci podtržítko, a ty Apps Script z prohlížeče spustit nedovolí.
//    (To je důležité, protože adresa aplikace je veřejná – viz „Kdokoli“ v nasazení.)
//  • Přihlášení: vlastní jméno + heslo (uložené jen jako hash), po přihlášení dostane prohlížeč
//    náhodný token. Po 5 špatných heslech se účet na 15 minut zamkne (a dál se čas zamčení násobí).
//  • Každé volání prochází overPristup_() a kontrolou role.
//  • Odesílání e-mailů žákům jde VŽDY dvěma kroky: náhled (nic se neodešle) → potvrzení
//    s jednorázovým tokenem. Bez platného tokenu server žádný e-mail neodešle.
// =============================================================

// ---------- NASTAVENÍ ----------
var VYZADOVAT_PRIHLASENI = true;
var VERZE_APLIKACE = "5.10";
var LIMIT_HISTORIE = 2000;
var NEDAVNO_HODIN = 24;            // komu se e-mail posílal v posledních X hodinách, ten je v náhledu odškrtnutý
var TOKEN_PLATNOST_SEKUND = 600;   // potvrzení odeslání platí 10 minut a jde použít jen jednou

// Účet vlastníka (tvůrce aplikace při zkušebním provozu). Role „vlastník“ existuje jen pro tuhle jedinou adresu.
// PŘED PŘEDÁNÍM ŠKOLE nastavte na "" (prázdný text) – role vlastníka pak v aplikaci vůbec neexistuje, účet
// vlastníka se ignoruje a tvůrce k datům školy nemá žádný přístup (GDPR). V tabulce k tomu slouží menu
// Třídní fond → Přístup do aplikace → Připravit pro předání škole.
var VLASTNIK_EMAIL = "";

var RELACE_PLATNOST_MS = 7 * 24 * 3600 * 1000;    // přihlášení platí 7 dní od posledního použití…
var RELACE_MAX_MS = 30 * 24 * 3600 * 1000;        // …nejdéle ale 30 dní od přihlášení
var RELACE_OBNOVA_MS = 3600 * 1000;               // platnost se prodlužuje nejvýš jednou za hodinu
var MAX_POKUSU_PRIHLASENI = 5;                    // špatných hesel do zamčení účtu
var MAX_POKUSU_NEZNAMY = 15;                      // totéž pro neexistující jména (dohromady)
var ZAMCENI_ZAKLAD_MS = 15 * 60 * 1000;           // první zamčení 15 min, pak 30, 60 … nejvýš 24 h
var ZAMCENI_MAX_MS = 24 * 3600 * 1000;
var MIN_DELKA_HESLA = 10;
var HASH_KOL = 300;                               // kolikrát se heslo zahashuje

// ---------- ROLE A PRÁVA ----------
// Každá akce v aplikaci vyžaduje jedno právo, každá role má jejich množinu. Všechno se vynucuje na serveru
// (v apiVolej); tlačítka v rozhraní se podle práv jen schovávají. Stejná tabulka se ukazuje v aplikaci (Informace).
var PRAVA_PORADI = ["moje", "cteni", "zapis", "odesilani", "mazani", "ucty", "nastaveni", "technicke"];
var PRAVA_POPIS = {
  moje:       "Vidět platby svého dítěte (žáka, u kterého je v tabulce jeho e-mail nebo e-mail rodiče) a QR kód k zaplacení",
  cteni:      "Prohlížet všechny sbírky, žáky a historii plateb",
  zapis:      "Zakládat třídy a sbírky, upravovat žáky, ručně zapisovat platby a spouštět kontrolu plateb v Gmailu",
  odesilani:  "Rozesílat e-maily žákům (QR platby a připomínky) – vždy až po potvrzení náhledu",
  mazani:     "Archivovat a mazat třídy a mazat sbírky (po potvrzení a zadání vlastního hesla)",
  ucty:       "Schvalovat registrace, měnit role, blokovat a odebírat účty (u správců po zadání vlastního hesla)",
  nastaveni:  "Měnit nastavení školy: název, výchozí číslo účtu, odesílání e-mailů, banky, automatickou kontrolu",
  technicke:  "Technická diagnostika aplikace (jen vlastník)"
};
var ROLE_PORADI = ["zak", "ucitel", "skolni_admin", "vlastnik"];
var ROLE_DEF = {
  zak: {
    nazev: "Žák / rodič", profil: false, registrace: true, prava: ["moje"],
    popis: "Vidí jen platby žáka, u kterého je v tabulce jeho e-mail nebo e-mail rodiče, a může si zobrazit QR kód k zaplacení. Žádné další žáky ani sbírky nevidí."
  },
  ucitel: {
    nazev: "Učitel", profil: true, registrace: true, prava: ["cteni", "zapis", "odesilani"],
    popis: "Zakládá třídy a sbírky, spravuje žáky, zapisuje platby ručně, spouští kontrolu plateb a rozesílá žákům QR platby a připomínky (vždy až po potvrzení náhledu)."
  },
  skolni_admin: {
    nazev: "Školní admin", profil: true, profilPriRegistraci: true, heslo: true, registrace: false, prava: ["cteni", "zapis", "odesilani", "mazani", "ucty", "nastaveni"],
    popis: "Vše, co učitel, a navíc spravuje provoz školy: zve učitele, schvaluje registrace a mění role, maže třídy, nastavuje školu, e-maily, banku a automatiku. Přihlašuje se kódem z e-mailu a ještě heslem. Při mazání a změnách správců heslo zadává znovu."
  },
  vlastnik: {
    nazev: "Vlastník", profil: false, heslo: true, registrace: false, prava: PRAVA_PORADI.slice(),
    popis: "Tvůrce aplikace při zkušebním provozu: vše, co školní admin, a navíc technická diagnostika. Nejde ho odebrat ani změnit. Existuje jen pro jednu adresu a po předání aplikace škole zanikne."
  }
};
// Role z dřívějších verzí aplikace se při načtení účtu přeloží na nové.
// Zrušené role: finančník → učitel (učitel teď smí i rozesílat); kontrolor a „jen čtení“ → žák/rodič
// (nejmenší práva – bez e-mailu žáka v tabulce nevidí nic; případné vyšší právo přidělí školní admin).
var STARE_ROLE = { cteni: "zak", kontrolor: "zak", zapis: "ucitel", odesilani: "ucitel", financnik: "ucitel", admin: "skolni_admin" };

function normRole_(role) {
  role = String(role == null ? "" : role).trim().toLowerCase();
  if (STARE_ROLE.hasOwnProperty(role)) return STARE_ROLE[role];
  return ROLE_DEF.hasOwnProperty(role) ? role : "";
}

function pravaRole_(role) {
  return ROLE_DEF.hasOwnProperty(role) ? ROLE_DEF[role].prava.slice() : [];
}

// pravo „prihlaseny“ = stačí být přihlášený s platnou rolí
function maOpravneni_(role, pravo) {
  if (!ROLE_DEF.hasOwnProperty(role)) return false;
  if (pravo === "prihlaseny") return true;
  return ROLE_DEF[role].prava.indexOf(pravo) !== -1;
}

// Role s rozšířenými právy (školní admin, vlastník) se přihlašují kódem z e-mailu A ještě heslem.
function vyzadujeHeslo_(u) {
  return !!u && ROLE_DEF.hasOwnProperty(u.role) && !!ROLE_DEF[u.role].heslo;
}

function jeVlastnikEmail_(email) {
  var v = String(VLASTNIK_EMAIL || "").trim().toLowerCase();
  return !!v && String(email == null ? "" : email).trim().toLowerCase() === v;
}

// Údaje o rolích pro rozhraní (Informace / Nastavení): role, jejich práva a popisy práv.
function infoORolich_() {
  return {
    prava: PRAVA_PORADI.filter(function(p) { return p !== "technicke" || !!VLASTNIK_EMAIL; }).map(function(p) { return { id: p, popis: PRAVA_POPIS[p] }; }),
    role: ROLE_PORADI.filter(function(r) { return r !== "vlastnik" || !!VLASTNIK_EMAIL; }).map(function(r) {
      return { id: r, nazev: ROLE_DEF[r].nazev, popis: ROLE_DEF[r].popis, prava: ROLE_DEF[r].prava.slice(), profil: ROLE_DEF[r].profil, registrace: ROLE_DEF[r].registrace };
    })
  };
}

// ---------- HESLA, UŽIVATELÉ, RELACE ----------
function normJmenoUziv_(s) {
  return String(s == null ? "" : s).trim().toLowerCase();
}

function platneJmenoUziv_(s) {
  return /^[a-z0-9][a-z0-9._-]{0,39}$/.test(s) || (s.length <= 80 && jeEmail_(s));   // jméno, nebo e-mail (účet přihlašovaný Gmailem)
}

// Klíč vlastnosti skriptu: pro e-mail se použije hash (klíče vlastností jsou krátké a nesmí obsahovat všechno).
function klicUzivatele_(jmeno) {
  jmeno = normJmenoUziv_(jmeno);
  if (jmeno.indexOf("@") !== -1) return "UZIVATEL_G" + sha256Hex_("ucet:" + jmeno).substring(0, 32);
  return "UZIVATEL_" + jmeno;
}

function ulozUzivatele_(u) {
  PropertiesService.getScriptProperties().setProperty(klicUzivatele_(u.jmeno), JSON.stringify(u));
}

function bytesNaHex_(bytes) {
  var out = "";
  for (var i = 0; i < bytes.length; i++) out += ("0" + (bytes[i] & 0xff).toString(16)).slice(-2);
  return out;
}

function sha256Hex_(text) {
  return bytesNaHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

function hashHesla_(heslo, sul) {
  var h = sul + ":" + heslo;
  for (var i = 0; i < HASH_KOL; i++) h = sha256Hex_(sul + h);
  return h;
}

function novaSul_() {
  return sha256Hex_(Utilities.getUuid() + Utilities.getUuid() + Date.now()).substring(0, 32);
}

// Porovnání bez předčasného ukončení (aby se z doby odpovědi nedalo poznat, kolik znaků sedí).
function stejnyText_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var rozdil = 0;
  for (var i = 0; i < a.length; i++) rozdil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return rozdil === 0;
}

// Přeloží starou roli na novou a ověří, že účet smí v aplikaci existovat (role vlastníka jen pro VLASTNIK_EMAIL).
function normalizujUzivatele_(u) {
  if (!u || typeof u !== "object") return null;
  var role = normRole_(u.role);
  if (!role) return null;
  if (role === "vlastnik" && !jeVlastnikEmail_(u.email || u.jmeno)) return null;
  u.role = role;
  u.typ = role;
  return u;
}

function nactiUzivatele_(jmeno) {
  jmeno = normJmenoUziv_(jmeno);
  if (!platneJmenoUziv_(jmeno)) return null;
  var raw = PropertiesService.getScriptProperties().getProperty(klicUzivatele_(jmeno));
  if (!raw) return null;
  try { return normalizujUzivatele_(JSON.parse(raw)); } catch (e) { return null; }
}

function vsichniUzivatele_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var out = [];
  Object.keys(props).forEach(function(k) {
    if (k.indexOf("UZIVATEL_") !== 0) return;
    try {
      var u = normalizujUzivatele_(JSON.parse(props[k]));
      if (u) out.push(u);
    } catch (e) {}
  });
  return out;
}

// Je v aplikaci aspoň jeden schválený školní admin? (Vlastník se nepočítá – po jeho odebrání by škola zůstala bez správce.)
// Správce se přihlašuje e-mailem (kód + heslo). Starý účet jen s přihlašovacím jménem se přihlásit nedá, proto se nepočítá.
function umiSePrihlasit_(u) {
  return !!u && String(u.jmeno || "").indexOf("@") !== -1;
}

function existujeAktivniSpravce_(vsichni) {
  return (vsichni || vsichniUzivatele_()).some(function(u) { return u.role === "skolni_admin" && umiSePrihlasit_(u) && (!u.stav || u.stav === "aktivni"); });
}

function overSiluHesla_(heslo, jmeno) {
  heslo = String(heslo == null ? "" : heslo);
  if (heslo.length < MIN_DELKA_HESLA) throw new Error("Heslo musí mít aspoň " + MIN_DELKA_HESLA + " znaků.");
  if (heslo.length > 200) throw new Error("Heslo je moc dlouhé.");
  if (normJmenoUziv_(heslo) === normJmenoUziv_(jmeno)) throw new Error("Heslo nesmí být stejné jako jméno.");
}

function odeberUzivatele_(jmeno) {
  jmeno = normJmenoUziv_(jmeno);
  var u = nactiUzivatele_(jmeno);
  if (!u) throw new Error("Uživatel „" + jmeno + "“ neexistuje.");
  if (u.role === "vlastnik") throw new Error("Vlastníka nejde odebrat. Jeho role zanikne až tím, že se v kódu (webapp.gs) nastaví VLASTNIK_EMAIL na prázdný text.");
  PropertiesService.getScriptProperties().deleteProperty(klicUzivatele_(jmeno));
  zrusRelaceUzivatele_(jmeno, "");
  smazZamek_("ZAMEK_" + jmeno);
}

// Relace: token je náhodný řetězec, na serveru je uložen jen jeho hash.
function klicRelace_(token) {
  return "RELACE_" + sha256Hex_("relace:" + token).substring(0, 40);
}

function vytvorRelaci_(jmeno) {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  var now = Date.now();
  PropertiesService.getScriptProperties().setProperty(klicRelace_(token), JSON.stringify({
    u: jmeno, vyt: now, obn: now, exp: now + RELACE_PLATNOST_MS
  }));
  uklidRelace_();
  return token;
}

// Smaže prošlé relace (aby se v nastavení skriptu nehromadily).
function uklidRelace_() {
  var props = PropertiesService.getScriptProperties();
  var vse = props.getProperties(), now = Date.now();
  Object.keys(vse).forEach(function(k) {
    if (k.indexOf("RELACE_") !== 0) return;
    try {
      var s = JSON.parse(vse[k]);
      if (now > s.exp || now - s.vyt > RELACE_MAX_MS) props.deleteProperty(k);
    } catch (e) { props.deleteProperty(k); }
  });
}

function overRelaci_(token) {
  if (typeof token !== "string" || token.length < 40 || token.length > 200) return null;
  var props = PropertiesService.getScriptProperties();
  var klic = klicRelace_(token);
  var raw = props.getProperty(klic);
  if (!raw) return null;
  var s;
  try { s = JSON.parse(raw); } catch (e) { props.deleteProperty(klic); return null; }
  var now = Date.now();
  if (now > s.exp || now - s.vyt > RELACE_MAX_MS) { props.deleteProperty(klic); return null; }
  var u = nactiUzivatele_(s.u);
  if (!u) { props.deleteProperty(klic); return null; }   // uživatel byl odebrán
  if (u.stav && u.stav !== "aktivni") { props.deleteProperty(klic); return null; }   // účet byl zablokován
  if (now - s.obn > RELACE_OBNOVA_MS) {
    s.obn = now;
    s.exp = now + RELACE_PLATNOST_MS;
    props.setProperty(klic, JSON.stringify(s));
  }
  return { jmeno: u.jmeno, role: u.role, email: u.email || "", typ: u.role, zobrazit: u.zobrazit || "", prava: pravaRole_(u.role), tema: u.tema || "" };
}

function zrusRelaci_(token) {
  if (typeof token !== "string" || !token) return;
  PropertiesService.getScriptProperties().deleteProperty(klicRelace_(token));
}

// Zruší všechny relace uživatele (kromě té s klíčem „krome“, když je zadaný).
function zrusRelaceUzivatele_(jmeno, krome) {
  var props = PropertiesService.getScriptProperties();
  var vse = props.getProperties();
  Object.keys(vse).forEach(function(k) {
    if (k.indexOf("RELACE_") !== 0 || k === krome) return;
    try { if (JSON.parse(vse[k]).u === jmeno) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

function zrusVsechnyRelace_() {
  var props = PropertiesService.getScriptProperties();
  var n = 0;
  Object.keys(props.getProperties()).forEach(function(k) {
    if (k.indexOf("RELACE_") === 0) { props.deleteProperty(k); n++; }
  });
  return n;
}

// ---------- ZAMČENÍ PŘIHLAŠOVÁNÍ ----------
function sPrihlasovacimZamkem_(fn) {
  var zamek;
  try { zamek = LockService.getUserLock(); } catch (e) { zamek = LockService.getScriptLock(); }
  if (!zamek.tryLock(8000)) throw new Error("Server je právě zaneprázdněný, zkuste to za chvíli.");
  try {
    return fn();
  } finally {
    zamek.releaseLock();
  }
}

function nactiZamek_(klic) {
  var raw = PropertiesService.getScriptProperties().getProperty(klic);
  var z = { n: 0, kolo: 0, "do": 0 };
  if (raw) { try { z = JSON.parse(raw); } catch (e) {} }
  return z;
}

function ulozZamek_(klic, z) {
  PropertiesService.getScriptProperties().setProperty(klic, JSON.stringify(z));
}

function smazZamek_(klic) {
  PropertiesService.getScriptProperties().deleteProperty(klic);
}

function smazVsechnyZamky_() {
  var props = PropertiesService.getScriptProperties();
  var n = 0;
  Object.keys(props.getProperties()).forEach(function(k) {
    if (k.indexOf("ZAMEK_") === 0) { props.deleteProperty(k); n++; }
  });
  return n;
}

function zpravaZamku_(zbyvaMs) {
  var min = Math.max(1, Math.ceil(zbyvaMs / 60000));
  var txt = min >= 120 ? Math.ceil(min / 60) + " hodin" : min + " min";
  return "Příliš mnoho nesprávných pokusů. Přihlašování je zamčené, zkuste to znovu za " + txt + ".";
}

// Započítá pokus o přihlášení (hned, ještě před ověřením hesla – souběžné pokusy se tak nedají obejít).
function zapocitejPokus_(klic, limit) {
  sPrihlasovacimZamkem_(function() {
    var now = Date.now();
    var z = nactiZamek_(klic);
    if (z["do"] > now) throw new Error(zpravaZamku_(z["do"] - now));
    z.n = (z.n || 0) + 1;
    if (z.n >= limit) {
      z.kolo = (z.kolo || 0) + 1;
      z["do"] = now + Math.min(ZAMCENI_ZAKLAD_MS * Math.pow(2, z.kolo - 1), ZAMCENI_MAX_MS);
      z.n = 0;
    }
    ulozZamek_(klic, z);
  });
}

// Ověří heslo účtu. Počítá pokusy, zamyká účet (stejný počítadlo jako přihlášení) a nic neprozradí.
function overHeslo_(jmeno, heslo) {
  var hl = "Nesprávné heslo.";
  var u = nactiUzivatele_(jmeno);
  var klic = u ? "ZAMEK_" + u.jmeno : "ZAMEK_NEZNAMY";
  zapocitejPokus_(klic, u ? MAX_POKUSU_PRIHLASENI : MAX_POKUSU_NEZNAMY);

  var sul = u && u.sul ? u.sul : "0000000000000000";
  var hash = hashHesla_(String(heslo == null ? "" : heslo), sul);   // i u neznámého účtu (stejná doba odpovědi)
  var ok = !!u && !!u.hash && stejnyText_(hash, u.hash);
  if (!ok) {
    Utilities.sleep(400);
    throw new Error(hl);
  }
  sPrihlasovacimZamkem_(function() { smazZamek_(klic); });
  if (u.stav && u.stav !== "aktivni") throw new Error(u.stav === "zablokovan" ? "Účet je zablokovaný. Obraťte se na správce." : "Účet ještě nebyl schválen správcem.");
  return u;
}

// Heslo při citlivých akcích (smazání sbírky nebo třídy, povýšení a odebrání správce…): přihlášený správce znovu
// zadá SVÉ heslo, aby akci nemohl provést někdo u odemčeného počítače nebo s ukradenou relací. Chyby se počítají
// stejně jako při přihlášení (po pěti špatných zadáních se účet na čas zamkne). Volat PŘED uzamčením tabulky
// (ověření používá vlastní zámek).
function overHesloAkce_(uziv, heslo) {
  if (!VYZADOVAT_PRIHLASENI) return;
  var u = uziv && uziv.jmeno ? nactiUzivatele_(uziv.jmeno) : null;
  if (!u) throw chybaPrihlaseni_("Přihlášení vypršelo, přihlaste se znovu.");
  heslo = String(heslo == null ? "" : heslo);
  if (!heslo) throw new Error("Pro tuto akci zadejte své heslo.");
  if (!u.hash) throw new Error("Váš účet nemá nastavené heslo. Odhlaste se a přihlaste se znovu – heslo si nastavíte.");
  overHeslo_(u.jmeno, heslo);                 // špatné heslo: „Nesprávné heslo.“, případně zpráva o zamčení
}

// ---------- PŘÍSTUP ----------
function chybaPrihlaseni_(zprava) {
  var e = new Error(zprava);
  e.kod = "PRIHLASENI";
  return e;
}

function overPristup_(token) {
  if (!VYZADOVAT_PRIHLASENI) return { jmeno: "", role: "skolni_admin", prava: pravaRole_("skolni_admin"), email: "", zobrazit: "", typ: "skolni_admin" };
  var r = overRelaci_(token);
  if (!r) throw chybaPrihlaseni_("Přihlášení vypršelo, přihlaste se znovu.");
  return r;
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Třídní fond")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// ---------- DISPEČER ----------
// pravo = které právo akce vyžaduje (viz ROLE_DEF). verejna = bez přihlášení.
var AKCE = {
  stavPristupu:     { verejna: true, fn: api_stavPristupu_ },
  prihlasit:        { verejna: true, fn: api_prihlasit_ },
  kodPoslat:        { verejna: true, fn: api_kodPoslat_ },
  prihlasitKodem:   { verejna: true, fn: api_prihlasitKodem_ },
  prihlasitSpravce: { verejna: true, fn: api_prihlasitSpravce_ },
  registrovat:      { verejna: true, fn: api_registrovat_ },
  registraceOverit: { verejna: true, fn: api_registraceOverit_ },
  registraceZnovu:  { verejna: true, fn: api_registraceZnovu_ },
  rodicDiteKod:     { verejna: true, fn: api_rodicDiteKod_ },
  rodicDiteOverit:  { verejna: true, fn: api_rodicDiteOverit_ },
  profil:           { pravo: "prihlaseny", fn: api_profil_ },
  profilUlozit:     { pravo: "prihlaseny", fn: api_profilUlozit_ },
  odhlasit:         { pravo: "prihlaseny", fn: api_odhlasit_ },
  zmenitHeslo:      { pravo: "prihlaseny", fn: api_zmenitHeslo_ },
  informace:        { pravo: "prihlaseny", fn: api_informace_ },
  moje:             { pravo: "moje",       fn: api_moje_ },
  ucty:             { pravo: "ucty",       fn: api_ucty_ },
  uctyZmenit:       { pravo: "ucty",       fn: api_uctyZmenit_ },
  uctyOdebrat:      { pravo: "ucty",       fn: api_uctyOdebrat_ },
  uctyProfilUlozit: { pravo: "ucty",       fn: api_uctyProfilUlozit_ },
  vychoziProfilUlozit: { pravo: "nastaveni", fn: api_vychoziProfilUlozit_ },
  prehled:          { pravo: "cteni",      fn: api_prehled_ },
  sbirka:           { pravo: "cteni",      fn: api_sbirka_ },
  sbirkaSkupina:    { pravo: "cteni",      fn: api_sbirkaSkupina_ },
  zaci:             { pravo: "cteni",      fn: api_zaci_ },
  tridy:            { pravo: "cteni",      fn: api_tridy_ },
  historie:         { pravo: "cteni",      fn: api_historie_ },
  zprava:           { pravo: "cteni",      fn: api_zprava_ },
  nastaveni:        { pravo: "cteni",      fn: api_nastaveni_ },
  zalozTridu:       { pravo: "zapis",      fn: api_zalozTridu_ },
  prejmenovatTridu: { pravo: "zapis",      fn: api_prejmenovatTridu_ },
  importZaku:       { pravo: "zapis",      fn: api_importZaku_ },
  archivovatTridu:  { pravo: "mazani",     fn: api_archivovatTridu_ },
  obnovitTridu:     { pravo: "mazani",     fn: api_obnovitTridu_ },
  nahledSmazaniTridy: { pravo: "mazani",   fn: api_nahledSmazaniTridy_ },
  smazatTridu:      { pravo: "mazani",     fn: api_smazatTridu_ },
  nahledSmazaniSbirky: { pravo: "mazani",  fn: api_nahledSmazaniSbirky_ },
  smazatSbirku:     { pravo: "mazani",     fn: api_smazatSbirku_ },
  nahledOdstraneniZaku: { pravo: "zapis",  fn: api_nahledOdstraneniZaku_ },
  odstranitZaky:    { pravo: "zapis",      fn: api_odstranitZaky_ },
  nahledPresunuZaku: { pravo: "zapis",     fn: api_nahledPresunuZaku_ },
  presunoutZaky:    { pravo: "zapis",      fn: api_presunoutZaky_ },
  zalozitSbirku:    { pravo: "zapis",      fn: api_zalozitSbirku_ },
  upravUcastnika:   { pravo: "zapis",      fn: api_upravUcastnika_ },
  rucniPlatba:      { pravo: "zapis",      fn: api_rucniPlatba_ },
  smazRucniPlatbu:  { pravo: "zapis",      fn: api_smazRucniPlatbu_ },
  zkontrolovat:     { pravo: "zapis",      fn: api_zkontrolovat_ },
  zkontrolovatSkupinu: { pravo: "zapis",   fn: api_zkontrolovatSkupinu_ },
  nastavit:         { pravo: "nastaveni",  fn: api_nastavit_ },
  skolaUlozit:      { pravo: "nastaveni",  fn: api_skolaUlozit_ },
  schrankyStav:     { pravo: "nastaveni",  fn: api_schrankyStav_ },
  schrankyUlozit:   { pravo: "nastaveni",  fn: api_schrankyUlozit_ },
  pozvatNahled:     { pravo: "ucty",       fn: api_pozvatNahled_ },
  pozvatOdeslat:    { pravo: "ucty",       fn: api_pozvatOdeslat_ },
  emailZmenaPoslat: { pravo: "prihlaseny", fn: api_emailZmenaPoslat_ },
  emailZmenaPotvrdit: { pravo: "prihlaseny", fn: api_emailZmenaPotvrdit_ },
  opravOdkazy:      { pravo: "nastaveni",  fn: api_opravOdkazy_ },
  mailStav:         { pravo: "nastaveni",  fn: api_mailStav_ },
  mailUlozit:       { pravo: "nastaveni",  fn: api_mailUlozit_ },
  mailTest:         { pravo: "nastaveni",  fn: api_mailTest_ },
  overitBanku:      { pravo: "nastaveni",  fn: api_overitBanku_ },
  zkusitBankovniEmail: { pravo: "nastaveni", fn: api_zkusitBankovniEmail_ },
  nahledOdeslani:   { pravo: "odesilani",  fn: api_nahledOdeslani_ },
  nahledOdeslaniSkupiny: { pravo: "odesilani", fn: api_nahledOdeslaniSkupiny_ },
  odeslat:          { pravo: "odesilani",  fn: api_odeslat_ },
  diagnostika:      { pravo: "technicke",  fn: api_diagnostika_ },
  vse:              { pravo: "prihlaseny", fn: api_vse_ },
  temaUlozit:       { pravo: "prihlaseny", fn: api_temaUlozit_ }
};

// ---------- RYCHLOST: mezipaměť čtení z tabulky ----------
// Čtení tabulky stojí stovky ms za každé volání, takže výsledky čtecích akcí se na chvíli odloží do CacheService.
// Každá akce, která data může změnit (tedy KAŽDÁ, co není v NEMENI_DATA), mezipaměť okamžitě zneplatní (nová „verze“).
// Přímé úpravy v samotné tabulce se projeví nejpozději za CACHE_TTL_S; tlačítko Obnovit (a.obnovit) mezipaměť obejde.
var CACHE_TTL_S = 120;
var MAX_PREDNACTENO_ZNAKU = 1400000;   // kolik dat o sbírkách (v JSON) se nejvýš předčítá do paměti stránky; zbytek se načte při otevření
var CACHE_AKCE = { prehled: 1, sbirka: 1, sbirkaSkupina: 1, zaci: 1, tridy: 1, historie: 1, nastaveni: 1, moje: 1 };
var NEMENI_DATA = { stavPristupu: 1, profil: 1, informace: 1, moje: 1, ucty: 1, prehled: 1, sbirka: 1, sbirkaSkupina: 1, zaci: 1, tridy: 1,
  historie: 1, zprava: 1, nastaveni: 1, schrankyStav: 1, mailStav: 1, diagnostika: 1, nahledSmazaniTridy: 1, nahledSmazaniSbirky: 1,
  nahledOdstraneniZaku: 1, nahledPresunuZaku: 1, nahledOdeslani: 1, nahledOdeslaniSkupiny: 1, pozvatNahled: 1, overitBanku: 1,
  zkusitBankovniEmail: 1, kodPoslat: 1, prihlasit: 1, odhlasit: 1, registraceZnovu: 1, rodicDiteKod: 1, vse: 1,
  temaUlozit: 1, prihlasitKodem: 1, prihlasitSpravce: 1, registrovat: 1, registraceOverit: 1, zmenitHeslo: 1, emailZmenaPoslat: 1 };       // přihlašování nemění data z tabulky, takže mezipaměť nemaže

function verzeCache_() {
  var c = CacheService.getScriptCache(), v = c.get("DC_VER");
  if (!v) { v = String(Date.now()) + Math.floor(Math.random() * 1000); c.put("DC_VER", v, 21600); }
  return v;
}

// Zneplatní všechny odložené výsledky (volá se po zápisu; bezpečné volat z libovolného místa).
function zneplatniCacheDat_() {
  try { CacheService.getScriptCache().put("DC_VER", String(Date.now()) + Math.floor(Math.random() * 1000), 21600); } catch (e) {}
}

function klicCache_(akce, argsJson, uziv, verze) {
  var args = {};
  try { args = argsJson ? JSON.parse(argsJson) : {}; } catch (e) {}
  delete args.obnovit;
  var osoba = akce === "moje" ? (uziv.jmeno || "") : "";
  return "DC_" + sha256Hex_(verze + "|" + akce + "|" + uziv.role + "|" + osoba + "|" + JSON.stringify(args)).substring(0, 40);
}

// Hodnota se dělí na kusy (jedna položka mezipaměti smí mít 100 kB).
function cteCache_(klic) {
  var c = CacheService.getScriptCache(), meta = c.get(klic);
  if (!meta) return null;
  var n = parseInt(meta, 10);
  if (!(n > 0)) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(klic + "_" + i);
  var kusy = c.getAll(keys), out = "";
  for (var j = 0; j < n; j++) {
    var k = kusy[keys[j]];
    if (k == null) return null;
    out += k;
  }
  return out;
}

function ulozCache_(klic, text) {
  var KUS = 30000, c = CacheService.getScriptCache(), mapa = {}, n = Math.ceil(text.length / KUS);
  if (n > 100) return;                                  // zbytečně velké (přes 3 MB): necháme být
  for (var i = 0; i < n; i++) mapa[klic + "_" + i] = text.substring(i * KUS, (i + 1) * KUS);
  mapa[klic] = String(n);
  c.putAll(mapa, CACHE_TTL_S);
}

// Vrátí výsledek fn() z mezipaměti, nebo ho spočítá a uloží (stejná pravidla zneplatnění jako u jednotlivých čtení).
function zMezipameti_(nazev, uziv, obnovit, fn) {
  var verze = verzeCache_();
  var klic = "DC_" + sha256Hex_(verze + "|bundle|" + nazev + "|" + uziv.role + "|" + (uziv.jmeno || "")).substring(0, 40);
  if (!obnovit) {
    var z = cteCache_(klic);
    if (z) { try { return JSON.parse(z); } catch (e) {} }
  }
  var v = fn();
  try { ulozCache_(klic, JSON.stringify(v)); } catch (e2) {}
  return v;
}

// Všechno, co rozhraní zobrazuje, JEDNÍM dotazem: přehled, žáci a třídy, historie, detail každé sbírky, moje platby, informace, nastavení.
// Rozhraní tím předem naplní svou paměť a přepínání mezi stránkami pak nečeká na server. Obsah se řídí právy uživatele.
function api_vse_(a, uziv) {
  var m = function(p) { return maOpravneni_(uziv.role, p); };
  var obnovit = !!(a && a.obnovit);
  var out = { cas: Date.now() };
  var tabulka = zMezipameti_("data", uziv, obnovit, function() {
    var t = {};
    __MEMO = {};
    try {
      if (m("cteni")) {
        predNactiListy_(seznamVsechTrid_());
        t.prehled = api_prehled_({}, uziv);
        t.zaci = api_tridy_({ zaci: true });
        t.historie = api_historie_();
        // Předčítají se nejnovější sbírky aktivních tříd, dokud se vejdou do rozpočtu (přehled je řadí od nejnovější). U školy s mnoha
        // sbírkami by jinak balík měl megabajty a přestal by se vejít do mezipaměti; starší sbírky se načtou až při otevření (jako dřív).
        t.detaily = {};
        var pouzito = 0;
        t.prehled.skupiny.filter(function(g) { return !g.archiv; }).some(function(g, poradi) {
          var novy = {}, velikost = 0;
          if (g.casti.length > 1) {
            try { novy["skup:" + g.id] = api_sbirkaSkupina_({ skupina: g.id }); } catch (e) {}
          }
          g.casti.forEach(function(c) {
            try { novy["detail:" + c.colIndex + ":" + c.tridaId] = api_sbirka_({ colIndex: c.colIndex, tridaId: c.tridaId }); } catch (e) {}
          });
          Object.keys(novy).forEach(function(k) { velikost += JSON.stringify(novy[k]).length; });
          if (poradi > 0 && pouzito + velikost > MAX_PREDNACTENO_ZNAKU) return true;       // nejnovější sbírka se předčte vždy
          Object.keys(novy).forEach(function(k) { t.detaily[k] = novy[k]; });
          pouzito += velikost;
          return false;
        });
      }
      if (m("moje")) t.moje = api_moje_({}, uziv);
    } finally { __MEMO = null; }
    return t;
  });
  Object.keys(tabulka).forEach(function(k) { out[k] = tabulka[k]; });
  out.informace = api_informace_({}, uziv);
  // Údaje o účtech a nastavení se čtou vždy čerstvé (jsou levné a mění se i mimo tabulku).
  if (m("cteni")) {
    out.nastaveni = [api_nastaveni_({}, uziv), api_profil_({}, uziv), m("ucty") ? api_ucty_() : null,
      m("nastaveni") ? api_mailStav_() : null, m("technicke") ? api_diagnostika_() : null, m("nastaveni") ? api_schrankyStav_({}, uziv) : null];
  }
  return out;
}

// Jediný vstup z prohlížeče. Vrací JSON text { ok, data } nebo { ok:false, chyba, kod }.
function apiVolej(akce, argsJson, token) {
  var vysledek, mutace = false;
  try {
    var def = (typeof akce === "string" && AKCE.hasOwnProperty(akce)) ? AKCE[akce] : null;
    if (!def) throw new Error("Neznámá akce: " + akce);
    var args = argsJson ? JSON.parse(argsJson) : {};
    var uziv = null;
    if (!def.verejna) {
      uziv = overPristup_(token);
      if (!maOpravneni_(uziv.role, def.pravo)) throw new Error("Pro tuto akci nemáte oprávnění.");   // oprávnění se ověřují VŽDY, i při zásahu mezipaměti
    }
    if (uziv && CACHE_AKCE[akce] === 1) {
      var verze = verzeCache_(), klic = klicCache_(akce, argsJson, uziv, verze);
      if (!(args && args.obnovit)) {
        var zMezipameti = cteCache_(klic);
        if (zMezipameti) return '{"ok":true,"data":' + zMezipameti + ',"cache":true}';
      }
      var data = def.fn(args || {}, uziv, token);
      var text = JSON.stringify(data);
      ulozCache_(klic, text);
      return '{"ok":true,"data":' + text + '}';
    }
    mutace = !NEMENI_DATA[akce];
    vysledek = { ok: true, data: def.fn(args || {}, uziv, token) };
  } catch (e) {
    vysledek = { ok: false, chyba: (e && e.message) ? e.message : String(e) };
    if (e && e.kod) vysledek.kod = e.kod;
  }
  if (mutace) zneplatniCacheDat_();                     // i po chybě: akce mohla část změn provést
  return JSON.stringify(vysledek);
}

// ---------- AKCE: PŘIHLÁŠENÍ ----------
function maskujEmail_(email) {
  email = String(email || "");
  var i = email.indexOf("@");
  if (i < 1) return "";
  var m = email.substring(0, i);
  return m.substring(0, Math.min(2, m.length)) + "***" + email.substring(i);
}

function nactiSkolu_() {
  return PropertiesService.getScriptProperties().getProperty("SKOLA_NAZEV") || "";
}

function ulozSkolu_(nazev) {
  nazev = cistyText_(nazev, 80);
  PropertiesService.getScriptProperties().setProperty("SKOLA_NAZEV", nazev);
  return nazev;
}

function api_stavPristupu_(a, uziv, token) {
  var r = VYZADOVAT_PRIHLASENI ? overRelaci_(token) : { jmeno: "", role: "skolni_admin", prava: pravaRole_("skolni_admin"), email: "", typ: "skolni_admin", zobrazit: "" };
  // Tohle je první dotaz po otevření stránky: účty a údaje o škole se čtou jednou (každé čtení vlastností je volání služby).
  var vsichni = VYZADOVAT_PRIHLASENI ? vsichniUzivatele_() : [];
  var skolaId = nactiSkolaId_(), mailbox = mailboxCtena_();
  var out = {
    vyzadujePrihlaseni: VYZADOVAT_PRIHLASENI,
    prihlasen: !!r,
    jmeno: r ? r.jmeno : "",
    email: r ? r.email : "",
    zobrazit: r ? r.zobrazit : "",
    tema: r ? (r.tema || "") : "",
    typ: r ? r.role : "",
    role: r ? r.role : "",
    roleNazev: r ? ROLE_DEF[r.role].nazev : "",
    prava: r ? r.prava : [],
    skola: nactiSkolu_(),
    skolaWeb: skolaId.web,
    skolaSymbol: skolaId.symbol,
    vzhled: { barva: skolaId.vzhled.barva, logo: skolaId.vzhled.logo },
    bezUzivatelu: VYZADOVAT_PRIHLASENI && vsichni.length === 0,
    prvniSpusteni: VYZADOVAT_PRIHLASENI && !existujeAktivniSpravce_(vsichni),
    mailboxMaska: maskujEmail_(mailbox),     // veřejně jen zamaskovaně (registrující se musí vědět, kterým účtem)
    adminUcty: r ? [] : adminiSUctem_(vsichni).map(function(x) { return { id: x.id, jmeno: x.jmeno, maska: maskaUctu_(x.iban) }; }),   // nabídka pro registraci učitele (nepřihlášení vidí jen zakrytý účet)
    vlastnikPovolen: !!VLASTNIK_EMAIL,
    mailbox: r ? mailbox : ""                // celou adresu ukazujeme jen přihlášeným
  };
  if (r && maOpravneni_(r.role, "ucty")) out.cekajiciUctu = pocetCekajicichUctu_();
  return out;
}

function sestavOdpovedPrihlaseni_(u) {
  try { u.posledni = new Date().toISOString(); ulozUzivatele_(u); } catch (e) { /* nevadí */ }
  return {
    token: vytvorRelaci_(u.jmeno), jmeno: u.jmeno, role: u.role, roleNazev: ROLE_DEF[u.role].nazev, email: u.email || "",
    zobrazit: u.zobrazit || "", tema: u.tema || "", typ: u.role, prava: pravaRole_(u.role), skola: nactiSkolu_(), platnostDni: Math.round(RELACE_PLATNOST_MS / 86400000)
  };
}

// Přihlášení jménem a heslem už neexistuje (od verze 5.2): všichni se přihlašují e-mailem a kódem, správci ještě heslem.
// Akce zůstává jen proto, aby starší otevřená stránka dostala srozumitelnou odpověď.
function api_prihlasit_(a) {
  if (!VYZADOVAT_PRIHLASENI) return { token: "", jmeno: "", role: "skolni_admin", prava: pravaRole_("skolni_admin") };
  throw new Error("Přihlášení jménem a heslem už není. Přihlaste se e-mailem: zadejte svou adresu a opište kód, který na ni přijde (správci pak ještě své heslo). Obnovte stránku.");
}

// Zvolený vzhled (světlý / tmavý / podle zařízení) se ukládá u účtu: v prohlížeči (zvlášť ve vloženém okně Apps Scriptu) úložiště nemusí fungovat.
function api_temaUlozit_(a, uziv) {
  var t = String(a.tema == null ? "" : a.tema);
  if (["auto", "light", "dark"].indexOf(t) === -1) throw new Error("Neplatný vzhled.");
  return sPrihlasovacimZamkem_(function() {
    var u = nactiUzivatele_(uziv.jmeno);
    if (!u) throw new Error("Účet nenalezen.");
    u.tema = t;
    ulozUzivatele_(u);
    return { tema: t };
  });
}

function api_odhlasit_(a, uziv, token) {
  zrusRelaci_(token);
  return { odhlaseno: true };
}

function api_zmenitHeslo_(a, uziv, token) {
  if (!VYZADOVAT_PRIHLASENI) throw new Error("Přihlášení je vypnuté.");
  overHeslo_(uziv.jmeno, a.stare);               // současné heslo se ověřuje stejně přísně jako při přihlášení
  overSiluHesla_(a.nove, uziv.jmeno);
  sPrihlasovacimZamkem_(function() {
    var u = nactiUzivatele_(uziv.jmeno);
    if (!u) throw new Error("Účet nenalezen.");
    u.sul = novaSul_(); u.hash = hashHesla_(String(a.nove), u.sul);
    ulozUzivatele_(u);
    zrusRelaceUzivatele_(u.jmeno, "");           // zruší všechny relace…
    smazZamek_("ZAMEK_" + u.jmeno);
  });
  return { token: vytvorRelaci_(uziv.jmeno) };   // …a přihlášenému dá novou
}

// ---------- ÚČTY: PŘIHLÁŠENÍ GMAILEM, REGISTRACE, PROFIL ----------
// Přihlášení Gmailem: uživatel zadá svou adresu, na ni přijde jednorázový kód, který zadá do aplikace.
// Tím se ověří, že adresa patří jemu, a aplikace vždy ví, kdo (z jaké adresy) s ní pracuje.
//
// Registrace: uživatel vybere, kým je (učitel, žák/rodič), vyplní údaje a ověří adresu kódem. Pak:
//   • první správce aplikace (adresa účtu, pod kterým je aplikace nasazená) a vlastník se přihlásí rovnou,
//   • žák/rodič, jehož e-mail už je v tabulce u žáka (sloupec C = žák, sloupec F = rodiče), se přihlásí rovnou (vidí jen platby svého dítěte),
//   • rodič s jiným e-mailem se může ověřit přes dítě (kód na adresu dítěte), jinak čeká na schválení,
//   • ostatní čekají na schválení školním adminem a do té doby nevidí žádná data.
//
// Čtení bankovních e-mailů: aplikace čte jen schránku účtu, pod kterým běží (mailboxCtena_()). To, že se někdo
// přihlásí jiným Gmailem, aplikaci k jeho schránce přístup nedá – proto musí bankovní oznámení chodit do schránky,
// kterou aplikace čte (první správce je proto vždy ten účet), případně se do ní musí přeposílat.
var KOD_PLATNOST_S = 600;              // kód platí 10 minut
var KOD_MAX_POKUSU = 5;               // špatných zadání, pak se kód zruší
var KOD_MAX_ZA_HODINU = 6;            // kolik kódů lze za hodinu poslat na jednu adresu
var KOD_MAX_CELKEM = 200;             // kolik kódů smí aplikace poslat za 6 hodin (ochrana před zneužitím)
var MAIL_REZERVA_KVOTY = 15;          // tolik e-mailů z denní kvóty Googlu se kódy nikdy nespotřebují (zůstanou pro platby)
var REG_UCITELE_ZA_HODINU = 30;         // registrace učitelů bez kódu za hodinu (dohromady)
var MAX_CEKAJICICH_UCTU = 30;         // kolik neschválených registrací najednou
var OVERENI_REGISTRACE_MS = 24 * 3600 * 1000;   // neověřená registrace po dni zanikne

function normEmail_(s) {
  return String(s == null ? "" : s).trim().toLowerCase();
}

function platnyEmail_(s) {
  return s.length > 0 && s.length <= 80 && jeEmail_(s) && s.indexOf(" ") === -1;
}

function klicKodu_(email) {
  return "KOD_" + sha256Hex_("kod:" + email).substring(0, 30);
}

function novyKod_() {
  var hex = Utilities.getUuid().replace(/-/g, "").substring(0, 12);
  var n = parseInt(hex, 16) % 1000000;
  return ("000000" + n).slice(-6);
}

function chybaKodu_(zprava, kod) {
  var e = new Error(zprava);
  e.kodChyby = kod;
  return e;
}

// Celkový limit kódů za 6 hodin a rezerva denní kvóty Gmailu (společné pro všechny druhy kódů). Vrací dosavadní počet odeslaných kódů.
function celkovyLimitKodu_(cache) {
  var celkem = parseInt(cache.get("KODLIM_CELKEM") || "0", 10);
  if (celkem >= KOD_MAX_CELKEM) throw chybaKodu_("Aplikace za posledních několik hodin poslala příliš mnoho kódů (ochrana proti zneužití). Zkuste to později.", "LIMIT_CELKEM");
  if (nactiMailNastaveni_().poskytovatel === "gmail") {
    var zb = zbyvaGmailKvota_();
    if (zb >= 0 && zb <= MAIL_REZERVA_KVOTY) {
      throw chybaKodu_("Denní limit e-mailů, který Google aplikaci dovoluje, je téměř vyčerpaný (zbývá " + zb + "). Zkuste to zítra, nebo ať správce nastaví odesílání přes jinou službu (Nastavení → E-maily).", "LIMIT_CELKEM");
    }
  }
  return celkem;
}

// Pošle kód na adresu (s omezením počtu). Při překročení limitu vyhodí chybu s kodChyby LIMIT_ADRESA / LIMIT_CELKEM.
function posliKod_(email, ucel) {
  var cache = CacheService.getScriptCache();
  var limKlic = "KODLIM_" + sha256Hex_("lim:" + email).substring(0, 30);
  var n = parseInt(cache.get(limKlic) || "0", 10);
  if (n >= KOD_MAX_ZA_HODINU) throw chybaKodu_("Na tuhle adresu už bylo za poslední hodinu odesláno " + KOD_MAX_ZA_HODINU + " kódů. Použijte poslední doručený (zkontrolujte i spam), nebo to zkuste později.", "LIMIT_ADRESA");
  var celkem = celkovyLimitKodu_(cache);
  var kod = novyKod_(), sul = novaSul_();
  var skola = nactiSkolu_();
  var akce = ucel === "registrace" ? "dokončení registrace do" : (ucel === "zmena-emailu" ? "ověření nové e-mailové adresy v" : "přihlášení do");
  var text = "Váš kód pro " + akce + " aplikace Třídní fond" + (skola ? " (" + skola + ")" : "") + ": " + kod + "\n\n" +
    "Kód platí 10 minut a jde použít jen jednou. Pokud jste o něj nežádali, tento e-mail ignorujte – bez kódu se nikdo nepřihlásí.";
  var html = "<p>Váš kód pro " + akce + " aplikace <b>Třídní fond</b>" + (skola ? " (" + escHtml_(skola) + ")" : "") + ":</p>" +
    "<p style='font-size:28px;letter-spacing:4px;font-weight:bold'>" + kod + "</p>" +
    "<p>Kód platí 10 minut a jde použít jen jednou. Pokud jste o něj nežádali, tento e-mail ignorujte – bez kódu se nikdo nepřihlásí.</p>";
  posliSystemovyEmail_(email, "Třídní fond – váš kód " + kod, text, html);
  cache.put(limKlic, String(n + 1), 3600);
  cache.put("KODLIM_CELKEM", String(celkem + 1), 21600);
  cache.put(klicKodu_(email), JSON.stringify({ s: sul, h: sha256Hex_(sul + ":" + kod), n: 0, ucel: ucel, exp: Date.now() + KOD_PLATNOST_S * 1000 }), KOD_PLATNOST_S);
}

// Ověří kód (jednorázově). Při chybě vždy stejná hláška. Vrací záznam kódu (kód sedí) nebo false (nesedí); jiné chyby vyhazuje.
function overKodBezZamku_(email, kod, ucel, hl) {
  var cache = CacheService.getScriptCache();
  var klic = klicKodu_(email);
  var raw = cache.get(klic);
  if (!raw) throw new Error(hl);
  var k;
  try { k = JSON.parse(raw); } catch (e) { cache.remove(klic); throw new Error(hl); }
  if (k.ucel !== ucel) throw new Error(hl);
  var zadany = String(kod == null ? "" : kod).replace(/\s+/g, "");
  k.n = (k.n || 0) + 1;
  var ok = /^[0-9]{6}$/.test(zadany) && stejnyText_(sha256Hex_(k.s + ":" + zadany), k.h);
  if (!ok) {
    if (k.n >= KOD_MAX_POKUSU) cache.remove(klic);
    else cache.put(klic, JSON.stringify(k), Math.max(1, Math.ceil((k.exp - Date.now()) / 1000)));
    return false;
  }
  cache.remove(klic);
  return k;
}

// Ověří kód atomicky: počítání pokusů pod zámkem, aby se 5 pokusů na kód nedalo obejít souběžnými požadavky.
function overKod_(email, kod, ucel) {
  var hl = "Kód nesouhlasí nebo vypršel. Požádejte o nový.";
  var zaznam = sPrihlasovacimZamkem_(function() { return overKodBezZamku_(email, kod, ucel, hl); });
  if (!zaznam) { Utilities.sleep(300); throw new Error(hl); }
  return zaznam;                      // uložený záznam kódu (např. k.dite u ověření přes dítě)
}

function pocetCekajicichUctu_() {
  return vsichniUzivatele_().filter(function(u) { return u.stav === "ceka"; }).length;
}

// ---------- ÚČET SPRÁVCE A PROFILY UČITELŮ ----------
// Učitel může zadat vlastní číslo účtu. Když ho nevyplní, platí účet vybraného správce (jinak výchozí účet školy).
function idAdmina_(email) { return sha256Hex_("adm:" + normEmail_(email)).substring(0, 12); }
function klicIbanu_(iban) { return String(iban == null ? "" : iban).replace(/\s+/g, "").toUpperCase(); }

// Aktivní správci: [{ id, email, jmeno, iban }] (iban = jejich vlastní, jinak výchozí účet školy)
function adminiSUctem_(vsichni) {
  var vych = nactiVychoziProfil_();
  return (vsichni || vsichniUzivatele_()).filter(function(u) { return u.role === "skolni_admin" && (!u.stav || u.stav === "aktivni"); }).map(function(u) {
    return { id: idAdmina_(u.email || u.jmeno), email: u.email || u.jmeno, jmeno: u.zobrazit || u.email || u.jmeno, iban: (u.profil && u.profil.iban) || vych.iban || "" };
  }).sort(function(x, y) { return String(x.jmeno).localeCompare(String(y.jmeno), "cs"); });
}

// Zakrytý tvar čísla účtu pro nepřihlášené (poslední tři číslice a kód banky).
function maskaUctu_(iban) {
  if (!iban) return "";
  var c = ibanNaCisloUctu_(iban);
  if (c) { var d = c.split("/"); return "…" + d[0].slice(-3) + "/" + (d[1] || ""); }
  return "…" + String(iban).slice(-4);
}

// Který správce je pro učitele „jeho“ (vybraný nebo první).
function adminUcitele_(u, admini) {
  var hledany = u && u.profil && u.profil.ucetAdmina ? normEmail_(u.profil.ucetAdmina) : "";
  for (var i = 0; i < admini.length; i++) if (normEmail_(admini[i].email) === hledany) return admini[i];
  return admini[0] || null;
}

// Účet, ze kterého se tvoří QR platby sbírek tohoto uživatele: výchozí → účet vybraného správce → vlastní údaje.
function efektivniProfilUzivatele_(u) {
  var p = nactiVychoziProfil_();
  var klice = ["iban", "emailOznameni", "emailPlatby", "nazevUctu"];
  var prof = u && u.profil;
  if (prof && prof.ucetAdmina) {
    var a = null;
    try { a = nactiUzivatele_(prof.ucetAdmina); } catch (e) {}
    if (a && a.profil) klice.forEach(function(k) { if (a.profil[k]) p[k] = a.profil[k]; });
  }
  if (prof) klice.forEach(function(k) { if (prof[k]) p[k] = prof[k]; });
  return p;
}

// Má učitel vlastní číslo účtu, které se liší od účtu jeho správce? Pak musí banka posílat oznámení na adresu schránky aplikace.
function lisiSeUcet_(u, admini) {
  if (!u || u.role !== "ucitel" || !u.profil || !u.profil.iban) return false;
  var a = adminUcitele_(u, admini);
  var adminIban = a ? a.iban : nactiVychoziProfil_().iban;
  return klicIbanu_(u.profil.iban) !== klicIbanu_(adminIban);
}

// Profil pro uložení. Správce musí mít číslo účtu vždy; učitel ho může nechat prázdné (pak platí účet vybraného správce).
function overProfilUzivatele_(a, email, role) {
  a = a || {};
  if (role === "skolni_admin") return overProfil_(a, email);
  var admini = adminiSUctem_(), admin = null;
  for (var i = 0; i < admini.length; i++) if (admini[i].id === String(a.adminId == null ? "" : a.adminId)) admin = admini[i];
  if (!admin && admini.length) admin = admini[0];
  var p;
  if (String(a.iban == null ? "" : a.iban).trim() !== "") {
    p = overProfil_(a, email);
  } else {
    var oznameni = normEmail_(a.emailOznameni) || normEmail_(email);
    if (!platnyEmail_(oznameni)) throw new Error("Zadejte platný e-mail, kam mají chodit oznámení o platbách.");
    p = { emailOznameni: oznameni, nazevUctu: cistyText_(a.nazevUctu, 40) };
  }
  if (admin) p.ucetAdmina = admin.email;
  return p;
}

// Údaje účtu bez hesla a soli.
function verejnyUcet_(u) {
  return {
    jmeno: u.jmeno, email: u.email || "", zobrazit: u.zobrazit || "", typ: u.role, role: u.role, roleNazev: ROLE_DEF[u.role].nazev,
    stav: u.stav || "aktivni", profil: u.profil || null, vytvoreno: u.vytvoreno || "", schvaleno: u.schvaleno || "",
    schvalil: u.schvalil || "", maHeslo: !!u.hash, pozvan: !!u.pozvan, pozval: u.pozval || "", posledni: u.posledni || "",
    bezPrihlaseni: !umiSePrihlasit_(u)           // starý účet jen s přihlašovacím jménem: už se do aplikace přihlásit nedá
  };
}

// Zkontroluje a očistí profil (číslo účtu, e-maily). Chyby jsou čitelné pro uživatele.
// Nevyplněný e-mail pro oznámení = přihlašovací e-mail; nevyplněný e-mail s bankovními oznámeními = schránka, kterou aplikace čte.
function overProfil_(p, prihlasovaciEmail) {
  p = p || {};
  var u = normalizujUcet_(p.iban);
  if (!u.ok) throw new Error(u.chyba);
  var oznameni = normEmail_(p.emailOznameni) || normEmail_(prihlasovaciEmail);
  var platby = normEmail_(p.emailPlatby) || mailboxCtena_();
  if (!platnyEmail_(oznameni)) throw new Error("Zadejte platný e-mail, kam mají chodit oznámení o platbách.");
  if (platby && !platnyEmail_(platby)) throw new Error("Zadejte platný e-mail, na který chodí bankovní oznámení o platbách (nebo pole nechte prázdné).");
  return { iban: u.iban, emailOznameni: oznameni, emailPlatby: platby, nazevUctu: cistyText_(p.nazevUctu, 40) };
}

function overZobrazeneJmeno_(s) {
  var j = cistyText_(s, 60);
  if (j.length < 2) throw new Error("Zadejte své jméno (aspoň 2 znaky).");
  return j;
}

// Role, kterou si může vybrat sám registrující se (školního admina přiděluje jen školní admin).
function overRoliRegistrace_(typ) {
  var role = String(typ == null ? "" : typ).trim().toLowerCase();       // jen přesné názvy, ne přeložené staré role
  if (!ROLE_DEF.hasOwnProperty(role) || !ROLE_DEF[role].registrace) throw new Error("Vyberte, jestli jste učitel, nebo žák / rodič.");
  return role;
}

// Neověřené registrace starší než den zaniknou.
function uklidNeoverenychUctu_() {
  var teď = Date.now(), props = PropertiesService.getScriptProperties();
  vsichniUzivatele_().forEach(function(u) {
    if (u.stav !== "ceka_overeni") return;
    var t = Date.parse(u.vytvoreno || "");
    if (!t || teď - t > OVERENI_REGISTRACE_MS) props.deleteProperty(klicUzivatele_(u.jmeno));
  });
}

// E-maily v buňce tabulky (může jich být víc oddělených čárkou, středníkem nebo mezerou).
function emailyBunky_(txt) {
  return String(txt == null ? "" : txt).toLowerCase().split(/[\s,;]+/).filter(function(x) { return x && jeEmail_(x); });
}

// Žáci (ve všech třídách), u kterých je tento e-mail: jako e-mail žáka (sloupec C), nebo – bez jenDite – i jako e-mail rodiče (sloupec F).
function zaciPodleEmailu_(email, jenDite) {
  email = normEmail_(email);
  var out = [];
  if (!email) return out;
  seznamTrid_().forEach(function(t) {
    zakyTridy_(t.list).forEach(function(z) {
      if (emailyBunky_(z.email).indexOf(email) !== -1 || (!jenDite && emailyBunky_(z.emailRodice).indexOf(email) !== -1)) out.push({ tridaId: t.id, tridaNazev: t.nazev, zak: z });
    });
  });
  return out;
}

function jeEmailZaka_(email) {
  try { return zaciPodleEmailu_(email).length > 0; } catch (e) { return false; }
}

// Pošle přihlašovací kód. Neregistrovaná adresa dostane výslovnou hlášku „účet není registrovaný“ (správce o to stojí;
// cena: kdo zkouší adresy, zjistí, které jsou v aplikaci – proto se pokusy s neznámou adresou omezují).
// Když se odeslání nepovede (kvóta, oprávnění), uživatel to dozví – chyba se neschovává.
var NEZNAMYCH_ZA_10_MIN = 30;

function obnovVlastnika_(email) {
  var now = new Date().toISOString();
  ulozUzivatele_({ jmeno: email, email: email, zobrazit: "Vlastník", typ: "vlastnik", role: "vlastnik", stav: "aktivni",
    vytvoreno: now, overeno: now, schvaleno: now, schvalil: "automaticky (vlastník)" });
  return nactiUzivatele_(email);
}

// Pokus o přihlášení neznámým účtem: omezí počet pokusů a vždy skončí srozumitelnou hláškou.
function neznamyPokus_() {
  var cache = CacheService.getScriptCache();
  var n = parseInt(cache.get("NEZNAMY_PRIHL") || "0", 10);
  if (n >= NEZNAMYCH_ZA_10_MIN) throw new Error("Příliš mnoho pokusů s neregistrovanými adresami. Zkuste to za chvíli.");
  cache.put("NEZNAMY_PRIHL", String(n + 1), 600);
  Utilities.sleep(300);
  throw new Error("Tento účet není registrovaný. Zaregistrujte se v záložce Registrace (nebo požádejte školního admina o pozvánku).");
}

function api_kodPoslat_(a) {
  if (!VYZADOVAT_PRIHLASENI) throw new Error("Přihlášení je vypnuté.");
  var email = normEmail_(a.email);
  if (!platnyEmail_(email)) throw new Error("Zadejte platnou e-mailovou adresu.");
  var u = nactiUzivatele_(email);
  if (!u && jeVlastnikEmail_(email)) u = obnovVlastnika_(email);    // vlastník se odebrat nedá; kdyby záznam zmizel, obnoví se
  if (!u) neznamyPokus_();
  if (u.stav === "ceka") throw new Error("Tento účet je zaregistrovaný, ale ještě ho neschválil školní admin. Až ho schválí, přihlásíte se stejným způsobem." + (u.role === "zak" ? " Jste rodič? V záložce Registrace se můžete ověřit přes své dítě." : ""));
  if (u.stav === "ceka_overeni") throw new Error("Registrace s touto adresou není dokončená. V záložce Registrace si nechte poslat kód znovu, nebo se zaregistrujte znovu.");
  if (u.stav === "zablokovan") throw new Error("Tento účet je zablokovaný. Obraťte se na školního admina.");
  try {
    posliKod_(email, "prihlaseni");
  } catch (e) {
    if (e.kodChyby === "LIMIT_ADRESA" || e.kodChyby === "LIMIT_CELKEM") throw e;
    throw new Error("E-mail s kódem se nepodařilo odeslat. Zkuste to za chvíli; když se to opakuje, správce uvidí důvod v Nastavení → E-maily (limit e-mailů nebo oprávnění).");
  }
  return { odeslano: true, zprava: "Poslali jsme na tuto adresu kód (platí 10 minut). Zkontrolujte i složku Spam." };
}

function api_prihlasitKodem_(a) {
  if (!VYZADOVAT_PRIHLASENI) throw new Error("Přihlášení je vypnuté.");
  var email = normEmail_(a.email);
  if (!platnyEmail_(email)) throw new Error("Zadejte platnou e-mailovou adresu.");
  overKod_(email, a.kod, "prihlaseni");
  var u = nactiUzivatele_(email);
  if (!u) throw new Error("Kód nesouhlasí nebo vypršel. Požádejte o nový.");
  if (u.stav === "ceka") throw new Error("Adresa je ověřená, ale účet ještě neschválil školní admin. Až ho schválí, přihlásíte se stejným způsobem.");
  if (u.stav && u.stav !== "aktivni") throw new Error("Kód nesouhlasí nebo vypršel. Požádejte o nový.");
  if (vyzadujeHeslo_(u)) {
    // Správce: kód je jen první krok. Dostane krátkodobou propustku a musí zadat (nebo poprvé nastavit) heslo.
    var propustka = sha256Hex_(Utilities.getUuid() + Utilities.getUuid() + Date.now());
    CacheService.getScriptCache().put(klicPropustky_(propustka), email, KOD_PLATNOST_S);
    return { krokHeslo: true, nastavit: !u.hash, propustka: propustka, email: email };
  }
  return sestavOdpovedPrihlaseni_(u);
}

function klicPropustky_(propustka) { return "ADMPROP_" + sha256Hex_("prop:" + propustka).substring(0, 40); }

// Druhý krok přihlášení správce: heslo (nebo první nastavení hesla). Propustka vznikla jen po správném kódu.
function api_prihlasitSpravce_(a) {
  if (!VYZADOVAT_PRIHLASENI) throw new Error("Přihlášení je vypnuté.");
  var email = normEmail_(a.email), propustka = String(a.propustka == null ? "" : a.propustka);
  var hl = "Přihlášení vypršelo. Začněte znovu zadáním e-mailu.";
  if (!/^[0-9a-f]{64}$/.test(propustka)) throw new Error(hl);
  var cache = CacheService.getScriptCache(), klic = klicPropustky_(propustka);
  if (cache.get(klic) !== email) throw new Error(hl);
  var heslo = String(a.heslo == null ? "" : a.heslo);
  if (!heslo) throw new Error("Zadejte heslo.");
  var u = nactiUzivatele_(email);
  if (!u || !vyzadujeHeslo_(u) || (u.stav && u.stav !== "aktivni")) throw new Error(hl);
  if (u.hash) {
    u = overHeslo_(email, heslo);                         // počítá chyby a zamyká účet
  } else {
    if (heslo !== String(a.heslo2 == null ? "" : a.heslo2)) throw new Error("Obě hesla se musí shodovat.");
    overSiluHesla_(heslo, email);
    u = sPrihlasovacimZamkem_(function() {
      var c = nactiUzivatele_(email);
      if (c.hash) throw new Error(hl);
      c.sul = novaSul_(); c.hash = hashHesla_(heslo, c.sul);
      ulozUzivatele_(c);
      return c;
    });
  }
  cache.remove(klic);
  return sestavOdpovedPrihlaseni_(u);
}

// Registrace: uloží účet (zatím neověřený) a pošle kód na zadanou adresu.
//   a.typ = ucitel | zak (u prvního správce se role určí sama), a.jmeno, a.email,
//   a.iban, a.nazevUctu, a.emailOznameni, a.heslo, a.heslo2, a.skola (jen první správce; učitel a žák číslo účtu ani heslo nezadávají)
function api_registrovat_(a) {
  if (!VYZADOVAT_PRIHLASENI) throw new Error("Přihlášení je vypnuté.");
  var email = normEmail_(a.email);
  if (!platnyEmail_(email)) throw new Error("Zadejte platnou e-mailovou adresu.");
  var prvni = !existujeAktivniSpravce_();
  var role;
  if (jeVlastnikEmail_(email)) {
    role = "vlastnik";
  } else if (prvni) {
    var mb = mailboxCtena_();
    if (!mb) throw new Error("Aplikace zatím nemá správce a nepodařilo se zjistit, kdo ji nasadil. První účet vytvořte v tabulce: Třídní fond → Přístup do aplikace → Přidat správce.");
    if (email !== mb) {
      throw new Error("Aplikace zatím nemá správce. První účet musí být ten, pod kterým je aplikace nasazená a kam chodí bankovní e-maily (" + maskujEmail_(mb) +
        "), protože jen z jeho schránky aplikace čte platby. Zaregistrujte se touto adresou.");
    }
    role = "skolni_admin";
  } else {
    role = overRoliRegistrace_(a.typ);
  }
  var zobrazit = overZobrazeneJmeno_(a.jmeno);
  // Správce zadává číslo účtu povinně; učitel nepovinně (jinak platí účet vybraného správce); žák ho nezadává.
  var profil = ROLE_DEF[role].profilPriRegistraci ? overProfil_(a, email) : (role === "ucitel" ? overProfilUzivatele_(a, email, "ucitel") : null);
  var hesloSpravce = "";
  if (role === "skolni_admin") {
    hesloSpravce = String(a.heslo == null ? "" : a.heslo);
    if (hesloSpravce !== String(a.heslo2 == null ? "" : a.heslo2)) throw new Error("Obě hesla se musí shodovat.");
    overSiluHesla_(hesloSpravce, email);
  }
  var skola = "", skolaId = { web: "", symbol: "" };
  if (role === "skolni_admin" && prvni) {
    skola = cistyText_(a.skola, 80);
    if (skola.length < 2) throw new Error("Zadejte název školy (nebo třídy), pro kterou aplikaci zavádíte.");
    skolaId = rozborSkolaId_(a.skolaId);
    if (!skolaId.web && !skolaId.symbol) throw new Error("Zadejte web školy (např. jaroska.cz) nebo její symbol (RED-IZO / IZO / IČO). Podle toho se aplikace přizpůsobí vaší škole.");
  }
  return sPrihlasovacimZamkem_(function() {
    uklidNeoverenychUctu_();
    var stary = nactiUzivatele_(email);
    if (stary && stary.stav !== "ceka_overeni") throw new Error("Tahle adresa už je registrovaná. Přihlaste se kódem, nebo počkejte na schválení správcem.");
    if (!stary && vsichniUzivatele_().filter(function(x) { return x.stav === "ceka_overeni" || x.stav === "ceka"; }).length >= MAX_CEKAJICICH_UCTU) {
      throw new Error("Čeká příliš mnoho registrací. Zkuste to později nebo se obraťte na správce.");
    }
    if (role === "ucitel") {
      // Učitele stejně musí schválit správce a přihlašovat se bude kódem na tuto adresu, takže kód při registraci nic neověřuje.
      // Proto se neposílá; místo toho je omezený počet takových registrací za hodinu (ochrana proti zahlcení fronty).
      var cache = CacheService.getScriptCache();
      var pocet = parseInt(cache.get("REG_UCITELE") || "0", 10);
      if (pocet >= REG_UCITELE_ZA_HODINU) throw new Error("Za poslední hodinu přišlo příliš mnoho registrací. Zkuste to později.");
      cache.put("REG_UCITELE", String(pocet + 1), 3600);
      var nu = {
        jmeno: email, email: email, zobrazit: zobrazit, typ: role, role: role, stav: "ceka",
        profil: profil, vytvoreno: new Date().toISOString()
      };
      ulozUzivatele_(nu);
      return { odeslano: false, bezKodu: true, email: email, role: role, prvni: false };
    }
    posliKod_(email, "registrace");                // až když kód odešel, účet se uloží
    var u = {
      jmeno: email, email: email, zobrazit: zobrazit, typ: role, role: role, stav: "ceka_overeni",
      profil: profil, vytvoreno: new Date().toISOString()
    };
    if (skola) { u.skolaNazev = skola; u.skolaWeb = skolaId.web; u.skolaSymbol = skolaId.symbol; }
    if (hesloSpravce) { u.sul = novaSul_(); u.hash = hashHesla_(hesloSpravce, u.sul); }
    ulozUzivatele_(u);
    return { odeslano: true, email: email, role: role, prvni: role === "skolni_admin" };
  });
}

// Dokončení registrace: ověření adresy kódem. Podle role se účet buď rovnou aktivuje a uživatel se přihlásí,
// nebo čeká na schválení správcem.
function api_registraceOverit_(a) {
  if (!VYZADOVAT_PRIHLASENI) throw new Error("Přihlášení je vypnuté.");
  var email = normEmail_(a.email);
  if (!platnyEmail_(email)) throw new Error("Zadejte platnou e-mailovou adresu.");
  var u = nactiUzivatele_(email);
  if (!u || u.stav !== "ceka_overeni") throw new Error("Kód nesouhlasí nebo vypršel. Požádejte o nový.");
  overKod_(email, a.kod, "registrace");
  return sPrihlasovacimZamkem_(function() {
    var c = nactiUzivatele_(email);
    if (!c || c.stav !== "ceka_overeni") throw new Error("Registrace už není platná. Zaregistrujte se znovu.");
    c.overeno = new Date().toISOString();
    var auto = "";
    if (c.role === "vlastnik") auto = "vlastník (automaticky)";
    else if (c.role === "skolni_admin" && !existujeAktivniSpravce_() && email === mailboxCtena_()) auto = "první správce (automaticky)";
    else if (c.role === "zak" && jeEmailZaka_(email)) auto = "e-mail žáka nebo rodiče je v tabulce (automaticky)";
    if (auto) {
      c.stav = "aktivni"; c.schvaleno = c.overeno; c.schvalil = auto;
      if (c.skolaNazev) {
        ulozSkolu_(c.skolaNazev);
        ulozSkolaId_({ web: c.skolaWeb || "", symbol: c.skolaSymbol || "" });
        if (c.skolaWeb) obnovVzhledSkoly_();          // best effort: barva a logo z webu školy
        pripravTabulkuSkoly_(c.skolaNazev);           // první správce nové školy → tabulka se zařídí pro školu
        if (c.profil && !nactiVychoziProfil_().iban) ulozVychoziProfil_(c.profil);   // jeho účet je výchozí i pro učitele, kteří svůj nezadávají
      }
      delete c.skolaNazev; delete c.skolaWeb; delete c.skolaSymbol;
      ulozUzivatele_(c);
      var odp = sestavOdpovedPrihlaseni_(c);
      odp.stav = "aktivni";
      odp.automaticky = auto;
      return odp;
    }
    c.stav = "ceka";
    delete c.skolaNazev; delete c.skolaWeb; delete c.skolaSymbol;
    ulozUzivatele_(c);
    return { stav: "ceka", zak: c.role === "zak" };
  });
}

// Znovu pošle kód k nedokončené registraci.
function api_registraceZnovu_(a) {
  var email = normEmail_(a.email);
  var u = platnyEmail_(email) ? nactiUzivatele_(email) : null;
  if (!u || u.stav !== "ceka_overeni") throw new Error("Tahle registrace už není otevřená. Zaregistrujte se znovu.");
  posliKod_(email, "registrace");
  return { odeslano: true };
}

// ---- ověření rodiče přes dítě
// Rodič, jehož e-mail škola v tabulce nemá (učitel ho nezapsal do sloupce „E-mail rodiče“), se po ověření vlastní adresy může propojit
// s dítětem: kód přijde na adresu DÍTĚTE (tu, kterou škola eviduje u žáka), dítě ho předá rodiči a ten ho opíše. Tím dítě potvrdí, že rodiče
// zná. Adresa rodiče se zapíše do sloupce F u žáka a účet se aktivuje; přihlásí se pak běžným kódem na svou adresu (ověření dítětem
// samo relaci nevydává, takže kdo kód od dítěte získá, nezíská tím cizí účet).
var DITE_MAX_ZA_HODINU = 3;          // kolik kódů za hodinu si smí vyžádat jeden rodič
var DITE_MAX_NA_DITE = 4;            // kolik kódů za 6 hodin smí dostat jedna adresa dítěte (omezuje hádání kódu i zahlcení dítěte e-maily)
function klicRodicDite_(rodic) { return "dite|" + rodic; }

// Odpověď je stejná, ať adresa dítěte v tabulce je, nebo ne (aby se z ní nedalo zjišťovat, které adresy škola eviduje).
function api_rodicDiteKod_(a) {
  if (!VYZADOVAT_PRIHLASENI) throw new Error("Přihlášení je vypnuté.");
  var rodic = normEmail_(a.email), dite = normEmail_(a.diteEmail);
  if (!platnyEmail_(rodic)) throw new Error("Zadejte platnou e-mailovou adresu rodiče (tu, kterou jste se registrovali).");
  if (!platnyEmail_(dite)) throw new Error("Zadejte platnou e-mailovou adresu dítěte.");
  if (rodic === dite) throw new Error("Zadejte e-mail dítěte (žáka), ne svůj.");
  var u = nactiUzivatele_(rodic);
  if (!u || u.role !== "zak" || u.stav !== "ceka") throw new Error("Ověření přes dítě je pro registrované rodiče, jejichž účet čeká na schválení. Nejdřív se zaregistrujte v záložce Registrace.");
  var cache = CacheService.getScriptCache();
  var lr = "DITELIM_R_" + sha256Hex_("r:" + rodic).substring(0, 30), ld = "DITELIM_D_" + sha256Hex_("d:" + dite).substring(0, 30);
  var nr = parseInt(cache.get(lr) || "0", 10), nd = parseInt(cache.get(ld) || "0", 10);
  if (nr >= DITE_MAX_ZA_HODINU || nd >= DITE_MAX_NA_DITE) {
    throw chybaKodu_("Kód už byl za poslední hodinu poslán několikrát. Použijte poslední doručený (dítě ho najde ve své poště, i ve Spamu), nebo to zkuste později.", "LIMIT_ADRESA");
  }
  var celkem = celkovyLimitKodu_(cache);
  var zakove = zaciPodleEmailu_(dite, true);
  cache.put(lr, String(nr + 1), 3600);
  cache.put(ld, String(nd + 1), 21600);
  if (zakove.length) {
    var kod = novyKod_(), sul = novaSul_(), skola = nactiSkolu_();
    var text = "Ahoj,\n\nrodič nebo zákonný zástupce s adresou " + rodic + " si v aplikaci Třídní fond" + (skola ? " (" + skola + ")" : "") +
      " žádá o přístup k platbám třídy. Pokud ho znáš a souhlasíš, předej mu tento kód: " + kod + "\n\nKód platí 10 minut. Pokud o nic takového nejde, tento e-mail ignoruj – bez kódu se nic nestane.";
    var html = "<p>Ahoj,</p><p>rodič nebo zákonný zástupce s adresou <b>" + escHtml_(rodic) + "</b> si v aplikaci <b>Třídní fond</b>" + (skola ? " (" + escHtml_(skola) + ")" : "") +
      " žádá o přístup k platbám třídy. Pokud ho znáš a souhlasíš, předej mu tento kód:</p>" +
      "<p style='font-size:28px;letter-spacing:4px;font-weight:bold'>" + kod + "</p>" +
      "<p>Kód platí 10 minut. Pokud o nic takového nejde, tento e-mail ignoruj – bez kódu se nic nestane.</p>";
    try {
      posliSystemovyEmail_(dite, "Třídní fond – kód pro propojení rodiče: " + kod, text, html);
    } catch (e) {
      throw new Error("E-mail s kódem se nepodařilo odeslat. Zkuste to za chvíli; když se to opakuje, ozvěte se školnímu adminovi.");
    }
    cache.put("KODLIM_CELKEM", String(celkem + 1), 21600);
    cache.put(klicKodu_(klicRodicDite_(rodic)), JSON.stringify({ s: sul, h: sha256Hex_(sul + ":" + kod), n: 0, ucel: "dite", dite: dite, exp: Date.now() + KOD_PLATNOST_S * 1000 }), KOD_PLATNOST_S);
  } else {
    Utilities.sleep(300);
  }
  return { odeslano: true, zprava: "Pokud je tato adresa u některého žáka, poslali jsme na ni kód (platí 10 minut). Požádejte dítě, ať vám ho předá – najde ho ve své poště (i ve Spamu)." };
}

// Kód od dítěte: propojí rodiče se žákem (zapíše jeho e-mail do sloupce F) a aktivuje účet.
function api_rodicDiteOverit_(a) {
  if (!VYZADOVAT_PRIHLASENI) throw new Error("Přihlášení je vypnuté.");
  var rodic = normEmail_(a.email), hl = "Kód nesouhlasí nebo vypršel. Požádejte o nový.";
  if (!platnyEmail_(rodic)) throw new Error("Zadejte platnou e-mailovou adresu.");
  var u = nactiUzivatele_(rodic);
  if (!u || u.role !== "zak" || u.stav !== "ceka") throw new Error(hl);
  var k = overKod_(klicRodicDite_(rodic), a.kod, "dite");
  var spojeno = spustSeZamkem_(function() { return pripojRodiceKZakovi_(k.dite, rodic); }, 20000);
  if (!spojeno.length) throw new Error("Dítě už u žádného žáka není, nebo má žák zapsaný nejvyšší počet rodičů. Obraťte se na školního admina.");
  sPrihlasovacimZamkem_(function() {
    var c = nactiUzivatele_(rodic);
    if (!c || c.stav !== "ceka") throw new Error(hl);
    c.stav = "aktivni"; c.schvaleno = new Date().toISOString(); c.schvalil = "ověřeno dítětem (" + maskujEmail_(k.dite) + ")";
    ulozUzivatele_(c);
  });
  return { stav: "aktivni", zaci: spojeno.map(function(x) { return { zak: x.zak, trida: x.tridaNazev }; }) };
}

// ---- profil přihlášeného
function api_profil_(a, uziv) {
  var u = nactiUzivatele_(uziv.jmeno);
  if (!u) throw new Error("Účet nenalezen.");
  var vych = nactiVychoziProfil_();
  var maProfil = ROLE_DEF[u.role].profil;
  var ef = efektivniProfilUzivatele_(u);
  var admini = adminiSUctem_();
  var muj = u.role === "ucitel" ? adminUcitele_(u, admini) : null;
  return {
    ucet: verejnyUcet_(u),
    maProfil: maProfil,
    vychozi: vych,
    efektivni: { iban: ef.iban, emailOznameni: ef.emailOznameni, emailPlatby: ef.emailPlatby, nazevUctu: ef.nazevUctu || "" },
    mailbox: maProfil ? mailboxCtena_() : "",
    ibanCislo: ibanNaCisloUctu_(ef.iban),
    vlastniIban: !!(u.profil && u.profil.iban),
    jeUcitel: u.role === "ucitel",
    adminId: muj ? muj.id : "",
    admini: u.role === "ucitel" ? admini.map(function(x) { return { id: x.id, jmeno: x.jmeno, iban: x.iban, ucet: ibanNaCisloUctu_(x.iban) || x.iban }; }) : [],
    lisiSe: lisiSeUcet_(u, admini),
    bankaAdresa: mailboxCtena_()
  };
}

function api_profilUlozit_(a, uziv) {
  return sPrihlasovacimZamkem_(function() {
    var u = nactiUzivatele_(uziv.jmeno);
    if (!u) throw new Error("Účet nenalezen.");
    if (ROLE_DEF[u.role].profil) u.profil = overProfilUzivatele_(a, u.email, u.role);
    if (a.zobrazit !== undefined) u.zobrazit = overZobrazeneJmeno_(a.zobrazit);
    ulozUzivatele_(u);
    return api_profil_({}, uziv);
  });
}

// ---- správa účtů (školní admin)
// Kolik schválených školních adminů je (vlastník se nepočítá – jednou zmizí).
function poctuAdminu_() {
  return vsichniUzivatele_().filter(function(u) { return u.role === "skolni_admin" && umiSePrihlasit_(u) && (!u.stav || u.stav === "aktivni"); }).length;
}

function api_ucty_() {
  var admini = adminiSUctem_();
  var seznam = vsichniUzivatele_().map(function(u) { var v = verejnyUcet_(u); v.lisiSe = lisiSeUcet_(u, admini); v.adminId = u.role === "ucitel" ? (adminUcitele_(u, admini) || { id: "" }).id : ""; return v; });
  var poradi = { ceka: 0, ceka_overeni: 1, aktivni: 2, zablokovan: 3 };
  seznam.sort(function(x, y) {
    return (poradi[x.stav] - poradi[y.stav]) ||
      (ROLE_PORADI.indexOf(y.role) - ROLE_PORADI.indexOf(x.role)) ||      // vlastník, školní admin, učitel, žák/rodič
      String(x.zobrazit || x.jmeno).localeCompare(String(y.zobrazit || y.jmeno), "cs");
  });
  return {
    ucty: seznam, vychozi: nactiVychoziProfil_(), mailbox: mailboxCtena_(), cekajici: seznam.filter(function(x) { return x.stav === "ceka"; }).length,
    role: infoORolich_(), urlAplikace: adresaAplikace_(),
    admini: admini.map(function(x) { return { id: x.id, jmeno: x.jmeno, iban: x.iban, ucet: ibanNaCisloUctu_(x.iban) || x.iban }; })
  };
}

// Je účet právě teď aktivní školní admin? Podle toho se pozná vznik a zánik správce (povýšení, snížení, blokace, odebrání).
function jeAktivniAdmin_(u) {
  return !!u && u.role === "skolni_admin" && (!u.stav || u.stav === "aktivni");
}

// Co by změna účtu udělala se správcovskými právy: { bylAdmin, budeAdmin, novaRole, novyStav }. Bez uložení.
function dopadZmenyUctu_(u, a) {
  var novaRole = a.role !== undefined ? normRole_(a.role) : u.role;
  if (!novaRole || novaRole === "vlastnik") throw new Error("Neznámá role.");
  var novyStav = a.stav !== undefined ? String(a.stav) : (u.stav || "aktivni");
  if (["aktivni", "zablokovan"].indexOf(novyStav) === -1) {
    if (novyStav !== (u.stav || "aktivni")) throw new Error("Neplatný stav účtu.");
  }
  return { bylAdmin: jeAktivniAdmin_(u), budeAdmin: novaRole === "skolni_admin" && novyStav === "aktivni", novaRole: novaRole, novyStav: novyStav };
}

// a.stav: aktivni (schválit/odblokovat) | zablokovan; a.role. Správce sám sobě nesmí vzít správcovská práva.
// Heslo (a.heslo = heslo přihlášeného správce) se vyžaduje vždy, když by vznikl nebo zanikl správce:
// povýšení na admina, snížení admina, zablokování admina, schválení rovnou jako admin, odblokování admina.
function api_uctyZmenit_(a, uziv) {
  var pred = nactiUzivatele_(a.jmeno);
  if (!pred) throw new Error("Účet nenalezen.");
  if (pred.role === "vlastnik") throw new Error("Účet vlastníka nejde měnit ani blokovat.");
  var d0 = dopadZmenyUctu_(pred, a);
  var overeno = false;
  if (d0.bylAdmin !== d0.budeAdmin) { overHesloAkce_(uziv, a.heslo); overeno = true; }
  var schvaleni = null;
  var vysl = sPrihlasovacimZamkem_(function() {
    var u = nactiUzivatele_(a.jmeno);
    if (!u) throw new Error("Účet nenalezen.");
    if (u.role === "vlastnik") throw new Error("Účet vlastníka nejde měnit ani blokovat.");
    var d = dopadZmenyUctu_(u, a);
    if (d.bylAdmin !== d.budeAdmin && !overeno) throw new Error("Účet se mezitím změnil. Zkuste to znovu a zadejte své heslo.");
    var novaRole = d.novaRole, novyStav = d.novyStav, bylAdmin = d.bylAdmin, budeAdmin = d.budeAdmin;
    if (u.stav === "ceka_overeni" && novyStav === "aktivni") throw new Error("Uživatel ještě neověřil svůj e-mail kódem, schválit ho nejde.");
    if (bylAdmin && !budeAdmin && poctuAdminu_() < 2) throw new Error("Nejde odebrat práva ani zablokovat posledního školního admina.");
    if (normJmenoUziv_(a.jmeno) === normJmenoUziv_(uziv.jmeno) && bylAdmin && !budeAdmin) throw new Error("Sami sobě správcovská práva vzít nemůžete.");
    var puvodniStav = u.stav || "aktivni";
    u.role = novaRole;
    u.typ = novaRole;
    u.stav = novyStav;
    var povysen = !bylAdmin && budeAdmin && normJmenoUziv_(a.jmeno) !== normJmenoUziv_(uziv.jmeno);
    if (puvodniStav === "ceka" && novyStav === "aktivni") { u.schvaleno = new Date().toISOString(); u.schvalil = uziv.jmeno; }
    ulozUzivatele_(u);
    if (novyStav === "zablokovan" || povysen) zrusRelaceUzivatele_(u.jmeno, "");     // povýšený se přihlásí znovu a poprvé nastaví heslo (role se čte z účtu při každém požadavku, snížený tedy práva ztratí hned)
    if (puvodniStav === "ceka" && novyStav === "aktivni") {
      schvaleni = { email: u.email || u.jmeno, zobrazit: u.zobrazit || "", role: u.role, lisiSe: lisiSeUcet_(u, adminiSUctem_()) };
    }
    return verejnyUcet_(u);
  });
  // Po schválení čekajícího účtu dostane dotyčný e-mail, že se může přihlásit (mimo zámek: odesílání trvá).
  if (schvaleni && platnyEmail_(schvaleni.email)) {
    try {
      var t = textSchvaleni_(schvaleni);
      posliSystemovyEmail_(schvaleni.email, t.predmet, t.text, t.html);
      vysl.schvaleniEmail = "odeslan";
    } catch (e) {
      vysl.schvaleniEmail = "chyba";
      vysl.schvaleniChyba = String(e && e.message ? e.message : e);
    }
  }
  return vysl;
}

function textSchvaleni_(s) {
  var skola = nactiSkolu_(), url = adresaAplikace_(), roleNazev = ROLE_DEF[s.role] ? ROLE_DEF[s.role].nazev : "";
  var banka = s.lisiSe ? mailboxCtena_() : "";
  var predmet = "Třídní fond – registrace byla dokončena" + (skola ? " (" + skola + ")" : "");
  var text = "Dobrý den" + (s.zobrazit ? ", " + s.zobrazit : "") + ",\n\nvaše registrace do aplikace Třídní fond" + (skola ? " (" + skola + ")" : "") + " byla schválena. Role: " + roleNazev + ".\n\n" +
    "Teď se můžete přihlásit:\n1. Otevřete aplikaci: " + (url || "(adresu vám sdělí školní admin)") + "\n" +
    "2. V záložce Přihlášení zadejte tuto adresu: " + s.email + "\n" +
    "3. Na ni vám přijde šestimístný kód – opište ho do aplikace.\n\n" +
    (banka ? "Upozornění: váš účet pro výběr plateb se liší od účtu správce. Aby aplikace vaše platby viděla, musí banka posílat oznámení o příchozích platbách na adresu " + banka + ".\n\n" : "") +
    "Pokud jste se neregistroval(a), tento e-mail ignorujte.";
  var html = "<p>Dobrý den" + (s.zobrazit ? ", " + escHtml_(s.zobrazit) : "") + ",</p><p>vaše registrace do aplikace <b>Třídní fond</b>" + (skola ? " (" + escHtml_(skola) + ")" : "") +
    " byla schválena. Role: <b>" + escHtml_(roleNazev) + "</b>.</p>" +
    "<p><b>Teď se můžete přihlásit</b></p><ol><li>Otevřete aplikaci: " + (url ? "<a href='" + escHtml_(url) + "'>" + escHtml_(url) + "</a>" : "(adresu vám sdělí školní admin)") + "</li>" +
    "<li>V záložce <i>Přihlášení</i> zadejte tuto adresu: <b>" + escHtml_(s.email) + "</b></li>" +
    "<li>Na ni vám přijde šestimístný kód – opište ho do aplikace.</li></ol>" +
    (banka ? "<p><b>Upozornění:</b> váš účet pro výběr plateb se liší od účtu správce. Aby aplikace vaše platby viděla, musí banka posílat oznámení o příchozích platbách na adresu <b>" + escHtml_(banka) + "</b>.</p>" : "") +
    "<p>Pokud jste se neregistroval(a), tento e-mail ignorujte.</p>";
  return { predmet: predmet, text: text, html: html };
}

// Odebrání účtu. U správce (v jakémkoli stavu) se vyžaduje heslo přihlášeného správce (a.heslo).
function api_uctyOdebrat_(a, uziv) {
  var pred = nactiUzivatele_(a.jmeno);
  if (!pred) throw new Error("Účet nenalezen.");
  if (pred.role === "vlastnik") throw new Error("Účet vlastníka nejde odebrat.");
  if (normJmenoUziv_(pred.jmeno) === normJmenoUziv_(uziv.jmeno)) throw new Error("Sami sebe odebrat nejde.");
  var overeno = false;
  if (pred.role === "skolni_admin") { overHesloAkce_(uziv, a.heslo); overeno = true; }
  return sPrihlasovacimZamkem_(function() {
    var u = nactiUzivatele_(a.jmeno);
    if (!u) throw new Error("Účet nenalezen.");
    if (u.role === "vlastnik") throw new Error("Účet vlastníka nejde odebrat.");
    if (u.role === "skolni_admin" && !overeno) throw new Error("Účet se mezitím změnil. Zkuste to znovu a zadejte své heslo.");
    if (jeAktivniAdmin_(u) && poctuAdminu_() < 2) throw new Error("Nejde odebrat posledního školního admina.");
    odeberUzivatele_(u.jmeno);
    return { odebrano: u.jmeno };
  });
}

function api_uctyProfilUlozit_(a, uziv) {
  return sPrihlasovacimZamkem_(function() {
    var u = nactiUzivatele_(a.jmeno);
    if (!u) throw new Error("Účet nenalezen.");
    if (u.role === "vlastnik") throw new Error("Účet vlastníka nejde měnit.");
    if (ROLE_DEF[u.role].profil) u.profil = overProfilUzivatele_(a, u.email, u.role);
    if (a.zobrazit !== undefined) u.zobrazit = overZobrazeneJmeno_(a.zobrazit);
    ulozUzivatele_(u);
    var vu = verejnyUcet_(u);
    vu.lisiSe = lisiSeUcet_(u, adminiSUctem_());
    return vu;
  });
}

function api_vychoziProfilUlozit_(a, uziv) {
  var p = overProfil_(a, uziv && uziv.email);
  ulozVychoziProfil_(p);
  return { vychozi: nactiVychoziProfil_() };
}

// ---------- E-MAILY APLIKACE (přihlašovací kódy, upozornění) ----------
// E-maily žákům s QR kódem odcházejí VŽDY z Gmailu účtu aplikace (rodič musí poznat odesílatele a odpovědi
// jdou finančníkovi). Systémové e-maily (přihlašovací kódy, „vše zaplaceno“) mohou jít i přes externí službu,
// která nemá denní limit Googlu (100 e-mailů u běžného Gmailu, 1 500 u Google Workspace).
var MAIL_POSKYTOVATELE = {
  gmail:  "Gmail (výchozí – přes účet, pod kterým aplikace běží)",
  brevo:  "Brevo (dříve Sendinblue)",
  resend: "Resend"
};

function zbyvaGmailKvota_() {
  try { return MailApp.getRemainingDailyQuota(); } catch (e) { return -1; }
}

function zalogujChybuMailu_(zprava) {
  try {
    PropertiesService.getScriptProperties().setProperty("MAIL_POSLEDNI_CHYBA", JSON.stringify({ cas: new Date().toISOString(), zprava: String(zprava || "").substring(0, 300) }));
  } catch (e) {}
}

function nactiPosledniChybuMailu_() {
  var raw = PropertiesService.getScriptProperties().getProperty("MAIL_POSLEDNI_CHYBA");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

// surove = true: vrátí nastavení tak, jak ho správce uložil; jinak jen to, co lze doopravdy použít
// (externí služba bez klíče nebo bez odesílatele se bere jako Gmail).
function nactiMailNastaveni_(surove) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("MAIL_NASTAVENI"), p = {};
  if (raw) { try { p = JSON.parse(raw) || {}; } catch (e) { p = {}; } }
  var posk = MAIL_POSKYTOVATELE.hasOwnProperty(p.poskytovatel) ? p.poskytovatel : "gmail";
  var klic = !!props.getProperty("MAIL_KLIC");
  if (!surove && posk !== "gmail" && (!klic || !jeEmail_(p.odesilatel))) posk = "gmail";
  return { poskytovatel: posk, odesilatel: p.odesilatel || "", jmeno: p.jmeno || "", klicNastaven: klic };
}

function posliPresPoskytovatele_(nast, komu, predmet, text, html) {
  var klic = PropertiesService.getScriptProperties().getProperty("MAIL_KLIC");
  var jmeno = (nast.jmeno || "Třídní fond").replace(/["<>\r\n]/g, "");
  var req;
  if (nast.poskytovatel === "brevo") {
    var telo = { sender: { name: jmeno, email: nast.odesilatel }, to: [{ email: komu }], subject: predmet, textContent: text || " " };
    if (html) telo.htmlContent = html;
    req = { url: "https://api.brevo.com/v3/smtp/email", headers: { "api-key": klic, accept: "application/json" }, body: telo };
  } else if (nast.poskytovatel === "resend") {
    var t2 = { from: '"' + jmeno + '" <' + nast.odesilatel + ">", to: [komu], subject: predmet, text: text || " " };
    if (html) t2.html = html;
    req = { url: "https://api.resend.com/emails", headers: { Authorization: "Bearer " + klic }, body: t2 };
  } else {
    throw new Error("Neznámý poskytovatel e-mailů.");
  }
  var odp = UrlFetchApp.fetch(req.url, { method: "post", contentType: "application/json", headers: req.headers, payload: JSON.stringify(req.body), muteHttpExceptions: true });
  var kod = odp.getResponseCode();
  if (kod < 200 || kod >= 300) {
    var obsah = String(odp.getContentText() || "").replace(/\s+/g, " ").substring(0, 160);
    throw new Error("služba odmítla e-mail (HTTP " + kod + ")" + (obsah ? ": " + obsah : ""));
  }
}

// Pošle systémový e-mail: přes nastavenou službu, a když selže, přes Gmail. Vrací { pres, zaloha }.
function posliSystemovyEmail_(komu, predmet, text, html) {
  var nast = nactiMailNastaveni_(false);
  if (nast.poskytovatel !== "gmail") {
    try {
      posliPresPoskytovatele_(nast, komu, predmet, text, html);
      return { pres: nast.poskytovatel, zaloha: false };
    } catch (e) {
      zalogujChybuMailu_(MAIL_POSKYTOVATELE[nast.poskytovatel] + ": " + e.message + " – e-mail šel záložně přes Gmail");
    }
  }
  try {
    var o = {};
    if (html) o.htmlBody = html;
    posliGmail_(komu, predmet, text, o, "Třídní fond");
  } catch (e2) {
    zalogujChybuMailu_("Gmail: " + e2.message);
    throw e2;
  }
  return { pres: "gmail", zaloha: nast.poskytovatel !== "gmail" };
}

function api_mailStav_() {
  var n = nactiMailNastaveni_(true);
  return {
    poskytovatel: n.poskytovatel, odesilatel: n.odesilatel, jmeno: n.jmeno, klicNastaven: n.klicNastaven,
    pouzivaSe: nactiMailNastaveni_(false).poskytovatel,
    poskytovatele: Object.keys(MAIL_POSKYTOVATELE).map(function(k) { return { id: k, nazev: MAIL_POSKYTOVATELE[k] }; }),
    gmailZbyva: zbyvaGmailKvota_(),
    posledniChyba: nactiPosledniChybuMailu_(),
    limity: { kodyZaHodinu: KOD_MAX_ZA_HODINU, kodyCelkem: KOD_MAX_CELKEM, rezervaKvoty: MAIL_REZERVA_KVOTY },
    odesilatelGmail: mailboxCtena_()
  };
}

// a.poskytovatel, a.odesilatel, a.jmeno, a.klic (nový klíč; prázdné = ponechat), a.smazatKlic
function api_mailUlozit_(a) {
  var props = PropertiesService.getScriptProperties();
  var posk = String(a.poskytovatel || "gmail");
  if (!MAIL_POSKYTOVATELE.hasOwnProperty(posk)) throw new Error("Neznámý poskytovatel e-mailů.");
  var odesilatel = normEmail_(a.odesilatel), jmeno = cistyText_(a.jmeno, 60);
  var klic = String(a.klic == null ? "" : a.klic).trim();
  if (a.smazatKlic) props.deleteProperty("MAIL_KLIC");
  if (klic) {
    if (klic.length < 10 || klic.length > 300 || /\s/.test(klic)) throw new Error("API klíč vypadá neplatně (má být jedno slovo bez mezer, aspoň 10 znaků).");
    props.setProperty("MAIL_KLIC", klic);
  }
  if (posk !== "gmail") {
    if (!props.getProperty("MAIL_KLIC")) throw new Error("Vložte API klíč služby " + MAIL_POSKYTOVATELE[posk] + ".");
    if (!platnyEmail_(odesilatel)) throw new Error("Zadejte e-mail odesílatele, který máte ve službě " + MAIL_POSKYTOVATELE[posk] + " ověřený.");
  }
  props.setProperty("MAIL_NASTAVENI", JSON.stringify({ poskytovatel: posk, odesilatel: odesilatel, jmeno: jmeno }));
  return api_mailStav_();
}

function api_mailTest_(a, uziv) {
  var komu = normEmail_(uziv && uziv.email);
  if (!platnyEmail_(komu)) throw new Error("Váš účet nemá e-mail, na který by šlo zkušební zprávu poslat.");
  var cache = CacheService.getScriptCache();
  if (cache.get("MAILTEST_" + komu)) throw new Error("Zkušební e-mail jste právě odeslali. Chvíli počkejte.");
  cache.put("MAILTEST_" + komu, "1", 20);
  var r = posliSystemovyEmail_(komu, "Třídní fond – zkušební e-mail",
    "Tohle je zkušební e-mail z aplikace Třídní fond. Pokud ho čtete, odesílání funguje.",
    "<p>Tohle je zkušební e-mail z aplikace <b>Třídní fond</b>. Pokud ho čtete, odesílání funguje.</p>");
  return { komu: komu, pres: r.pres, zaloha: r.zaloha, posledniChyba: nactiPosledniChybuMailu_() };
}

// ---------- GMAIL: JMÉNO ODESÍLATELE, ODPOVĚDI, ALIAS ----------
// Z jaké schránky e-maily odcházejí, určuje Google: je to účet, pod kterým je aplikace nasazená (jiný se v aplikaci
// vybrat nedá). V aplikaci jde nastavit jen jméno odesílatele, adresu pro odpovědi a – pokud je v Gmailu toho účtu
// nastavené „Odesílat jako“ – alias.
function nactiOdesilani_() {
  var raw = PropertiesService.getScriptProperties().getProperty("ODESILANI_NASTAVENI"), p = {};
  if (raw) { try { p = JSON.parse(raw) || {}; } catch (e) { p = {}; } }
  return {
    jmeno: cistyText_(p.jmeno, 60),
    odpovedi: p.odpovedi && jeEmail_(p.odpovedi) ? String(p.odpovedi).toLowerCase() : "",
    alias: p.alias && jeEmail_(p.alias) ? String(p.alias).toLowerCase() : ""
  };
}

function aliasyGmailu_() {
  try { return (GmailApp.getAliases() || []).map(function(x) { return String(x).toLowerCase(); }); } catch (e) { return []; }
}

// Jediné místo, odkud aplikace posílá přes Gmail (QR platby, připomínky, kódy, pozvánky).
function posliGmail_(komu, predmet, text, o, vychoziJmeno) {
  var n = nactiOdesilani_();
  o = o || {};
  var jm = n.jmeno || vychoziJmeno;
  if (jm) o.name = jm;
  if (n.odpovedi) o.replyTo = n.odpovedi;
  var alias = n.alias && aliasyGmailu_().indexOf(n.alias) !== -1 ? n.alias : "";
  if (n.alias && !alias) zalogujChybuMailu_("Adresa " + n.alias + " už není v Gmailu nastavená jako „Odesílat jako“, e-mail šel z hlavní adresy.");
  if (alias) o.from = alias;
  try {
    GmailApp.sendEmail(komu, predmet, text || "", o);
  } catch (e) {
    if (!alias) throw e;
    zalogujChybuMailu_("Odesílání z aliasu " + alias + " selhalo, e-mail šel z hlavní adresy: " + e.message);
    delete o.from;
    GmailApp.sendEmail(komu, predmet, text || "", o);
  }
}

// ---------- ŠKOLA: NÁZEV, WEB / SYMBOL, VZHLED ----------
var ZAKAZANE_KONCOVKY_WEBU = /\.(local|localhost|internal|lan|corp|home|intranet|test|invalid|example)$/;

// Vstup: „jaroska.cz“, „https://www.jaroska.cz/uvod“, „600012345“ (RED-IZO / IZO / IČO) nebo kombinace.
function rozborSkolaId_(txt) {
  var out = { web: "", symbol: "" };
  String(txt == null ? "" : txt).trim().toLowerCase().split(/[\s,;]+/).filter(Boolean).forEach(function(t) {
    if (/^(red-?izo|izo|ičo|ico|redizo)[:=]?$/.test(t)) return;
    var cisty = t.replace(/^(red-?izo|izo|ičo|ico)[:=]/, "");
    if (/^[0-9]{6,10}$/.test(cisty)) { out.symbol = cisty; return; }
    var h = t.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/[\/?#].*$/, "").replace(/:[0-9]+$/, "");
    if (/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(h) && h.length <= 80 && !ZAKAZANE_KONCOVKY_WEBU.test(h)) { out.web = h; return; }
    throw new Error("„" + t + "“ není web (např. jaroska.cz) ani symbol školy (RED-IZO, IZO nebo IČO – 6 až 10 číslic).");
  });
  return out;
}

function nactiSkolaId_() {
  var props = PropertiesService.getScriptProperties(), v = { barva: "", logo: "", nazevWeb: "" };
  try { v = JSON.parse(props.getProperty("SKOLA_VZHLED") || "{}") || v; } catch (e) {}
  return { web: props.getProperty("SKOLA_WEB") || "", symbol: props.getProperty("SKOLA_SYMBOL") || "",
           vzhled: { barva: v.barva || "", logo: v.logo || "", nazevWeb: v.nazevWeb || "", nacteno: v.nacteno || "" } };
}

function ulozSkolaId_(id) {
  var props = PropertiesService.getScriptProperties();
  if (id.web) props.setProperty("SKOLA_WEB", id.web); else props.deleteProperty("SKOLA_WEB");
  if (id.symbol) props.setProperty("SKOLA_SYMBOL", id.symbol); else props.deleteProperty("SKOLA_SYMBOL");
}

function parsujAtributyZnacky_(tag) {
  var o = {}, re = /([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, m;
  while ((m = re.exec(tag))) o[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
  return o;
}

// Barva z webu smí být jen tmavší (aby byl na tlačítkách čitelný bílý text); #rgb i #rrggbb.
function bezpecnaBarva_(c) {
  c = String(c == null ? "" : c).trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(c)) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  if (!/^#[0-9a-f]{6}$/.test(c)) return "";
  function lin(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  var l = 0.2126 * lin(parseInt(c.substr(1, 2), 16)) + 0.7152 * lin(parseInt(c.substr(3, 2), 16)) + 0.0722 * lin(parseInt(c.substr(5, 2), 16));
  return l > 0.3 ? "" : c;
}

function bezpecnaUrlObrazku_(u, host) {
  u = String(u == null ? "" : u).trim();
  if (!u || u.length > 300 || /[\s"'<>\\]/.test(u)) return "";
  if (u.indexOf("//") === 0) u = "https:" + u;
  else if (u.charAt(0) === "/") u = "https://" + host + u;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + host + "/" + u;
  return /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:[0-9]+)?(\/|$)/i.test(u) ? u : "";
}

// Best effort: z titulní stránky školy přečte barvu (theme-color), logo/ikonu a název. Když web nic takového
// nenabízí, vzhled zůstane výchozí. Nevyhodí chybu kvůli neúplným datům – jen kvůli nedostupnému webu.
function nactiVzhledZeWebu_(host) {
  var out = { barva: "", logo: "", nazevWeb: "" };
  var odp = UrlFetchApp.fetch("https://" + host + "/", { muteHttpExceptions: true, followRedirects: true });
  var kod = odp.getResponseCode();
  if (kod < 200 || kod >= 300) throw new Error("Web " + host + " odpověděl chybou " + kod + ".");
  var html = String(odp.getContentText() || "").substring(0, 300000);
  var og = "", ikona = "", apple = "";
  (html.match(/<meta\b[^>]*>/gi) || []).forEach(function(t) {
    var a = parsujAtributyZnacky_(t), n = String(a.name || a.property || "").toLowerCase(), c = a.content || "";
    if (n === "theme-color" && !out.barva) out.barva = bezpecnaBarva_(c);
    else if (n === "og:site_name" && !out.nazevWeb) out.nazevWeb = cistyText_(c, 80);
    else if (n === "og:image" && !og) og = c;
  });
  (html.match(/<link\b[^>]*>/gi) || []).forEach(function(t) {
    var a = parsujAtributyZnacky_(t), rel = String(a.rel || "").toLowerCase();
    if (rel.indexOf("apple-touch-icon") !== -1) { if (!apple) apple = a.href || ""; }
    else if (/(^|\s)icon(\s|$)/.test(rel) && !ikona) ikona = a.href || "";
  });
  out.logo = bezpecnaUrlObrazku_(apple || ikona || og, host);
  if (!out.nazevWeb) { var m = html.match(/<title[^>]*>([^<]*)<\/title>/i); if (m) out.nazevWeb = cistyText_(m[1], 80); }
  return out;
}

function obnovVzhledSkoly_() {
  var id = nactiSkolaId_(), props = PropertiesService.getScriptProperties();
  if (!id.web) { props.deleteProperty("SKOLA_VZHLED"); return { ok: false, chyba: "Škola nemá zadaný web." }; }
  try {
    var v = nactiVzhledZeWebu_(id.web);
    v.nacteno = new Date().toISOString();
    props.setProperty("SKOLA_VZHLED", JSON.stringify(v));
    return { ok: true, barva: v.barva, logo: v.logo };
  } catch (e) {
    return { ok: false, chyba: String(e.message || e) };
  }
}

// První správce nové školy: tabulka se „zařídí“ pro školu (pojmenování, listy historie).
function pripravTabulkuSkoly_(nazevSkoly) {
  try {
    var ss = getSS_();
    if (nazevSkoly) { try { ss.rename("Třídní fond – " + nazevSkoly); } catch (e1) {} }
    try { getListHistorie_(ss); } catch (e2) {}
    try { getListOdeslane_(ss); } catch (e3) {}
  } catch (e) { /* tabulka není dostupná – nevadí, vznikne při prvním použití */ }
}

function infoOSkole_() {
  var id = nactiSkolaId_();
  return { skola: nactiSkolu_(), web: id.web, symbol: id.symbol, vzhled: id.vzhled };
}

function api_skolaUlozit_(a) {
  var nazev = cistyText_(a.nazev, 80);
  if (nazev.length < 2) throw new Error("Zadejte název školy (aspoň 2 znaky).");
  var id = rozborSkolaId_(a.id);
  var puv = nactiSkolaId_();
  ulozSkolu_(nazev);
  ulozSkolaId_(id);
  var vzhled = null;
  if (id.web && (a.obnovitVzhled || id.web !== puv.web)) vzhled = obnovVzhledSkoly_();
  if (!id.web) PropertiesService.getScriptProperties().deleteProperty("SKOLA_VZHLED");
  var r = infoOSkole_();
  r.vzhledVysledek = vzhled;
  return r;
}

// ---------- POZVÁNKY ----------
var POZVANKA_MAX = 20;

function adresyZTextu_(txt) {
  var dobre = [], spatne = [];
  String(txt == null ? "" : txt).toLowerCase().split(/[\s,;]+/).filter(Boolean).forEach(function(x) {
    if (platnyEmail_(x)) { if (dobre.indexOf(x) === -1) dobre.push(x); }
    else if (spatne.indexOf(x) === -1) spatne.push(x);
  });
  return { dobre: dobre, spatne: spatne };
}

function adresaAplikace_() {
  try { return ScriptApp.getService().getUrl() || ""; } catch (e) { return ""; }
}

function textPozvanky_(pozval, roleNazev, email, zprava) {
  var skola = nactiSkolu_(), url = adresaAplikace_();
  var predmet = "Pozvánka do aplikace Třídní fond" + (skola ? " – " + skola : "");
  var text = "Dobrý den,\n\n" + pozval + " vás zve do aplikace Třídní fond" + (skola ? " (" + skola + ")" : "") + " v roli: " + roleNazev + ".\n\n" +
    (zprava ? zprava + "\n\n" : "") +
    "Jak se přihlásit:\n1. Otevřete aplikaci: " + (url || "(adresu vám sdělí školní admin)") + "\n" +
    "2. V záložce Přihlášení zadejte tuto adresu: " + email + "\n" +
    "3. Na ni vám přijde šestimístný kód – opište ho do aplikace.\n\n" +
    "Registrovat se nemusíte, účet už pro vás je připravený. Přihlásit se půjde jen z této e-mailové adresy. Pokud pozvánku nečekáte, ignorujte ji.";
  var html = "<p>Dobrý den,</p><p><b>" + escHtml_(pozval) + "</b> vás zve do aplikace <b>Třídní fond</b>" + (skola ? " (" + escHtml_(skola) + ")" : "") +
    " v roli: <b>" + escHtml_(roleNazev) + "</b>.</p>" + (zprava ? "<p>" + escHtml_(zprava) + "</p>" : "") +
    "<p><b>Jak se přihlásit</b></p><ol><li>Otevřete aplikaci: " + (url ? "<a href='" + escHtml_(url) + "'>" + escHtml_(url) + "</a>" : "(adresu vám sdělí školní admin)") + "</li>" +
    "<li>V záložce <i>Přihlášení</i> zadejte tuto adresu: <b>" + escHtml_(email) + "</b></li>" +
    "<li>Na ni vám přijde šestimístný kód – opište ho do aplikace.</li></ol>" +
    "<p>Registrovat se nemusíte, účet už pro vás je připravený. Přihlásit se půjde jen z této e-mailové adresy. Pokud pozvánku nečekáte, ignorujte ji.</p>";
  return { predmet: predmet, text: text, html: html };
}

// Krok 1: náhled. Nic se neodešle ani nevytvoří.
function api_pozvatNahled_(a, uziv) {
  var role = normRole_(a.role) === "skolni_admin" ? "skolni_admin" : "ucitel";
  var r = adresyZTextu_(a.emaily);
  if (!r.dobre.length && !r.spatne.length) throw new Error("Napište e-mailové adresy (více jich oddělte mezerou, čárkou nebo novým řádkem).");
  if (r.spatne.length) throw new Error("Tohle nevypadá jako e-mail: " + r.spatne.slice(0, 3).join(", ") + ". Opravte to – nic se neodeslalo.");
  if (r.dobre.length > POZVANKA_MAX) throw new Error("Najednou jde pozvat nejvíc " + POZVANKA_MAX + " lidí.");
  var zprava = cistyText_(a.zprava, 300);
  var radky = r.dobre.map(function(e) {
    var u = nactiUzivatele_(e), duvod = "";
    if (jeVlastnikEmail_(e)) duvod = "adresa vlastníka aplikace (má vlastní účet)";
    else if (u && u.stav === "ceka") duvod = "už se zaregistroval(a) a čeká na schválení – schvalte ho v seznamu účtů";
    else if (u && u.stav === "zablokovan") duvod = "účet existuje, ale je zablokovaný";
    else if (u) duvod = "už má účet (" + ROLE_DEF[u.role].nazev + ")";
    return { email: e, pozvat: !duvod, duvod: duvod };
  });
  var pozvat = radky.filter(function(x) { return x.pozvat; }).map(function(x) { return x.email; });
  if (!pozvat.length) throw new Error("Nikoho nezbývá k pozvání – všichni už účet mají.");
  var token = vydejPotvrzeni_("pozvanka", { role: role, emaily: pozvat, zprava: zprava }, uziv);
  var uk = textPozvanky_(uziv.zobrazit || uziv.jmeno, ROLE_DEF[role].nazev, pozvat[0], zprava);
  var nast = nactiMailNastaveni_(false);
  return {
    token: token, role: role, roleNazev: ROLE_DEF[role].nazev, radky: radky, pocet: pozvat.length, vyzadujeHeslo: role === "skolni_admin",
    predmet: uk.predmet, text: uk.text, urlAplikace: adresaAplikace_(),
    odesilaPres: nast.poskytovatel, odesilatel: nast.poskytovatel === "gmail" ? mailboxCtena_() : nast.odesilatel
  };
}

// Krok 2: po potvrzení vytvoří účty a odešle pozvánky. Token jde použít jen jednou.
function api_pozvatOdeslat_(a, uziv) {
  var data = nahlednutiPotvrzeni_(a.token, "pozvanka");
  if (data.role === "skolni_admin") overHesloAkce_(uziv, a.heslo);     // pozvánka za správce = vznik správce → heslo
  spotrebujPotvrzeni_(a.token);
  return sPrihlasovacimZamkem_(function() {
    var out = { pozvano: [], preskoceno: [], selhalo: [], roleNazev: ROLE_DEF[data.role].nazev };
    var vych = nactiVychoziProfil_();
    data.emaily.forEach(function(e) {
      if (nactiUzivatele_(e) || jeVlastnikEmail_(e)) { out.preskoceno.push({ email: e, duvod: "mezitím vznikl účet" }); return; }
      var t = textPozvanky_(uziv.zobrazit || uziv.jmeno, ROLE_DEF[data.role].nazev, e, data.zprava);
      try {
        posliSystemovyEmail_(e, t.predmet, t.text, t.html);
      } catch (err) {
        out.selhalo.push({ email: e, chyba: String(err.message || err) });
        return;
      }
      var now = new Date().toISOString();
      var u = { jmeno: e, email: e, zobrazit: e.split("@")[0], typ: data.role, role: data.role, stav: "aktivni", pozvan: true,
        pozval: uziv.jmeno, vytvoreno: now, overeno: now, schvaleno: now, schvalil: "pozvánka od " + (uziv.zobrazit || uziv.jmeno) };
      if (ROLE_DEF[data.role].profil && vych.iban) u.profil = vych;
      ulozUzivatele_(u);
      out.pozvano.push(e);
    });
    return out;
  });
}

// ---------- SCHRÁNKY A E-MAILY: CO KAM CHODÍ ----------
function stavSchranek_(uziv) {
  var mb = mailboxCtena_(), vych = nactiVychoziProfil_(), nast = nactiMailNastaveni_(false);
  var banka = (vych.emailPlatby || "").toLowerCase();
  var ucty = vsichniUzivatele_().filter(function(u) { return u.profil && ROLE_DEF[u.role] && ROLE_DEF[u.role].profil; }).map(function(u) {
    return { zobrazit: u.zobrazit || u.jmeno, email: u.email || "", role: ROLE_DEF[u.role].nazev, emailOznameni: u.profil.emailOznameni || "", emailPlatby: u.profil.emailPlatby || "" };
  });
  return {
    schranka: mb, aliasy: aliasyGmailu_(), odesilani: nactiOdesilani_(),
    kody: { pres: nast.poskytovatel, odesilatel: nast.poskytovatel === "gmail" ? mb : nast.odesilatel },
    banka: { adresa: banka, shoda: !banka || banka === String(mb).toLowerCase() },
    oznameni: vych.emailOznameni || "",
    prihlasovaci: uziv ? (uziv.email || "") : "",
    jeVlastnik: !!(uziv && uziv.role === "vlastnik"),
    mohuMenitEmail: !!(uziv && uziv.role !== "vlastnik" && uziv.jmeno && uziv.email && normEmail_(uziv.jmeno) === normEmail_(uziv.email)),
    ucty: ucty
  };
}

function api_schrankyStav_(a, uziv) {
  return stavSchranek_(uziv);
}

// a.jmeno (jméno odesílatele), a.odpovedi, a.alias, a.banka (kam chodí oznámení banky), a.oznameni (kam „vše zaplaceno“)
function api_schrankyUlozit_(a, uziv) {
  var n = { jmeno: cistyText_(a.jmeno, 60), odpovedi: normEmail_(a.odpovedi), alias: normEmail_(a.alias) };
  if (n.odpovedi && !platnyEmail_(n.odpovedi)) throw new Error("Adresa pro odpovědi není platný e-mail.");
  if (n.alias) {
    if (!platnyEmail_(n.alias)) throw new Error("Adresa, ze které se mají e-maily odesílat, není platný e-mail.");
    if (n.alias !== normEmail_(mailboxCtena_()) && aliasyGmailu_().indexOf(n.alias) === -1) {
      throw new Error("Adresa " + n.alias + " není v Gmailu účtu " + mailboxCtena_() + " nastavená jako „Odesílat jako“. V Gmailu: Nastavení → Účty a import → Odesílat poštu jako. Pak ji tu půjde zvolit.");
    }
    if (n.alias === normEmail_(mailboxCtena_())) n.alias = "";
  }
  var banka = normEmail_(a.banka), oznameni = normEmail_(a.oznameni);
  if (banka && !platnyEmail_(banka)) throw new Error("Adresa, na kterou banka posílá oznámení, není platný e-mail.");
  if (oznameni && !platnyEmail_(oznameni)) throw new Error("Adresa pro oznámení „vše zaplaceno“ není platný e-mail.");
  var vych = nactiVychoziProfil_();
  vych.emailPlatby = banka || mailboxCtena_() || "";
  vych.emailOznameni = oznameni || (uziv && uziv.email) || vych.emailOznameni;
  PropertiesService.getScriptProperties().setProperty("ODESILANI_NASTAVENI", JSON.stringify(n));
  ulozVychoziProfil_(vych);
  return stavSchranek_(uziv);
}

// ---------- ZMĚNA PŘIHLAŠOVACÍHO E-MAILU (kódem na novou adresu) ----------
function klicZmenyEmailu_(jmeno) { return "EMAILZMENA_" + sha256Hex_("zm:" + jmeno).substring(0, 30); }

function api_emailZmenaPoslat_(a, uziv) {
  var u = nactiUzivatele_(uziv.jmeno);
  if (!u) throw new Error("Účet nenalezen.");
  if (u.role === "vlastnik") throw new Error("Přihlašovací e-mail vlastníka je pevně daný a nejde změnit.");
  if (normEmail_(u.jmeno) !== normEmail_(u.email)) throw new Error("Tohle je starý účet s přihlašovacím jménem; e-mail jde změnit jen u účtů přihlašovaných e-mailem.");
  var novy = normEmail_(a.novy);
  if (!platnyEmail_(novy)) throw new Error("Zadejte platnou e-mailovou adresu.");
  if (novy === normEmail_(u.email)) throw new Error("To je už váš přihlašovací e-mail.");
  if (jeVlastnikEmail_(novy)) throw new Error("Tato adresa je vyhrazená vlastníkovi aplikace.");
  if (nactiUzivatele_(novy)) throw new Error("Tuto adresu už používá jiný účet.");
  posliKod_(novy, "zmena-emailu");
  CacheService.getScriptCache().put(klicZmenyEmailu_(u.jmeno), novy, KOD_PLATNOST_S);
  return { odeslano: true, novy: novy };
}

function api_emailZmenaPotvrdit_(a, uziv) {
  var cache = CacheService.getScriptCache();
  var novy = cache.get(klicZmenyEmailu_(uziv.jmeno));
  if (!novy) throw new Error("Změna e-mailu vypršela. Začněte znovu.");
  overKod_(novy, a.kod, "zmena-emailu");
  return sPrihlasovacimZamkem_(function() {
    var u = nactiUzivatele_(uziv.jmeno);
    if (!u || u.role === "vlastnik") throw new Error("Účet nenalezen.");
    if (nactiUzivatele_(novy)) throw new Error("Tuto adresu mezitím začal používat jiný účet.");
    var puvodni = u.jmeno, staryEmail = normEmail_(u.email);
    var n = {};
    Object.keys(u).forEach(function(k) { n[k] = u[k]; });
    n.jmeno = novy; n.email = novy; n.overeno = new Date().toISOString();
    if (n.profil && normEmail_(n.profil.emailOznameni) === staryEmail) n.profil.emailOznameni = novy;
    ulozUzivatele_(n);
    PropertiesService.getScriptProperties().deleteProperty(klicUzivatele_(puvodni));
    zrusRelaceUzivatele_(puvodni, "");
    cache.remove(klicZmenyEmailu_(puvodni));
    return { email: novy, token: vytvorRelaci_(novy), puvodni: puvodni };
  });
}

// ---------- INFORMACE, MOJE PLATBY, DIAGNOSTIKA ----------
function api_informace_(a, uziv) {
  var info = infoORolich_();
  return {
    role: info.role, prava: info.prava,
    moje: { role: uziv.role, roleNazev: ROLE_DEF[uziv.role].nazev, prava: pravaRole_(uziv.role) },
    skola: nactiSkolu_(), verze: VERZE_APLIKACE, vlastnikPovolen: !!VLASTNIK_EMAIL
  };
}

// Platby žáka (žáků), u kterých je e-mail přihlášeného rodiče / žáka. Nic jiného z tabulky se nevrací.
function api_moje_(a, uziv) {
  var email = normEmail_(uziv.email);
  var out = { polozky: [], zaci: [] };
  if (!email) return out;
  var videniZaci = {};
  seznamVsechTrid_().forEach(function(t) {        // i archivované třídy: rodič vidí, co za proběhlé sbírky platil (QR už se nenabízí)
    var n = vsechnySbirkyData_(t.list);
    if (!n.rozsah) return;
    var maDite = false;                           // třída, kde jeho e-mail u žádného žáka není, se dál nerozebírá
    for (var i = 0; i < n.data.length && !maDite; i++) {
      maDite = jeZakRadek_(n.data[i]) && (emailyBunky_(n.data[i][2]).indexOf(email) !== -1 || emailyBunky_(n.data[i][SLOUPEC_RODICE - 1]).indexOf(email) !== -1);
    }
    if (!maDite) return;
    n.sbirky.forEach(function(sb) {
      var an = analyzujSbirku_(n, sb, null);
      an.studenti.forEach(function(z) {
        var radekZaka = n.data[z.radek - n.rozsah.startRow] || [];
        if (emailyBunky_(z.email).indexOf(email) === -1 && emailyBunky_(radekZaka[SLOUPEC_RODICE - 1]).indexOf(email) === -1) return;
        var klicZaka = t.id + ":" + z.radek;
        if (!videniZaci[klicZaka]) { videniZaci[klicZaka] = true; out.zaci.push({ jmeno: (z.jmeno + " " + z.prijmeni).trim(), trida: t.nazev }); }
        if (z.stav === "nic") return;
        var zbyva = Math.max(0, round2_(z.ocekavano - z.zaplaceno));
        var prof = profilSbirky_(sb.specSymbol);
        var polozka = {
          sbirka: sb.nazev, trida: t.nazev, archiv: !!t.archiv, zak: (z.jmeno + " " + z.prijmeni).trim(), stav: z.stav,
          ocekavano: z.ocekavano, zaplaceno: z.zaplaceno, zbyva: zbyva, vs: z.vs, ss: sb.specSymbol,
          ucet: prof.iban ? (ibanNaCisloUctu_(prof.iban) || formatujIban_(prof.iban)) : "", nazevUctu: prof.nazevUctu || "",
          vytvoreno: /^[0-9]{10}$/.test(sb.specSymbol) ? new Date(parseInt(sb.specSymbol, 10) * 1000).toISOString() : "",
          qr: ""
        };
        if (!t.archiv && zbyva > 0 && prof.iban && z.vs) {
          try { polozka.qr = qrDataUri_(sestavSpayd_(zbyva, z.vs, sb.specSymbol, sb.nazev)); } catch (e) { polozka.qr = ""; }
        }
        out.polozky.push(polozka);
      });
    });
  });
  out.polozky.sort(function(x, y) { return String(y.vytvoreno).localeCompare(String(x.vytvoreno)); });
  return out;
}

function api_diagnostika_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var pocty = {};
  Object.keys(props).forEach(function(k) {
    var m = k.match(/^([A-Z]+)_/);
    var pref = m ? m[1] : "ostatni";
    pocty[pref] = (pocty[pref] || 0) + 1;
  });
  var ucty = vsichniUzivatele_();
  var trig = 0;
  try { trig = ScriptApp.getProjectTriggers().length; } catch (e) {}
  return {
    verze: VERZE_APLIKACE, skola: nactiSkolu_(), mailbox: mailboxCtena_(),
    ucty: { celkem: ucty.length, cekajici: pocetCekajicichUctu_(), skolniAdmini: poctuAdminu_() },
    vlastenky: pocty, spoustece: trig, tabulka: props.TABULKA_ID ? "zapamatována" : "nezapamatována",
    mail: { nastaveni: nactiMailNastaveni_(true).poskytovatel, gmailZbyva: zbyvaGmailKvota_(), posledniChyba: nactiPosledniChybuMailu_() },
    tridy: (function() { try { return seznamTrid_().length; } catch (e) { return -1; } })(),
    tridyVArchivu: (function() { try { return nactiArchivTrid_().length; } catch (e) { return -1; } })()
  };
}

// Vlastník se z aplikace odebrat nedá (ani z menu tabulky). Jeho role zanikne jedině tím, že se v kódu
// (webapp.gs) nastaví VLASTNIK_EMAIL = "" – pak se jeho účet ignoruje a nemá žádný přístup.

// ---------- POMOCNÉ ----------
// Třída podle ID listu (bez ID = první třída). Vrací { id, nazev, list }.
function tridaNebo_(tridaId) {
  var tridy = seznamTrid_();
  if (!tridy.length) throw new Error("Zatím není žádná třída. Založte ji v sekci Žáci a třídy.");
  if (tridaId === undefined || tridaId === null || tridaId === "") return tridy[0];
  var id = Number(tridaId);
  for (var i = 0; i < tridy.length; i++) if (tridy[i].id === id) return tridy[i];
  var arch = najdiTriduVcetneArchivu_(id);
  if (arch && arch.archiv) throw new Error("Třída „" + arch.nazev + "“ je v archivu (jen pro čtení). Chcete-li v ní pracovat, nejdřív ji obnovte v sekci Žáci a třídy.");
  throw new Error("Třída nenalezena (list mohl být v tabulce smazán). Obnovte stránku.");
}

// Totéž pro čtení: najde i třídu v archivu (nic z ní se tím nemění).
function tridaProCteni_(tridaId) {
  var tridy = seznamVsechTrid_();
  if (!tridy.length) throw new Error("Zatím není žádná třída. Založte ji v sekci Žáci a třídy.");
  if (tridaId === undefined || tridaId === null || tridaId === "") return tridy.filter(function(t) { return !t.archiv; })[0] || tridy[0];
  var id = Number(tridaId);
  for (var i = 0; i < tridy.length; i++) if (tridy[i].id === id) return tridy[i];
  throw new Error("Třída nenalezena (list mohl být v tabulce smazán). Obnovte stránku.");
}

// Načte celou třídu JEDNÍM čtením listu (dřív ~6 samostatných volání Tabulek, každé stovky ms) a rozebere ji.
function vsechnySbirkyData_(sheet) {
  return rozborListu_(nactiHodnotyListu_(sheet));
}

// Sbírky z hodnot listu (SS v řádku 6, název v řádku 7, od sloupce G).
function sbirkyZHodnot_(vals) {
  var lastRow = vals.length, lastCol = lastRow ? vals[0].length : 0, sbirky = [];
  if (lastCol >= 7 && lastRow >= 7) {
    for (var c = 6; c < lastCol; c++) {
      var ss = String(vals[5][c] == null ? "" : vals[5][c]).trim();
      var nazev = String(vals[6][c] == null ? "" : vals[6][c]).trim();
      if (/^[0-9]{6,10}$/.test(ss) && nazev !== "") sbirky.push({ colIndex: c + 1, specSymbol: ss, nazev: nazev });
    }
  }
  return sbirky;
}

// Z hodnot listu (řádek 1 = vals[0]) určí rozsah žáků, sbírky (SS v řádku 6, název v řádku 7 od sloupce G) a data žáků.
// Výsledek je shodný s dřívější trojicí nactiRozsahStudentu_ + najdiSbirky_ + getRange().
function rozborListu_(vals) {
  var START = 9;
  var lastRow = vals.length, lastCol = lastRow ? vals[0].length : 0;
  var rozsah = null;
  if (lastRow >= START) {
    var last = 0;
    for (var i = lastRow - 1; i >= START - 1; i--) {
      var r = vals[i];
      if (String(r[1] == null ? "" : r[1]).trim() !== "" || String(r[2] == null ? "" : r[2]).trim() !== "" || String(r[3] == null ? "" : r[3]).trim() !== "") {
        last = i + 1;
        break;
      }
    }
    if (last) rozsah = { startRow: START, lastRow: last, numRows: last - START + 1 };
  }
  var sbirky = sbirkyZHodnot_(vals);
  var out = { rozsah: rozsah, sbirky: sbirky, data: [], pocetZaku: 0 };
  if (!rozsah) return out;
  var sirka = Math.max(lastCol, 5);
  for (var j = 0; j < rozsah.numRows; j++) {
    var radek = vals[START - 1 + j].slice(0, sirka);
    while (radek.length < sirka) radek.push("");
    out.data.push(radek);
    if (jeZakRadek_(radek)) out.pocetZaku++;
  }
  return out;
}

// Žáci třídy z už načtených dat (bez dalšího čtení listu).
function zakyZData_(n) {
  var out = [];
  if (!n.rozsah) return out;
  for (var i = 0; i < n.data.length; i++) {
    var d = n.data[i];
    if (!jeZakRadek_(d)) continue;
    out.push({
      radek: n.rozsah.startRow + i,
      prijmeni: String(d[0] == null ? "" : d[0]).trim(),
      jmeno: String(d[1] == null ? "" : d[1]).trim(),
      email: String(d[2] == null ? "" : d[2]).trim(),
      emailRodice: String(d[SLOUPEC_RODICE - 1] == null ? "" : d[SLOUPEC_RODICE - 1]).trim(),
      vs: String(d[3] == null ? "" : d[3]).replace(/\s+/g, ""),
      vychozi: parseCastka_(d[4])
    });
  }
  return out;
}

function txt_(v) {
  return String(v == null ? "" : v).trim();
}

function najdiSbirkuPodleSloupce_(sheet, colIndex) {
  var sbirky = najdiSbirky_(sheet);
  for (var i = 0; i < sbirky.length; i++) if (sbirky[i].colIndex === colIndex) return sbirky[i];
  throw new Error("Sbírka ve sloupci " + getColLetter_(colIndex) + " nenalezena (chybí SS nebo název).");
}

// Ověří, že na řádku je pořád ten žák, kterého uživatel viděl (tabulku mohl mezitím někdo upravit).
function overShoduZaka_(a, radekData) {
  if (a.prijmeni === undefined && a.jmeno === undefined) return;
  if (normJmeno_(a.prijmeni) !== normJmeno_(radekData[0]) || normJmeno_(a.jmeno) !== normJmeno_(radekData[1])) {
    throw new Error("Tabulka se mezitím změnila (na tom řádku je teď jiný žák). Obnovte stránku.");
  }
}

// Stavy žáků + souhrn jedné sbírky z toho, co je teď v buňkách tabulky.
function analyzujSbirku_(nactene, sbirka, odeslano) {
  var studenti = [];
  var pocty = { zaplaceno: 0, preplatek: 0, castecne: 0, nezaplaceno: 0, rucne: 0, nic: 0 };
  var souhrn = { ocekavano: 0, vybrano: 0, pocetOcekavano: 0, pocetZaplaceno: 0, upravenoRucne: 0, vse: false };
  // emaily.odeslano = žáci, kterým QR e-mail už odešel; neodeslano = žáci, kteří mají QR dostat, ale ještě nedostali;
  // bez = nezaplacení žáci, kterým e-mail poslat nejde (chybí e-mail nebo VS)
  var emaily = { odeslano: 0, neodeslano: 0, bez: 0, pripominky: 0 };
  var rozsah = nactene.rozsah;
  if (!rozsah) return { studenti: studenti, pocty: pocty, souhrn: souhrn, emaily: emaily };

  for (var i = 0; i < nactene.data.length; i++) {
    var r = nactene.data[i];
    if (!jeZakRadek_(r)) continue;
    var val = r[sbirka.colIndex - 1];
    var b = rozborBunky_(val, r[4]);
    var ocek = b.ocekavano;
    if (b.stav === "rucne") ocek = getExpectedAmount_("", r[4]);   // starší ruční text v buňce: částka ze sloupce E
    pocty[b.stav] = (pocty[b.stav] || 0) + 1;

    if (b.stav !== "nic" && ocek > 0) {
      souhrn.pocetOcekavano++;
      souhrn.ocekavano += ocek;
      souhrn.vybrano += b.zaplaceno;
      if (b.stav === "zaplaceno" || b.stav === "preplatek") souhrn.pocetZaplaceno++;
      if (b.upravenoRucne) souhrn.upravenoRucne++;
    }
    var student = {
      radek: rozsah.startRow + i,
      prijmeni: txt_(r[0]), jmeno: txt_(r[1]), email: txt_(r[2]), vs: txt_(r[3]).replace(/\s+/g, ""),
      stav: b.stav, ocekavano: round2_(ocek), zaplaceno: round2_(b.zaplaceno), text: b.text,
      upravenoRucne: b.upravenoRucne, rucniPlatby: [], maRodice: emailyBunky_(r[SLOUPEC_RODICE - 1]).length > 0
    };
    // Odeslané e-maily (QR platba a připomínky)
    var vsKlic = normVs_(student.vs);
    var poslano = odeslano && vsKlic ? odeslano[vsKlic] : null;
    var qr = poslano && poslano.qr, pr = poslano && poslano.pripominka;
    student.qrPocet = qr ? qr.pocet : 0;
    student.qrPosledni = qr && qr.posledni ? new Date(qr.posledni).toISOString() : "";
    student.pripPocet = pr ? pr.pocet : 0;
    student.pripPosledni = pr && pr.posledni ? new Date(pr.posledni).toISOString() : "";
    var mozeDostat = (emailyBunky_(student.email).length > 0 || student.maRodice) && vsKlic !== "";
    var chceQr = b.stav === "nezaplaceno";
    if (qr) student.emailStav = "odeslano";
    else if (chceQr && mozeDostat) student.emailStav = "neodeslano";
    else if ((b.stav === "nezaplaceno" || b.stav === "castecne") && !mozeDostat) student.emailStav = "bez";
    else student.emailStav = "";
    if (student.emailStav === "odeslano") emaily.odeslano++;
    else if (student.emailStav === "neodeslano") emaily.neodeslano++;
    else if (student.emailStav === "bez") emaily.bez++;
    if (student.pripPocet > 0) emaily.pripominky++;
    studenti.push(student);
  }
  souhrn.ocekavano = round2_(souhrn.ocekavano);
  souhrn.vybrano = round2_(souhrn.vybrano);
  souhrn.vse = souhrn.pocetOcekavano > 0 && souhrn.pocetZaplaceno === souhrn.pocetOcekavano;
  return { studenti: studenti, pocty: pocty, souhrn: souhrn, emaily: emaily };
}

function zakladSbirky_(sbirka, props) {
  var ts = /^[0-9]{10}$/.test(sbirka.specSymbol) ? parseInt(sbirka.specSymbol, 10) * 1000 : 0;
  return {
    colIndex: sbirka.colIndex,
    colLetter: getColLetter_(sbirka.colIndex),
    nazev: sbirka.nazev,
    specSymbol: sbirka.specSymbol,
    vytvoreno: ts ? new Date(ts).toISOString() : "",
    zkontrolovano: props["KONTROLA_" + sbirka.specSymbol] || "",
    stitek: getLabelName_(sbirka.nazev, sbirka.specSymbol)
  };
}

function formatDatum_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "d. M. yyyy HH:mm");
}

// Z poznámky ručně zadané platby „Ručně zadáno (david): hotově“ vytáhne, kdo ji zadal a co k ní napsal.
function rozborPoznamkyRucni_(s) {
  var m = String(s || "").match(/^Ručně zadáno(?: \(([^)]*)\))?(?:: ([\s\S]*))?$/);
  return { kdo: m && m[1] ? m[1] : "", pozn: m && m[2] ? m[2] : "" };
}

// SS -> název třídy (aby historie šla filtrovat podle třídy)
function mapaSsNaTridu_() {
  return memo_("mapaSS", mapaSsNaTriduBezMemo_);
}
function mapaSsNaTriduBezMemo_() {
  var mapa = {}, tridy = seznamVsechTrid_();       // i archiv: historie starých sbírek se dál přiřadí ke třídě
  for (var t = 0; t < tridy.length; t++) {
    var sb = najdiSbirky_(tridy[t].list);
    for (var i = 0; i < sb.length; i++) mapa[sb[i].specSymbol] = { id: tridy[t].id, nazev: tridy[t].nazev, archiv: !!tridy[t].archiv };
  }
  return mapa;
}

function nactiHistorii_(specSymbolFiltr, limit) {
  var v = surovaHistorie_(getSS_());          // jedno čtení listu
  if (!v.length) return [];
  var tridaPodleSS = mapaSsNaTridu_();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var r = v[i];
    var ss = txt_(r[2]);
    if (specSymbolFiltr && ss !== String(specSymbolFiltr)) continue;
    var d = r[0];
    var jeDatum = Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d.getTime());
    var id = txt_(r[8]);
    var rucni = jeRucniId_(id);
    var rp = rucni ? rozborPoznamkyRucni_(txt_(r[6])) : { kdo: "", pozn: "" };
    out.push({
      ts: jeDatum ? d.getTime() : 0,
      datum: jeDatum ? formatDatum_(d) : txt_(d),
      sbirka: txt_(r[1]), specSymbol: ss, zak: txt_(r[3]), vs: txt_(r[4]),
      tridaId: tridaPodleSS[ss] ? tridaPodleSS[ss].id : null, trida: tridaPodleSS[ss] ? tridaPodleSS[ss].nazev : "",
      castka: typeof r[5] === "number" ? r[5] : cisloZBunky_(r[5]),
      poznamka: txt_(r[6]),
      odkaz: id && !rucni ? odkazNaEmail_(id) : "",
      id: id, rucni: rucni, kdo: rp.kdo, pozn: rp.pozn
    });
  }
  out.sort(function(a, b) { return b.ts - a.ts; });
  return out.slice(0, limit || LIMIT_HISTORIE);
}

function nastaveniInfo_(uziv) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("POSLEDNI_AUTO_KONTROLA");
  var posledni = null;
  try { posledni = raw ? JSON.parse(raw) : null; } catch (e) {}
  var role = uziv ? uziv.role : "";
  var zapis = maOpravneni_(role, "zapis"), spravce = maOpravneni_(role, "nastaveni");
  var skolaId = nactiSkolaId_();
  return {
    autoKontrola: jeAutoZapnuta_(),
    upozorneni: jeUpozorneniZapnuto_(),
    osobniEmail: zapis ? nactiVychoziProfil_().emailOznameni : "",
    gmailUcet: zapis ? mailboxCtena_() : "",
    posledniAuto: posledni,
    prihlaseni: VYZADOVAT_PRIHLASENI,
    role: role,
    roleNazev: ROLE_DEF[role] ? ROLE_DEF[role].nazev : "",
    prava: pravaRole_(role),
    verze: VERZE_APLIKACE,
    skola: nactiSkolu_(),
    skolaWeb: skolaId.web,
    skolaSymbol: skolaId.symbol,
    vzhled: skolaId.vzhled,
    bankyNavic: spravce ? (props.getProperty("BANKOVNI_DOMENY_NAVIC") || "") : "",
    bankyVestavene: spravce ? POVOLENE_BANKOVNI_DOMENY.slice() : [],
    tabulkaUrl: zapis ? getSS_().getUrl() : "",
    gmailApi: zapis ? gmailApiDostupne_() : false
  };
}

function validujSloupec_(colIndex) {
  var c = parseInt(colIndex, 10);
  if (!(c >= 7)) throw new Error("Neplatný sloupec sbírky.");
  return c;
}

// ---------- AKCE: ČTENÍ ----------
function soucetSouhrnu_(pole) {
  var o = { ocekavano: 0, vybrano: 0, pocetOcekavano: 0, pocetZaplaceno: 0, upravenoRucne: 0, vse: false };
  pole.forEach(function(x) {
    o.ocekavano += x.ocekavano || 0; o.vybrano += x.vybrano || 0; o.pocetOcekavano += x.pocetOcekavano || 0;
    o.pocetZaplaceno += x.pocetZaplaceno || 0; o.upravenoRucne += x.upravenoRucne || 0;
  });
  o.ocekavano = round2_(o.ocekavano); o.vybrano = round2_(o.vybrano);
  o.vse = o.pocetOcekavano > 0 && o.pocetZaplaceno === o.pocetOcekavano;
  return o;
}

function soucetPoctu_(pole, klice) {
  var o = {};
  klice.forEach(function(k) { o[k] = 0; });
  pole.forEach(function(x) { klice.forEach(function(k) { o[k] += (x && x[k]) || 0; }); });
  return o;
}

// Všechny sbírky ve všech aktivních třídách (s vcetneArchivu i v archivovaných): [{ ss, nazev, tridaId, trida, sb }]
function sbirkyVsechTrid_(vcetneArchivu) {
  var out = [];
  (vcetneArchivu ? seznamVsechTrid_() : seznamTrid_()).forEach(function(t) {
    najdiSbirky_(t.list).forEach(function(sb) { out.push({ ss: sb.specSymbol, nazev: sb.nazev, tridaId: t.id, trida: t, sb: sb }); });
  });
  return out;
}

// Sbírka (skupina částí v třídách) podle ID. Bez vcetneArchivu jen s částmi v aktivních třídách – pro zápis a rozesílání;
// sbírka, která je celá v archivu, je jen pro čtení.
function najdiSkupinu_(skupinaId, vcetneArchivu) {
  var skupiny = seskupSbirky_(sbirkyVsechTrid_(!!vcetneArchivu));
  for (var i = 0; i < skupiny.length; i++) if (String(skupiny[i].id) === String(skupinaId)) return skupiny[i];
  if (!vcetneArchivu) {
    var vsechny = seskupSbirky_(sbirkyVsechTrid_(true));
    for (var j = 0; j < vsechny.length; j++) {
      if (String(vsechny[j].id) === String(skupinaId)) throw new Error("Sbírka je v archivované třídě (jen pro čtení). Chcete-li s ní pracovat, nejdřív třídu obnovte.");
    }
  }
  throw new Error("Sbírka nenalezena (mohla být smazána). Obnovte stránku.");
}

function api_prehled_(a, uziv) {
  var ss = getSS_();
  var props = vlastnostiSkriptu_();
  var odeslane = nactiOdeslane_(ss);
  var tridy = seznamVsechTrid_();          // archivované třídy se ukážou také (jen pro čtení, s příznakem archiv)
  var vystup = [], vsechny = [], celkemZaku = 0, polozky = [];
  for (var t = 0; t < tridy.length; t++) {
    var n = vsechnySbirkyData_(tridy[t].list);
    var sbirky = [];
    for (var i = 0; i < n.sbirky.length; i++) {
      var sb = n.sbirky[i];
      var an = analyzujSbirku_(n, sb, odeslane[sb.specSymbol]);
      var z = zakladSbirky_(sb, props);
      z.souhrn = an.souhrn;
      z.pocty = an.pocty;
      z.emaily = an.emaily;
      z.tridaId = tridy[t].id;
      z.tridaNazev = tridy[t].nazev;
      z.archiv = !!tridy[t].archiv;
      sbirky.push(z);
      vsechny.push(z);
      polozky.push({ ss: sb.specSymbol, nazev: sb.nazev, tridaId: tridy[t].id, z: z });
    }
    sbirky.sort(function(x, y) { return (y.vytvoreno || "").localeCompare(x.vytvoreno || ""); });
    if (!tridy[t].archiv) celkemZaku += n.pocetZaku;
    vystup.push({ id: tridy[t].id, nazev: tridy[t].nazev, archiv: !!tridy[t].archiv, pocetZaku: n.pocetZaku, sbirky: sbirky });
  }
  vsechny.sort(function(x, y) { return (y.vytvoreno || "").localeCompare(x.vytvoreno || ""); });

  // Sbírky přes víc tříd se ukazují i jako jedna (součet za všechny třídy).
  var skupiny = seskupSbirky_(polozky, props).map(function(g) {
    var casti = g.polozky.map(function(p) { return p.z; });
    var zkontr = casti.map(function(c) { return c.zkontrolovano; });
    return {
      id: g.id, nazev: casti[0].nazev, vytvoreno: casti[0].vytvoreno,
      archiv: casti.every(function(c) { return c.archiv; }),
      zkontrolovano: zkontr.every(Boolean) ? zkontr.slice().sort()[0] : "",     // nejstarší kontrola (nebo prázdné, když některá chybí)
      souhrn: soucetSouhrnu_(casti.map(function(c) { return c.souhrn; })),
      pocty: soucetPoctu_(casti.map(function(c) { return c.pocty; }), ["zaplaceno", "preplatek", "castecne", "nezaplaceno", "rucne", "nic"]),
      emaily: soucetPoctu_(casti.map(function(c) { return c.emaily; }), ["odeslano", "neodeslano", "bez", "pripominky"]),
      casti: casti.map(function(c) {
        return { tridaId: c.tridaId, tridaNazev: c.tridaNazev, archiv: !!c.archiv, colIndex: c.colIndex, colLetter: c.colLetter, specSymbol: c.specSymbol, souhrn: c.souhrn };
      })
    };
  });
  skupiny.sort(function(x, y) { return (y.vytvoreno || "").localeCompare(x.vytvoreno || ""); });
  return { tridy: vystup, sbirky: vsechny, skupiny: skupiny, pocetZaku: celkemZaku, nastaveni: nastaveniInfo_(uziv) };
}

// Detail jedné sbírky v jedné třídě: stavy žáků, ruční platby, nespárované platby, historie.
function detailCastiSbirky_(trida, sb, nactene, props, ss, odeslane) {
  return memo_("det:" + trida.id + ":" + sb.colIndex, function() { return detailCastiSbirkyBezMemo_(trida, sb, nactene, props, ss, odeslane); });
}
function detailCastiSbirkyBezMemo_(trida, sb, nactene, props, ss, odeslane) {
  var an = analyzujSbirku_(nactene, sb, odeslane[sb.specSymbol]);
  var z = zakladSbirky_(sb, props);
  z.tridaId = trida.id;
  z.tridaNazev = trida.nazev;
  z.archiv = !!trida.archiv;
  var zaznamyVse = nactiZaznamyHistorie_(ss, sb.specSymbol);
  var zaznamy = zaznamyVse.filter(function(x) { return x.rucni && x.castka > 0; });
  an.studenti.forEach(function(s) {
    s.tridaId = trida.id; s.tridaNazev = trida.nazev; s.colIndex = sb.colIndex; s.specSymbol = sb.specSymbol; s.archiv = !!trida.archiv;
    zaznamy.forEach(function(x) {
      if (!rucniPatriZakovi_({ vs: x.vs, zak: x.zak }, s.prijmeni, s.jmeno, s.vs)) return;
      var rp = rozborPoznamkyRucni_(x.poznamka);
      var jeDatum = Object.prototype.toString.call(x.datum) === "[object Date]" && !isNaN(x.datum.getTime());
      s.rucniPlatby.push({
        id: x.id, castka: x.castka, datum: jeDatum ? formatDatum_(x.datum) : "", kdo: rp.kdo, pozn: rp.pozn
      });
    });
  });
  return {
    sbirka: z, an: an,
    nesparovane: nesparovaneZHistorie_(zaznamyVse, an.studenti).map(function(x) { x.tridaNazev = trida.nazev; return x; }),
    platby: nactiHistorii_(sb.specSymbol, 500)
  };
}

function api_sbirka_(a) {
  var colIndex = validujSloupec_(a.colIndex);
  var trida = tridaProCteni_(a.tridaId);
  var sheet = trida.list;
  var props = vlastnostiSkriptu_();
  var n = vsechnySbirkyData_(sheet);
  var sb = null;
  for (var i = 0; i < n.sbirky.length; i++) if (n.sbirky[i].colIndex === colIndex) sb = n.sbirky[i];
  if (!sb) throw new Error("Sbírka ve sloupci " + getColLetter_(colIndex) + " nenalezena (chybí SS nebo název).");
  var ss = getSS_();
  var d = detailCastiSbirky_(trida, sb, n, props, ss, nactiOdeslane_(ss));
  return {
    sbirka: d.sbirka, souhrn: d.an.souhrn, pocty: d.an.pocty, emaily: d.an.emaily, studenti: d.an.studenti,
    nesparovane: d.nesparovane, platby: d.platby
  };
}

// Detail sbírky přes všechny její třídy: žáci ze všech tříd v jedné tabulce, součty za celou sbírku.
function api_sbirkaSkupina_(a) {
  var g = najdiSkupinu_(a.skupina, true);
  var props = vlastnostiSkriptu_();
  var ss = getSS_(), odeslane = nactiOdeslane_(ss);
  var casti = [], studenti = [], nesp = [], platby = [];
  g.polozky.forEach(function(p) {
    var d = detailCastiSbirky_(p.trida, p.sb, vsechnySbirkyData_(p.trida.list), props, ss, odeslane);
    var cast = Object.assign({}, d.sbirka);          // kopie (detail může být sdílený při hromadném čtení)
    cast.souhrn = d.an.souhrn; cast.pocty = d.an.pocty; cast.emaily = d.an.emaily;
    casti.push(cast);
    studenti = studenti.concat(d.an.studenti);
    nesp = nesp.concat(d.nesparovane);
    platby = platby.concat(d.platby);
  });
  platby.sort(function(x, y) { return y.ts - x.ts; });
  var zkontr = casti.map(function(c) { return c.zkontrolovano; });
  return {
    skupina: { id: g.id, nazev: casti[0].nazev, archiv: casti.every(function(c) { return c.archiv; }), casti: casti.map(function(c) {
      return { tridaId: c.tridaId, tridaNazev: c.tridaNazev, archiv: !!c.archiv, colIndex: c.colIndex, colLetter: c.colLetter, specSymbol: c.specSymbol, souhrn: c.souhrn, pocty: c.pocty, emaily: c.emaily };
    }) },
    sbirka: {
      nazev: casti[0].nazev, skupinaId: g.id, archiv: casti.every(function(c) { return c.archiv; }), tridaNazev: casti.map(function(c) { return c.tridaNazev; }).join(", "),
      colLetter: "", specSymbol: casti.map(function(c) { return c.specSymbol; }).join(", "), colIndex: 0, tridaId: 0,
      vytvoreno: casti[0].vytvoreno, zkontrolovano: zkontr.every(Boolean) ? zkontr.slice().sort()[0] : ""
    },
    souhrn: soucetSouhrnu_(casti.map(function(c) { return c.souhrn; })),
    pocty: soucetPoctu_(casti.map(function(c) { return c.pocty; }), ["zaplaceno", "preplatek", "castecne", "nezaplaceno", "rucne", "nic"]),
    emaily: soucetPoctu_(casti.map(function(c) { return c.emaily; }), ["odeslano", "neodeslano", "bez", "pripominky"]),
    studenti: studenti, nesparovane: nesp, platby: platby
  };
}

// Seznam žáků třídy pro výběr při zakládání sbírky (výchozí částka je ze sloupce E) a pro kontrolu při vkládání
// nových žáků: vsJinde = VS, která už mají žáci v ostatních třídách.
function api_zaci_(a) {
  var trida = tridaNebo_(a.tridaId);
  var zaci = zakyTridy_(trida.list);
  var vsJinde = {};
  var vse = pouziteVs_();
  Object.keys(vse).forEach(function(k) {
    if (vse[k].tridaId !== trida.id) vsJinde[k] = vse[k].trida + ": " + vse[k].zak;
  });
  return { trida: { id: trida.id, nazev: trida.nazev }, zaci: zaci, vsJinde: vsJinde };
}

function urlListu_(id) {
  return String(getSS_().getUrl()).replace(/#.*$/, "") + "#gid=" + id;
}

// Třídy s počtem žáků a sbírek.
function api_tridy_(a) {
  var vsechny = seznamVsechTrid_();
  function popis(t) {
    var n = vsechnySbirkyData_(t.list);
    var o = { id: t.id, nazev: t.nazev, pocetZaku: n.pocetZaku, pocetSbirek: n.sbirky.length, url: urlListu_(t.id), archiv: !!t.archiv };
    if (a && a.zaci && !t.archiv) o.zaci = zakyZData_(n);
    return o;
  }
  return {
    tridy: vsechny.filter(function(t) { return !t.archiv; }).map(popis),
    archiv: vsechny.filter(function(t) { return t.archiv; }).map(popis)       // archivované třídy: jen pro čtení, jde je obnovit nebo smazat nadobro
  };
}

function api_historie_() {
  return { platby: nactiHistorii_("", LIMIT_HISTORIE) };
}

function api_zprava_(a) {
  return nactiZpravuZHistorie_(getSS_(), a.id);
}

function api_nastaveni_(a, uziv) {
  return nastaveniInfo_(uziv);
}

// ---------- AKCE: ZÁPIS (bez e-mailů žákům) ----------
function api_zalozTridu_(a) {
  return spustSeZamkem_(function() { return zalozTridu_(a.nazev); }, 20000);
}

function api_prejmenovatTridu_(a) {
  return spustSeZamkem_(function() { return prejmenujTridu_(a.tridaId, a.nazev); }, 20000);
}

// Vloží žáky z vložené tabulky do třídy. a.radky = [{ prijmeni, jmeno, email, vs, castka }].
// Řádky s chybou nebo duplicitní se přeskočí a vrátí se s důvodem.
function api_importZaku_(a) {
  return spustSeZamkem_(function() {
    var trida = tridaNebo_(a.tridaId);
    var res = pridejZakyDoTridy_(trida.list, a.radky, { doplnitVs: !!a.doplnitVs });
    res.trida = { id: trida.id, nazev: trida.nazev };
    return res;
  }, 20000);
}

// ---------- AKCE: SPRÁVA TŘÍD A ŽÁKŮ (vždy na potvrzení: náhled → token → provedení) ----------
// Náhled nic nemění, jen vrátí, co se stane, a jednorázový token (platí 10 minut). Provedení bez platného
// tokenu a bez shody s náhledem nic neudělá.
function vydejPotvrzeni_(typ, data, uziv) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put("POTV_" + token, JSON.stringify({ typ: typ, data: data, kdo: uziv ? uziv.jmeno : "" }), TOKEN_PLATNOST_SEKUND);
  return token;
}

// Přečte potvrzení, aniž by ho spotřebovalo (aby šlo po překlepu v názvu zkusit znovu).
function nahlednutiPotvrzeni_(token, typ) {
  var raw = txt_(token) ? CacheService.getScriptCache().get("POTV_" + txt_(token)) : null;
  if (!raw) throw new Error("Potvrzení vypršelo nebo už bylo použito. Otevřete náhled znovu – nic se nezměnilo.");
  var p = JSON.parse(raw);
  if (p.typ !== typ) throw new Error("Potvrzení nepatří k téhle akci. Nic se nezměnilo.");
  return p.data;
}

function spotrebujPotvrzeni_(token) {
  CacheService.getScriptCache().remove("POTV_" + txt_(token));
}

function pouzeZaci_(a) {
  if (!Array.isArray(a.radky) || !a.radky.length) throw new Error("Nevybrali jste žádné žáky.");
  if (a.radky.length > 500) throw new Error("Najednou jde vybrat nejvíc 500 žáků.");
  return a.radky.map(function(r) { return { radek: parseInt(r && r.radek, 10), prijmeni: r ? r.prijmeni : undefined, jmeno: r ? r.jmeno : undefined }; });
}

function popisUcastiProNahled_(z) {
  return z.ucast.map(function(u) {
    return { sbirka: u.sbirka, stav: u.stav, zaplaceno: u.zaplaceno, ocekavano: u.ocekavano };
  });
}

// Archivace třídy: list se skryje a třída se přestane používat, nic se nemaže (jde vrátit tlačítkem Obnovit).
// Záznamy proběhlých sbírek a žáci v nich zůstávají a jdou dál prohlížet.
function api_archivovatTridu_(a, uziv) {
  if (a.tridaId === undefined || a.tridaId === null || a.tridaId === "") throw new Error("Není vybraná třída.");
  return spustSeZamkem_(function() {
    var r = archivujTridu_(a.tridaId);
    return { archivovano: r.nazev, id: r.id };
  }, 20000);
}

function api_obnovitTridu_(a, uziv) {
  if (a.tridaId === undefined || a.tridaId === null || a.tridaId === "") throw new Error("Není vybraná třída.");
  return spustSeZamkem_(function() {
    var r = obnovTridu_(a.tridaId);
    return { obnoveno: r.nazev, id: r.id };
  }, 20000);
}

// Smazání třídy NAVŽDY – jen u třídy v archivu. Náhled nic nemění.
function api_nahledSmazaniTridy_(a, uziv) {
  if (a.tridaId === undefined || a.tridaId === null || a.tridaId === "") throw new Error("Není vybraná třída.");
  var t = najdiTriduVcetneArchivu_(a.tridaId);
  if (!t) throw new Error("Třída nenalezena (list mohl být v tabulce smazán). Obnovte stránku.");
  if (!t.archiv) throw new Error("Smazat nadobro jde jen třídu v archivu. Nejdřív ji archivujte – tím se nic nesmaže a záznamy sbírek zůstanou.");
  var n = vsechnySbirkyData_(t.list);
  var sbirky = prehledSbirekTridy_(t.list);
  var ssList = sbirky.map(function(x) { return x.specSymbol; });
  var pocetPlateb = pocetPlatebSbirek_(getSS_(), ssList);
  var token = vydejPotvrzeni_("smazTridu", { id: t.id, nazev: t.nazev, pocetZaku: n.pocetZaku, pocetSbirek: sbirky.length }, uziv);
  return {
    trida: { id: t.id, nazev: t.nazev }, pocetZaku: n.pocetZaku, sbirky: sbirky, pocetPlateb: pocetPlateb,
    vyzadujeHeslo: true, token: token, platnostSekund: TOKEN_PLATNOST_SEKUND
  };
}

// a.nazev = název třídy opsaný uživatelem (ochrana před omylem), a.heslo = heslo přihlášeného správce
function api_smazatTridu_(a, uziv) {
  var data = nahlednutiPotvrzeni_(a.token, "smazTridu");
  if (normJmeno_(a.nazev) !== normJmeno_(data.nazev)) throw new Error("Název třídy nesedí. Pro smazání ho opište přesně: „" + data.nazev + "“. Nic se nesmazalo.");
  overHesloAkce_(uziv, a.heslo);
  return spustSeZamkem_(function() {
    var t = najdiTriduVcetneArchivu_(data.id);
    if (!t) throw new Error("Třída už neexistuje. Obnovte stránku.");
    if (!t.archiv) throw new Error("Třída mezitím byla obnovena z archivu. Nic se nesmazalo.");
    var n = vsechnySbirkyData_(t.list);
    if (n.pocetZaku !== data.pocetZaku || najdiSbirky_(t.list).length !== data.pocetSbirek) {
      throw new Error("Třída se mezitím změnila (přibyli nebo ubyli žáci či sbírky). Otevřete náhled znovu – nic se nesmazalo.");
    }
    spotrebujPotvrzeni_(a.token);
    var r = smazTridu_(data.id);
    return { smazano: r.nazev, id: r.id };
  }, 20000);
}

// ---- smazání sbírky (správce; na potvrzení a s heslem)
// Sbírka = skupina částí (po jednom sloupci v každé třídě). Maže se celá, ve všech třídách včetně archivovaných.
// Vstup: a.skupina (ID skupiny), nebo a.specSymbol některé její části.
function skupinaProSmazani_(a) {
  if (a.skupina !== undefined && a.skupina !== null && a.skupina !== "") return najdiSkupinu_(a.skupina, true);
  var ss = txt_(a.specSymbol);
  if (!ss) throw new Error("Není vybraná sbírka.");
  var skupiny = seskupSbirky_(sbirkyVsechTrid_(true));
  for (var i = 0; i < skupiny.length; i++) {
    for (var j = 0; j < skupiny[i].polozky.length; j++) if (skupiny[i].polozky[j].ss === ss) return skupiny[i];
  }
  throw new Error("Sbírka nenalezena (mohla být smazána). Obnovte stránku.");
}

function api_nahledSmazaniSbirky_(a, uziv) {
  var g = skupinaProSmazani_(a);
  var ss = getSS_();
  var casti = g.polozky.map(function(p) {
    var pr = prehledSbirekTridy_(p.trida.list).filter(function(x) { return x.specSymbol === p.ss; })[0] || {};
    return {
      tridaId: p.trida.id, tridaNazev: p.trida.nazev, archiv: !!p.trida.archiv, colIndex: p.sb.colIndex, colLetter: getColLetter_(p.sb.colIndex), specSymbol: p.ss,
      pocetOcekavano: pr.pocetOcekavano || 0, pocetZaplaceno: pr.pocetZaplaceno || 0, vybrano: pr.vybrano || 0, ocekavano: pr.ocekavano || 0
    };
  });
  var ssList = casti.map(function(c) { return c.specSymbol; });
  var nazev = g.polozky[0].nazev;
  var token = vydejPotvrzeni_("smazSbirku", {
    skupina: g.id, nazev: nazev, casti: casti.map(function(c) { return { tridaId: c.tridaId, colIndex: c.colIndex, specSymbol: c.specSymbol }; })
  }, uziv);
  return {
    sbirka: { skupina: g.id, nazev: nazev }, casti: casti,
    pocetPlateb: pocetPlatebSbirek_(ss, ssList), pocetOdeslanych: pocetOdeslanychSbirek_(ss, ssList),
    vyzadujeHeslo: true, token: token, platnostSekund: TOKEN_PLATNOST_SEKUND
  };
}

// a.heslo = heslo přihlášeného správce; a.smazatHistorii = smazat i záznamy v Historii plateb a v Odeslaných e-mailech
function api_smazatSbirku_(a, uziv) {
  var data = nahlednutiPotvrzeni_(a.token, "smazSbirku");
  overHesloAkce_(uziv, a.heslo);
  return spustSeZamkem_(function() {
    var g = najdiSkupinu_(data.skupina, true);
    var ted = g.polozky.map(function(p) { return p.ss; }).sort().join(",");
    var bylo = data.casti.map(function(c) { return c.specSymbol; }).sort().join(",");
    if (ted !== bylo) throw new Error("Sbírka se mezitím změnila. Otevřete náhled znovu – nic se nesmazalo.");
    g.polozky.forEach(function(p) {
      var c = data.casti.filter(function(x) { return x.specSymbol === p.ss; })[0];
      if (!c || c.tridaId !== p.trida.id || c.colIndex !== p.sb.colIndex) throw new Error("Sbírka se mezitím změnila. Otevřete náhled znovu – nic se nesmazalo.");
    });
    spotrebujPotvrzeni_(a.token);
    var out = { smazano: g.polozky[0].nazev, casti: g.polozky.length, smazanoHistorie: 0, smazanoOdeslane: 0 };
    g.polozky.forEach(function(p) {
      var r = smazSbirkuZTridy_(p.trida.list, p.sb.colIndex, p.ss, { smazatHistorii: !!a.smazatHistorii });
      out.smazanoHistorie += r.smazanoHistorie;
      out.smazanoOdeslane += r.smazanoOdeslane;
    });
    return out;
  }, 25000);
}

function api_nahledOdstraneniZaku_(a, uziv) {
  var radky = pouzeZaci_(a);
  var t = tridaNebo_(a.tridaId);
  var zaci = popisZakuNaRadcich_(t.list, radky);
  var vSbirkach = 0, zaplatili = 0;
  zaci.forEach(function(z) { if (z.ucast.length) vSbirkach++; z.ucast.forEach(function(u) { if (u.zaplaceno > 0) zaplatili++; }); });
  var token = vydejPotvrzeni_("odstranZaky", { tridaId: t.id, radky: zaci.map(function(z) { return { radek: z.radek, prijmeni: z.prijmeni, jmeno: z.jmeno }; }) }, uziv);
  return {
    trida: { id: t.id, nazev: t.nazev },
    zaci: zaci.map(function(z) { return { radek: z.radek, prijmeni: z.prijmeni, jmeno: z.jmeno, email: z.email, vs: z.vs, ucast: popisUcastiProNahled_(z) }; }),
    vSbirkach: vSbirkach, sPlatbou: zaplatili, token: token, platnostSekund: TOKEN_PLATNOST_SEKUND
  };
}

function api_odstranitZaky_(a, uziv) {
  var data = nahlednutiPotvrzeni_(a.token, "odstranZaky");
  return spustSeZamkem_(function() {
    var t = tridaNebo_(data.tridaId);
    spotrebujPotvrzeni_(a.token);
    return odstranZakyZTridy_(t.list, data.radky);       // znovu ověří, že na řádcích jsou stejní žáci
  }, 20000);
}

function api_nahledPresunuZaku_(a, uziv) {
  var radky = pouzeZaci_(a);
  var zdroj = tridaNebo_(a.tridaId);
  if (a.cilTridaId === undefined || a.cilTridaId === null || a.cilTridaId === "") throw new Error("Vyberte třídu, kam žáky přesunout.");
  var cil = tridaNebo_(a.cilTridaId);
  if (cil.id === zdroj.id) throw new Error("Žáci už v téhle třídě jsou. Vyberte jinou cílovou třídu.");
  var zaci = nahledPresunuZaku_(zdroj.list, cil.list, radky);
  var token = vydejPotvrzeni_("presunZaky", { tridaId: zdroj.id, cilTridaId: cil.id, radky: zaci.map(function(z) { return { radek: z.radek, prijmeni: z.prijmeni, jmeno: z.jmeno }; }) }, uziv);
  return {
    trida: { id: zdroj.id, nazev: zdroj.nazev }, cil: { id: cil.id, nazev: cil.nazev },
    zaci: zaci.map(function(z) { return { radek: z.radek, prijmeni: z.prijmeni, jmeno: z.jmeno, email: z.email, vs: z.vs, ucast: popisUcastiProNahled_(z), stav: z.stav, zpravy: z.zpravy }; }),
    token: token, platnostSekund: TOKEN_PLATNOST_SEKUND
  };
}

function api_presunoutZaky_(a, uziv) {
  var data = nahlednutiPotvrzeni_(a.token, "presunZaky");
  return spustSeZamkem_(function() {
    var zdroj = tridaNebo_(data.tridaId), cil = tridaNebo_(data.cilTridaId);
    spotrebujPotvrzeni_(a.token);
    var r = presunZakyDoJineTridy_(zdroj.list, cil.list, data.radky);
    r.cil = { id: cil.id, nazev: cil.nazev };
    return r;
  }, 20000);
}

// Založí sbírku. Dvě podoby:
//  • jedna třída: a.tridaId (bez ID = první třída), a.zaci = [{ radek, castka }] (bez a.zaci platí všichni a.castka)
//  • víc tříd naráz: a.skupiny = [{ tridaId, zaci:[{ radek, castka }] }] – v každé třídě vznikne vlastní sbírka
//    se stejným názvem a vlastním specifickým symbolem (platby se tak v každé třídě párují zvlášť).
// Nejdřív se zkontrolují všechny třídy, teprve potom se cokoli zapíše.
function api_zalozitSbirku_(a, uziv) {
  var nazev = cistyNazev_(a.nazev);
  if (!nazev) throw new Error("Zadejte název sbírky.");
  var skupiny;
  if (Array.isArray(a.skupiny)) {
    if (!a.skupiny.length) throw new Error("Vyberte aspoň jednoho žáka.");
    skupiny = a.skupiny;
    if (skupiny.length > 1 && txt_(a.sloupec)) throw new Error("Písmeno sloupce jde zadat jen pro jednu třídu.");
  } else {
    skupiny = [{ tridaId: a.tridaId, zaci: (a.zaci === undefined || a.zaci === null) ? null : a.zaci }];
  }
  var vysledek = spustSeZamkem_(function() {
    var plan = [], pouzite = {};
    skupiny.forEach(function(g) {
      var trida = tridaNebo_(g.tridaId);
      if (pouzite[trida.id]) throw new Error("Třída „" + trida.nazev + "“ je ve výběru dvakrát.");
      pouzite[trida.id] = true;
      var rozsah = nactiRozsahStudentu_(trida.list);
      if (!rozsah) throw new Error("V třídě „" + trida.nazev + "“ zatím nejsou žádní žáci. Nejdřív je přidejte (Žáci a třídy → Přidat žáky).");
      var vyber = (g.zaci === undefined || g.zaci === null) ? null : g.zaci;
      if (vyber !== null) {
        if (!vyber.length) return;                       // třída bez vybraných žáků se přeskočí
        overVyberZaku_(vyber, rozsah, trida.list.getRange(rozsah.startRow, 1, rozsah.numRows, 5).getValues());
      }
      var col = txt_(a.sloupec) ? getColIndex_(a.sloupec) : najdiVolnySloupec_(trida.list, rozsah);
      if (!(col >= 7)) throw new Error("Neplatné písmeno sloupce (povoleno od G dál).");
      plan.push({ trida: trida, col: col, vyber: vyber });
    });
    if (!plan.length) throw new Error("Vyberte aspoň jednoho žáka.");
    var hotovo = [];
    plan.forEach(function(p) {
      var r = pripravSbirku_(p.trida.list, p.col, nazev, a.castka, p.vyber);
      r.tridaId = p.trida.id;
      r.tridaNazev = p.trida.nazev;
      try { zapamatujVlastnikaSbirky_(r.specSymbol, uziv); } catch (e) {}
      hotovo.push(r);
    });
    // Sbírka z víc tříd je jedna sbírka: části mají společné ID skupiny (podle něj se ukazují dohromady).
    var skupinaId = hotovo[0].specSymbol;
    hotovo.forEach(function(r) { try { zapamatujSkupinuSbirky_(r.specSymbol, skupinaId); } catch (e) {} });
    var prvni = hotovo[0], vysl = {};
    Object.keys(prvni).forEach(function(k) { vysl[k] = prvni[k]; });
    vysl.sbirky = hotovo;
    vysl.skupina = skupinaId;
    vysl.celkemZaku = hotovo.reduce(function(sum, r) { return sum + r.pocetZaku; }, 0);
    vysl.celkemKc = round2_(hotovo.reduce(function(sum, r) { return sum + r.celkem; }, 0));
    return vysl;
  }, 20000);
  // Hotový detail rovnou v odpovědi: rozhraní ho ukáže bez dalšího dotazu a dalšího čekání.
  try {
    zneplatniCacheDat_();
    vysledek.detail = vysledek.sbirky.length > 1 ? api_sbirkaSkupina_({ skupina: vysledek.skupina }) : api_sbirka_({ colIndex: vysledek.colIndex, tridaId: vysledek.tridaId });
  } catch (e) { /* detail si rozhraní načte samo */ }
  return vysledek;
}

// Přidá žáka do sbírky / změní mu částku (castka > 0) nebo ho vyřadí (castka = 0).
function api_upravUcastnika_(a) {
  var colIndex = validujSloupec_(a.colIndex);
  var radek = parseInt(a.radek, 10);
  return spustSeZamkem_(function() {
    var sheet = tridaNebo_(a.tridaId).list;
    najdiSbirkuPodleSloupce_(sheet, colIndex);
    if (radek >= 1) overShoduZaka_(a, sheet.getRange(radek, 1, 1, 2).getValues()[0]);
    var res = nastavUcastnika_(sheet, colIndex, radek, a.castka);
    return { souhrn: res.souhrn };
  }, 20000);
}

// Ruční úprava zaplacení (hotovost apod.): zapíše se jako platba do historie a stav žáka se přepočítá.
//  a.celou = true: doplatí zbytek do plné částky; jinak a.castka. Nepovinná poznámka a.poznamka.
function api_rucniPlatba_(a, uziv) {
  var colIndex = validujSloupec_(a.colIndex);
  var radek = parseInt(a.radek, 10);
  return spustSeZamkem_(function() {
    var sheet = tridaNebo_(a.tridaId).list;
    var sb = najdiSbirkuPodleSloupce_(sheet, colIndex);
    var rozsah = nactiRozsahStudentu_(sheet);
    if (!rozsah || !(radek >= rozsah.startRow && radek <= rozsah.lastRow)) throw new Error("Neplatný řádek žáka.");
    var zak = sheet.getRange(radek, 1, 1, 5).getValues()[0];
    if (!jeZakRadek_(zak)) throw new Error("Na řádku " + radek + " není žák (chybí e-mail i VS).");
    overShoduZaka_(a, zak);

    var b = rozborBunky_(sheet.getRange(radek, colIndex).getValue(), zak[4]);
    if (b.stav === "nic") throw new Error("Žák není v této sbírce. Nejdřív ho do ní přidejte (Změnit částku).");
    var ocek = b.stav === "rucne" ? getExpectedAmount_("", zak[4]) : b.ocekavano;
    if (!(ocek > 0)) throw new Error("U žáka není známá částka sbírky – nastavte ji (Změnit částku).");

    var castka;
    if (a.celou) {
      castka = round2_(ocek - b.zaplaceno);
      if (!(castka > 0)) throw new Error("Žák už má zaplacenou celou částku.");
    } else {
      castka = parseCastka_(a.castka);
    }
    if (!(castka > 0) || castka > MAX_CASTKA) throw new Error("Zadejte částku větší než 0 (nejvíc " + MAX_CASTKA + " Kč).");

    // Pojistka proti dvojímu kliknutí: stejná platba stejnému žákovi během pár vteřin se nezapíše dvakrát.
    var cache = CacheService.getScriptCache();
    var klicDup = "RUCNI_" + sb.specSymbol + "_" + radek + "_" + castka;
    if (cache.get(klicDup)) throw new Error("Stejná platba byla právě zadána. Obnovte stránku a zkontrolujte stav.");
    cache.put(klicDup, "1", 8);

    var vs = txt_(zak[3]).replace(/\s+/g, "");
    var id = zapisRucniPlatbu_(getSS_(), sb.nazev, sb.specSymbol, jmenoZaka_(zak[0], zak[1]), vs, castka, a.poznamka, uziv && uziv.jmeno);
    var res = zkontrolujSbirku_(sheet, colIndex, { bezGmailu: true });
    return { id: id, castka: castka, souhrn: res.souhrn, emailPoslan: res.emailPoslan };
  }, 20000);
}

function api_smazRucniPlatbu_(a) {
  return spustSeZamkem_(function() {
    var ss = getSS_();
    var vArchivu = {};
    seznamVsechTrid_().forEach(function(t) { if (t.archiv) najdiSbirky_(t.list).forEach(function(sb) { vArchivu[sb.specSymbol] = true; }); });
    var specSymbol = smazRucniPlatbu_(ss, a.id, vArchivu);
    var nalez = najdiSbirkuVTridach_(specSymbol);
    var souhrn = null;
    if (nalez) souhrn = zkontrolujSbirku_(nalez.trida.list, nalez.sbirka.colIndex, { bezGmailu: true }).souhrn;
    return { smazano: true, souhrn: souhrn };
  }, 20000);
}

function api_zkontrolovat_(a) {
  var colIndex = validujSloupec_(a.colIndex);
  var res = spustSeZamkem_(function() {
    return zkontrolujSbirku_(tridaNebo_(a.tridaId).list, colIndex);
  }, 25000);
  return {
    nazev: res.nazev, pocetPlateb: res.pocetPlateb, souhrn: res.souhrn, stitekText: res.stitekText,
    historiePridano: res.historiePridano, emailPoslan: res.emailPoslan, chyby: res.chyby,
    diag: res.diag, nesparovano: res.nesparovano
  };
}

// Kontrola plateb všech částí sbírky (po jedné v každé třídě) najednou.
function api_zkontrolovatSkupinu_(a) {
  var g = najdiSkupinu_(a.skupina);
  var vysl = spustSeZamkem_(function() {
    return g.polozky.map(function(p) { return { p: p, res: zkontrolujSbirku_(p.trida.list, p.sb.colIndex) }; });
  }, 25000);
  var out = {
    nazev: g.polozky[0].nazev, pocetPlateb: 0, souhrn: soucetSouhrnu_(vysl.map(function(x) { return x.res.souhrn; })),
    historiePridano: 0, emailPoslan: false, chyby: [], nesparovano: [], casti: []
  };
  vysl.forEach(function(x) {
    var r = x.res, trida = x.p.trida.nazev;
    out.pocetPlateb += r.pocetPlateb || 0;
    out.historiePridano += r.historiePridano || 0;
    out.emailPoslan = out.emailPoslan || !!r.emailPoslan;
    (r.chyby || []).forEach(function(c) { out.chyby.push(trida + ": " + c); });
    (r.nesparovano || []).forEach(function(n) { n.tridaNazev = trida; out.nesparovano.push(n); });
    out.casti.push({ tridaId: x.p.tridaId, tridaNazev: trida, colIndex: x.p.sb.colIndex, diag: r.diag, nesparovano: r.nesparovano || [] });
  });
  return out;
}

function api_nastavit_(a, uziv) {
  if (a.klic === "auto") {
    if (a.hodnota) zapniAutoTrigger_(); else vypniAutoTrigger_();
  } else if (a.klic === "upozorneni") {
    PropertiesService.getScriptProperties().setProperty("UPOZORNENI_VSE_ZAPLACENO", a.hodnota ? "1" : "0");
  } else if (a.klic === "skola") {
    var nazev = cistyText_(a.hodnota, 80);
    if (nazev.length < 2) throw new Error("Zadejte název školy (aspoň 2 znaky).");
    ulozSkolu_(nazev);
  } else if (a.klic === "bankyNavic") {
    var domeny = String(a.hodnota == null ? "" : a.hodnota).toLowerCase().split(/[\s,;]+/).filter(Boolean);
    domeny.forEach(function(d) {
      if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d)) throw new Error("„" + d + "“ není platná doména (např. banka.cz).");
    });
    if (domeny.length > 20) throw new Error("Nejvýš 20 domén.");
    PropertiesService.getScriptProperties().setProperty("BANKOVNI_DOMENY_NAVIC", domeny.join(" "));
  } else {
    throw new Error("Neznámé nastavení.");
  }
  return nastaveniInfo_(uziv);
}

// Ověří napojení na banku: je ve schránce, kterou aplikace čte, aspoň jeden e-mail od banky? Pozná ho aplikace?
function api_overitBanku_() {
  var domeny = bankovniDomeny_();
  var dotaz = "from:(" + domeny.join(" OR ") + ") newer_than:365d";
  var vlakna = GmailApp.search(dotaz, 0, 20);
  var zpravy = [];
  vlakna.forEach(function(t) { t.getMessages().forEach(function(m) { zpravy.push(m); }); });
  zpravy.sort(function(x, y) { return y.getDate().getTime() - x.getDate().getTime(); });
  var out = { mailbox: mailboxCtena_(), nalezeno: zpravy.length, posledni: null };
  if (zpravy.length) {
    var m = zpravy[0], body = m.getPlainBody(), r = rozborBankovnihoEmailu_(body);
    out.posledni = {
      od: m.getFrom(), datum: m.getDate().toISOString(), predmet: String(m.getSubject() || "").substring(0, 100),
      prichozi: jePrichoziPlatba_(body, r), castkaNalezena: (r.castka > 0 ? r.castka : extractAmountFromText_(body)) > 0,
      maVs: r.vs !== null && r.vs !== "", maSs: r.ss !== null && r.ss !== ""
    };
  }
  return out;
}

// Zkusí rozpoznat vložený text e-mailu z banky (pro školy s jinou bankou než Air Bank). Nic se neukládá.
function api_zkusitBankovniEmail_(a) {
  var text = String(a.text == null ? "" : a.text).substring(0, 20000);
  if (text.trim().length < 20) throw new Error("Vložte celý text e-mailu z banky.");
  var r = rozborBankovnihoEmailu_(text);
  var prichozi = jePrichoziPlatba_(text, r);
  var castka = r.castka > 0 ? r.castka : extractAmountFromText_(text);
  var maVs = r.vs !== null && r.vs !== "", maSs = r.ss !== null && r.ss !== "";
  var problemy = [];
  if (!prichozi) problemy.push("Nepoznal jsem, že jde o příchozí platbu (hledám slova jako „příchozí“, „zvýšil“, „připsáno“, „příjem na účtu“).");
  if (!(castka > 0)) problemy.push("Nenašel jsem částku (hledám „Částka: 100,00“ apod.).");
  if (!maSs) problemy.push("V e-mailu není specifický symbol. Aplikace páruje platby podle něj – bez něj se platby této banky nespárují. Zkontrolujte, jestli banka SS v oznámení uvádí.");
  if (!maVs) problemy.push("V e-mailu není variabilní symbol – platbu nepůjde přiřadit žákovi.");
  return {
    prichozi: prichozi, castka: castka, vs: r.vs, ss: r.ss, kod: r.kod, datum: r.datum, zprava: r.zprava,
    odJmeno: r.odJmeno, odUcet: r.odUcet, ok: problemy.length === 0, problemy: problemy
  };
}

function api_opravOdkazy_() {
  var n = opravOdkazyVHistorii_(getSS_(), true);
  return { opraveno: n };
}

// ---------- AKCE: ODESÍLÁNÍ E-MAILŮ ŽÁKŮM (dva kroky + jednorázový token) ----------
// Krok 1: náhled. Nic se neodešle, jen se vrátí seznam příjemců a token.
// QR platba: komu už někdy odešla, je předem odškrtnutý. Připomínka: odškrtnutý je ten, kdo ji dostal v posledních 24 h.
function typEmailu_(t) {
  var typ = t === TYP_QR ? TYP_QR : (t === TYP_PRIPOMINKA ? TYP_PRIPOMINKA : "");
  if (!typ) throw new Error("Neznámý typ e-mailu.");
  return typ;
}

// Příjemci jedné části sbírky (jedna třída) s příznaky pro náhled.
function nahledCasti_(trida, colIndex, typ, odeslaneVse) {
  var s = sestavPrijemce_(trida.list, colIndex, typ);
  if (s.prijemci.length && !profilSbirky_(s.specSymbol).iban) {
    throw new Error("U sbírky chybí číslo účtu, nelze vytvořit QR kód. Doplňte ho v Nastavení (Můj profil nebo Výchozí nastavení).");
  }
  var odeslane = odeslaneVse[s.specSymbol] || {};
  var hranice = Date.now() - NEDAVNO_HODIN * 3600 * 1000;
  var prijemci = s.prijemci.map(function(p) {
    var o = odeslane[normVs_(p.vs)] || {};
    var qr = o.qr, pr = o.pripominka;
    var tentoTyp = typ === TYP_QR ? qr : pr;
    var posledni = tentoTyp && tentoTyp.posledni ? new Date(tentoTyp.posledni).toISOString() : "";
    var jizPoslano = !!tentoTyp;
    var nedavno = !!tentoTyp && tentoTyp.posledni > hranice;
    var zakT = (tentoTyp && tentoTyp.zak) || { pocet: 0, posledni: 0 }, rodT = (tentoTyp && tentoTyp.rodic) || { pocet: 0, posledni: 0 };
    return {
      radek: p.radek, tridaId: trida.id, tridaNazev: trida.nazev,
      prijmeni: p.prijmeni, jmeno: p.jmeno, email: p.email, emailZak: p.emailZak, emailRodice: p.emailRodice, vs: p.vs,
      castka: p.castka, zaplaceno: p.zaplaceno, ocekavano: p.ocekavano,
      naposledy: posledni, pocetOdeslani: tentoTyp ? tentoTyp.pocet : 0,
      qrPocet: qr ? qr.pocet : 0,
      // výchozí odškrtnutí: QR podruhé neposílat; připomínku jen když nedávno neodešla
      predvybrano: typ === TYP_QR ? !jizPoslano : !nedavno,
      nedavno: nedavno,
      // totéž zvlášť pro žáka a rodiče (v náhledu se podle zvolených příjemců předvybírá jen ten, kdo e-mail ještě nedostal)
      jizZak: zakT.pocet > 0, jizRodic: rodT.pocet > 0,
      nedavnoZak: zakT.posledni > hranice, nedavnoRodic: rodT.posledni > hranice,
      naposledyZak: zakT.posledni ? new Date(zakT.posledni).toISOString() : "", naposledyRodic: rodT.posledni ? new Date(rodT.posledni).toISOString() : ""
    };
  });
  // Ukázka QR kódu prvního příjemce, aby šlo zkontrolovat, co se do e-mailu vloží
  var ukazka = null;
  if (s.prijemci.length) {
    var p0 = s.prijemci[0];
    var spayd = sestavSpayd_(p0.castka, p0.vs, s.specSymbol, s.nazev);
    ukazka = { zak: jmenoZaka_(p0.prijmeni, p0.jmeno), spayd: spayd, qr: qrDataUri_(spayd) };
  }
  return { s: s, trida: trida, prijemci: prijemci, ukazka: ukazka };
}

function ulozTokenOdeslani_(typ, casti) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put("ODESL_" + token, JSON.stringify({
    typ: typ,
    casti: casti.map(function(c) {
      return { tridaId: c.trida.id, colIndex: c.s.colIndex, specSymbol: c.s.specSymbol, radky: c.s.prijemci.map(function(p) { return p.radek; }) };
    })
  }), TOKEN_PLATNOST_SEKUND);
  return token;
}

function api_nahledOdeslani_(a) {
  var colIndex = validujSloupec_(a.colIndex);
  var typ = typEmailu_(a.typ);
  var trida = tridaNebo_(a.tridaId);
  var c = nahledCasti_(trida, colIndex, typ, nactiOdeslane_(getSS_()));
  return {
    token: ulozTokenOdeslani_(typ, [c]), typ: typ, popisTypu: popisTypu_(typ), nazev: c.s.nazev, specSymbol: c.s.specSymbol,
    trida: trida.nazev, prijemci: c.prijemci, preskoceno: popisPreskoceno_(c.s), platnostSekund: TOKEN_PLATNOST_SEKUND,
    ukazka: c.ukazka, gmailZbyva: zbyvaGmailKvota_()
  };
}

// Totéž pro celou sbírku přes víc tříd: jeden náhled, jedno potvrzení, příjemci ze všech tříd.
function api_nahledOdeslaniSkupiny_(a) {
  var typ = typEmailu_(a.typ);
  var g = najdiSkupinu_(a.skupina);
  var odeslane = nactiOdeslane_(getSS_());
  var casti = g.polozky.map(function(p) { return nahledCasti_(p.trida, p.sb.colIndex, typ, odeslane); });
  var prijemci = [], ukazka = null, preskoceno = [];
  casti.forEach(function(c) {
    prijemci = prijemci.concat(c.prijemci);
    if (!ukazka && c.ukazka) ukazka = c.ukazka;
    var t = popisPreskoceno_(c.s);
    if (t) preskoceno.push(c.trida.nazev + " – " + t.replace(/^Přeskočeno: /, ""));
  });
  return {
    token: ulozTokenOdeslani_(typ, casti), typ: typ, popisTypu: popisTypu_(typ), nazev: g.polozky[0].nazev,
    specSymbol: casti.map(function(c) { return c.s.specSymbol; }).join(", "),
    trida: casti.map(function(c) { return c.trida.nazev; }).join(", "), skupina: true,
    prijemci: prijemci, preskoceno: preskoceno.length ? "Přeskočeno: " + preskoceno.join("; ") : "", platnostSekund: TOKEN_PLATNOST_SEKUND,
    ukazka: ukazka, gmailZbyva: zbyvaGmailKvota_()
  };
}

// Krok 2: odeslání jen vybraným příjemcům z náhledu a jen s platným tokenem (jde použít jednou).
//   a.vyber = ["<tridaId>:<radek>", …] (sbírka přes víc tříd), nebo a.radky = [čísla řádků] (jedna třída)
//   a.cile = { zak: bool, rodic: bool } – komu e-mail půjde: žákovi (sloupec E-mail), rodičům (sloupec E-mail rodiče), nebo oběma
function api_odeslat_(a, uziv) {
  var cache = CacheService.getScriptCache();
  var klic = "ODESL_" + txt_(a.token);
  var raw = txt_(a.token) ? cache.get(klic) : null;
  if (!raw) throw new Error("Potvrzení vypršelo nebo už bylo použito. Otevřete náhled znovu – nic se neodeslalo.");
  cache.remove(klic);                                  // jednorázové: opakované kliknutí nic neodešle

  var cile = a.cile ? { zak: !!a.cile.zak, rodic: !!a.cile.rodic } : { zak: true, rodic: false };
  if (!cile.zak && !cile.rodic) throw new Error("Vyberte, komu se mají e-maily poslat (žákům, rodičům, nebo oběma) – nic se neodeslalo.");
  var povolene = JSON.parse(raw);
  var casti = povolene.casti || [{ tridaId: povolene.tridaId, colIndex: povolene.colIndex, specSymbol: povolene.specSymbol, radky: povolene.radky }];
  var vyber = {};
  if (Array.isArray(a.vyber)) {
    a.vyber.forEach(function(k) { vyber[String(k)] = true; });
  } else if (casti.length === 1) {
    (a.radky || []).forEach(function(r) { vyber[casti[0].tridaId + ":" + Number(r)] = true; });
  }
  var pocetVybranych = 0;
  casti.forEach(function(c) {
    c.vybrane = c.radky.filter(function(r) { return vyber[c.tridaId + ":" + r]; });
    pocetVybranych += c.vybrane.length;
  });
  if (!pocetVybranych) throw new Error("Nevybrali jste žádné příjemce – nic se neodeslalo.");

  return spustSeZamkem_(function() {
    // Nejdřív se podle aktuálního stavu tabulky zjistí, komu přesně se bude posílat (žák se mezitím mohl dostat do „zaplaceno“, e-mail se mohl změnit).
    var plan = [], celkem = 0;
    casti.forEach(function(c) {
      if (!c.vybrane.length) return;
      var s = sestavPrijemce_(tridaNebo_(c.tridaId).list, c.colIndex, povolene.typ);   // aktuální stav tabulky
      if (s.specSymbol !== c.specSymbol) throw new Error("Sbírka se mezitím změnila. Otevřete náhled znovu.");
      var komu = s.prijemci.filter(function(p) { return c.vybrane.indexOf(p.radek) !== -1; });
      komu.forEach(function(p) { var ad = adresyPrijemce_(p, cile); celkem += ad.zak.length + ad.rodic.length; });
      plan.push({ s: s, komu: komu });
    });
    if (!celkem) throw new Error("Vybraní žáci už e-mail nepotřebují (mezitím zaplatili), nebo nemají e-mail pro zvolené příjemce (žáci / rodiče). Nic se neodeslalo.");
    // Denní limit Googlu: radši nic, než polovina e-mailů (zbytek by tiše selhal). Počítá se každá adresa zvlášť.
    var zbyva = zbyvaGmailKvota_();
    if (zbyva >= 0 && celkem > zbyva) {
      throw new Error("Dnes už z Gmailu jde odeslat jen " + zbyva + " " + (zbyva === 1 ? "e-mail" : (zbyva >= 2 && zbyva <= 4 ? "e-maily" : "e-mailů")) +
        " (denní limit Googlu), vybrali jste " + celkem + ". Nic se neodeslalo – otevřete náhled znovu, odškrtněte část příjemců (nebo jen rodiče / jen žáky) a zbytek pošlete zítra.");
    }
    var res = { odeslano: 0, chyby: [], zapsanoDoPrehledu: true, vybrano: pocetVybranych, odeslanoKomu: celkem };
    plan.forEach(function(x) {
      if (!x.komu.length) return;
      var r = odesliEmailyPrijemcum_(x.s, povolene.typ, x.komu, uziv && uziv.jmeno, cile);
      res.odeslano += r.odeslano;
      res.chyby = res.chyby.concat(r.chyby);
      if (r.zapsanoDoPrehledu === false) res.zapsanoDoPrehledu = false;
    });
    return res;
  }, 20000);
}

// ---------- SPRÁVA PŘÍSTUPU Z MENU TABULKY ----------
// Od verze 5.2 se do aplikace přihlašují všichni e-mailem a kódem (správci ještě heslem). Jméno + heslo už neexistuje;
// účty učitelů a rodičů vznikají registrací nebo pozvánkou v aplikaci, správce se přidává tady v menu.
// Vytvoří (nebo povýší) schválený účet správce přihlašovaný Gmailem. Voláno z menu tabulky.
function vytvorAdminaGmail_(email, zobrazit) {
  email = normEmail_(email);
  if (!platnyEmail_(email)) throw new Error("Zadejte platnou e-mailovou adresu.");
  var stary = nactiUzivatele_(email);
  var u = {};
  if (stary) Object.keys(stary).forEach(function(k) { u[k] = stary[k]; });
  u.jmeno = email; u.email = email;
  u.zobrazit = zobrazit ? overZobrazeneJmeno_(zobrazit) : (u.zobrazit || email.split("@")[0]);
  u.role = jeVlastnikEmail_(email) ? "vlastnik" : "skolni_admin"; u.typ = u.role; u.stav = "aktivni";
  if (!u.profil && ROLE_DEF[u.role].profil && nactiVychoziProfil_().iban) u.profil = nactiVychoziProfil_();
  u.vytvoreno = u.vytvoreno || new Date().toISOString();
  u.overeno = u.overeno || new Date().toISOString();
  u.schvaleno = u.schvaleno || new Date().toISOString();
  u.schvalil = u.schvalil || "menu tabulky";
  ulozUzivatele_(u);
  return { nove: !stary, email: email };
}

// Menu: první správce přihlašovaný Gmailem (další účty pak schvaluje v aplikaci).
function nastavitAdminaGmail() {
  jenZMenu_();   // veřejná funkce: z webové aplikace (konzole prohlížeče) ji nikdo nespustí
  var ui = SpreadsheetApp.getUi();
  try {
    var r1 = ui.prompt("Přidat správce (1/2)",
      "Gmail adresa správce (např. vaše.jmeno@gmail.com). Na ni bude chodit přihlašovací kód.\n" +
      "Tabulku spravuje účet: " + (mailboxCtena_() || "(neznámý)"), ui.ButtonSet.OK_CANCEL);
    if (r1.getSelectedButton() !== ui.Button.OK) return;
    var r2 = ui.prompt("Přidat správce (2/2)", "Jméno, které se zobrazí v aplikaci (prázdné = část adresy před zavináčem):", ui.ButtonSet.OK_CANCEL);
    if (r2.getSelectedButton() !== ui.Button.OK) return;
    var res = vytvorAdminaGmail_(r1.getResponseText(), r2.getResponseText());
    var url = "";
    try { url = ScriptApp.getService().getUrl(); } catch (e) {}
    ui.alert("Správce " + res.email + (res.nove ? " vytvořen." : " upraven (je schválený správce).") + "\n\n" +
      (url ? "Adresa aplikace:\n" + url + "\n\n" : "") +
      "V aplikaci zadejte tuto adresu a opište kód, který na ni přijde. " +
      "Správce se přihlašuje e-mailem, kódem a heslem (heslo si nastaví při prvním přihlášení). Další učitele schvalujete v aplikaci v Nastavení → Účty.");
  } catch (e2) {
    ui.alert("Chyba: " + e2.message);
  }
}

// Menu: zapomněl správce heslo? Smaže se jeho heslo a odhlásí se; při dalším přihlášení (kód z e-mailu) si nastaví nové.
function obnovitHesloSpravce() {
  jenZMenu_();   // veřejná funkce: z webové aplikace (konzole prohlížeče) ji nikdo nespustí
  var ui = SpreadsheetApp.getUi();
  try {
    var spravci = vsichniUzivatele_().filter(vyzadujeHeslo_).map(function(u) { return u.email || u.jmeno; });
    var r = ui.prompt("Obnovit heslo správce",
      "Správci: " + (spravci.join(", ") || "žádní") + "\n\nE-mail správce, jehož heslo se má zrušit (nové si nastaví při dalším přihlášení):", ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    var u = nactiUzivatele_(r.getResponseText());
    if (!u || !vyzadujeHeslo_(u)) throw new Error("Takový správce neexistuje.");
    delete u.hash; delete u.sul;
    ulozUzivatele_(u);
    zrusRelaceUzivatele_(u.jmeno, "");
    smazZamek_("ZAMEK_" + u.jmeno);
    ui.alert("Heslo správce " + (u.email || u.jmeno) + " je zrušené a je odhlášen. Přihlásí se e-mailem, kódem a nastaví si nové heslo.");
  } catch (e) {
    ui.alert("Chyba: " + e.message);
  }
}

function odebratUzivateleAplikace() {
  jenZMenu_();   // veřejná funkce: z webové aplikace (konzole prohlížeče) ji nikdo nespustí
  var ui = SpreadsheetApp.getUi();
  try {
    var seznam = vsichniUzivatele_().map(function(u) { return u.jmeno + " (" + u.role + ")"; });
    var r = ui.prompt("Odebrat uživatele aplikace",
      (seznam.length ? "Uživatelé: " + seznam.join(", ") + "\n\n" : "Zatím nejsou žádní uživatelé.\n\n") + "E-mail uživatele k odebrání (u starého účtu bez e-mailu jeho přihlašovací jméno):",
      ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    odeberUzivatele_(r.getResponseText());
    ui.alert("Uživatel odebrán a odhlášen.");
  } catch (e) {
    ui.alert("Chyba: " + e.message);
  }
}

function odhlasitVsechnyZAplikace() {
  jenZMenu_();   // veřejná funkce: z webové aplikace (konzole prohlížeče) ji nikdo nespustí
  var ui = SpreadsheetApp.getUi();
  try {
    var n = zrusVsechnyRelace_();
    var z = smazVsechnyZamky_();
    ui.alert("Hotovo. Odhlášeno relací: " + n + ", odemčeno zamčených účtů: " + z + ".");
  } catch (e) {
    ui.alert("Chyba: " + e.message);
  }
}
