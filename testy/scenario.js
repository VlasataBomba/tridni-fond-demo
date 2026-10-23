// Scénář běží ve stejném globálním rozsahu jako kód aplikace (viz run.js). Volá jen apiVolej, tedy stejně jako prohlížeč.
function __scenario() {
  var LOG = [];
  function C(akce, args, tok) { return JSON.parse(apiVolej(akce, JSON.stringify(args || {}), tok || "")); }
  function rec(label, v) { LOG.push([label, v]); return v; }
  function kod() { for (var i = __sent.length - 1; i >= 0; i--) { var m = __sent[i].text.match(/: (\d{6})/); if (m) return m[1]; } throw new Error("kód nenalezen"); }
  function cls(nStud, vsBase, mail) { var rows = [[], [], [], [], []]; rows.push(["SS →"]); rows.push(["Příjmení", "Jméno", "Gmail", "Variabilní symbol", "Částka"]); rows.push([]);
    for (var k = 0; k < nStud; k++) rows.push(["Novák" + k, "Jan" + k, mail + k + "@x.cz", String(vsBase + k), 100]); return rows; }
  __SS = __mkSpreadsheet([{ name: "2.A", id: 11, rows: cls(6, 100, "rodic") }, { name: "1.C", id: 22, rows: cls(3, 200, "mama") }]);
  __props.TABULKA_ID = "SSID"; __props.TRIDY = "[11,22]";

  rec("stav-anon", C("stavPristupu"));
  rec("reg-admin", C("registrovat", { typ: "ucitel", jmeno: "Admin Test", email: "admin@gmail.com", iban: "19-2000145399/0800", skola: "ZŠ Test", skolaId: "jaroska.cz", heslo: "dlouheheslo123", heslo2: "dlouheheslo123" }));
  rec("reg-admin-overit", C("registraceOverit", { email: "admin@gmail.com", kod: kod() }));
  function login(email, pw) { C("kodPoslat", { email: email }); var r = C("prihlasitKodem", { email: email, kod: kod() }); if (r.data && r.data.krokHeslo) r = C("prihlasitSpravce", { email: email, propustka: r.data.propustka, heslo: pw, heslo2: pw }); return r; }
  var adm = login("admin@gmail.com", "dlouheheslo123"); rec("login-admin", adm); var A = adm.data.token;
  rec("login-neznamy", C("kodPoslat", { email: "nikdo@x.cz" }));
  rec("reg-ucitel", C("registrovat", { typ: "ucitel", jmeno: "Učitelka Eva", email: "eva@skola.cz", iban: "", adminId: C("stavPristupu").data.adminUcty[0].id }));
  rec("ucty-1", C("ucty", {}, A));
  rec("schvalit-ucitele", C("uctyZmenit", { jmeno: "eva@skola.cz", stav: "aktivni", role: "ucitel" }, A));
  var tea = login("eva@skola.cz"); rec("login-ucitel", tea); var T = tea.data.token;
  rec("reg-zak", C("registrovat", { typ: "zak", jmeno: "Rodič Novákův", email: "rodic1@x.cz" }));
  var zr = C("registraceOverit", { email: "rodic1@x.cz", kod: kod() }); rec("reg-zak-overit", zr); var Z = zr.data.token;
  rec("tema-ulozit", C("temaUlozit", { tema: "dark" }, T));
  rec("tema-neplatne", C("temaUlozit", { tema: "x" }, T));
  function mer(f) { var p = __stats.propCalls, s = __stats.sheetCalls; f(); return { propCalls: __stats.propCalls - p, sheetCalls: __stats.sheetCalls - s }; }
  var M1 = mer(function() { C("stavPristupu"); }), M2 = mer(function() { C("stavPristupu", {}, T); }), M3 = mer(function() { C("moje", {}, Z); });
  console.log("MERENI stavPristupu(anon)", JSON.stringify(M1), "stavPristupu(prihl)", JSON.stringify(M2), "moje(zak)", JSON.stringify(M3));

  rec("tridy", C("tridy", { zaci: true }, T));
  rec("zaci", C("zaci", { tridaId: 11 }, T));
  rec("zaloz-tridu", C("zalozTridu", { nazev: "3.B" }, T));
  rec("import", C("importZaku", { tridaId: 11, radky: [
    { prijmeni: "Dvořák", jmeno: "Petr", email: "dv@x.cz", vs: "300", emailRodice: "Mama@x.cz, tata@x.cz, mama@x.cz" },
    { prijmeni: "Dvořák", jmeno: "Petr", email: "dv2@x.cz", vs: "301" },
    { prijmeni: "Nový", jmeno: "Adam", email: "bad", vs: "300" },
    { prijmeni: "Čech", jmeno: "Tom", email: "", vs: "302", emailRodice: "špatný adresa" },
    { prijmeni: "Rodičovský", jmeno: "Kuba", email: "", vs: "303", emailRodice: "jenrodic@x.cz" }], doplnitVs: false }, T));
  rec("tridy-2", C("tridy", { zaci: true }, T));
  var sb = C("zalozitSbirku", { nazev: "Divadlo", skupiny: [{ tridaId: 11, zaci: [{ radek: 9, castka: 150 }, { radek: 10, castka: 150 }, { radek: 11, castka: 150 }, { radek: 15, castka: 150 }, { radek: 16, castka: 150 }] }, { tridaId: 22, zaci: [{ radek: 9, castka: 150 }, { radek: 10, castka: 150 }] }] }, T);
  rec("zalozit-sbirku", sb);
  var skup = sb.data.skupina, ssA = sb.data.sbirky[0].specSymbol, ssB = sb.data.sbirky[1].specSymbol;
  var sb2 = C("zalozitSbirku", { nazev: "Fotky", tridaId: 11, castka: 50 }, T); rec("zalozit-sbirku-2", sb2);
  rec("prehled", C("prehled", {}, T));

  function banka(id, ss, vs, castka, from, extra) { __gmail.messages.push({ id: id, thread: "t" + id, from: from || "Air Bank <info@airbank.cz>", date: new Date(2026, 9, 5, 10, 0, 0),
    body: "Dobrý den,\nzůstatek na účtu Třídní fond číslo 123456789/0800 se zvýšil o částku " + castka + ",00 CZK. Dostupný zůstatek je 5 000,00 CZK.\nPříchozí úhrada z účtu Jan Novák číslo 987654321/0100\nČástka: " + castka + ",00 CZK\nDatum zaúčtování: 11.10.2026\nVariabilní symbol: " + vs + "\nSpecifický symbol: " + ss + "\nZpráva pro příjemce: divadlo\nKód transakce: 17122819" + id + "\n" + (extra || "") }); }
  banka("a0000101", ssA, "100", 150); banka("a0000102", ssA, "101", 100); banka("a0000103", ssA, "999", 50); banka("a0000104", ssB, "200", 150); banka("a0000105", ssA, "103", 150, "Odchozi <odchozi@airbank.cz>", "odchozi\nse snížil");
  rec("kontrola-skupiny", C("zkontrolovatSkupinu", { skupina: skup }, T));
  rec("sbirka-skupina", C("sbirkaSkupina", { skupina: skup }, T));
  rec("sbirka-cast", C("sbirka", { colIndex: sb.data.sbirky[0].colIndex, tridaId: 11 }, T));
  rec("historie", C("historie", {}, T));
  rec("zprava", C("zprava", { id: "a0000101" }, T));
  rec("rucni-platba", C("rucniPlatba", { tridaId: 11, colIndex: sb.data.sbirky[0].colIndex, radek: 11, prijmeni: "Novák2", jmeno: "Jan2", castka: 100, poznamka: "hotově" }, T));
  var h = C("historie", {}, T); var rid = h.data.platby.filter(function(p) { return p.rucni; })[0].id;
  rec("rucni-platba-dvakrat", C("rucniPlatba", { tridaId: 11, colIndex: sb.data.sbirky[0].colIndex, radek: 11, prijmeni: "Novák2", jmeno: "Jan2", castka: 100 }, T));
  rec("smaz-rucni", C("smazRucniPlatbu", { id: rid }, T));
  rec("uprav-ucastnika", C("upravUcastnika", { tridaId: 11, colIndex: sb.data.sbirky[0].colIndex, radek: 12, prijmeni: "Novák3", jmeno: "Jan3", castka: 200 }, T));
  var nq = C("nahledOdeslani", { colIndex: sb.data.sbirky[0].colIndex, tridaId: 11, typ: "qr" }, T); rec("nahled-qr", nq);
  rec("odeslat-qr", C("odeslat", { token: nq.data.token, vyber: nq.data.prijemci.map(function(p) { return p.tridaId + ":" + p.radek; }) }, T));
  rec("odeslat-qr-znovu", C("odeslat", { token: nq.data.token, vyber: ["11:9"] }, T));
  var npk = C("nahledOdeslaniSkupiny", { skupina: skup, typ: "pripominka" }, T); rec("nahled-pripominka-skup", npk);
  var keepQuota = zbyvaGmailKvota_; zbyvaGmailKvota_ = function() { return 1; };
  var npk2 = C("nahledOdeslaniSkupiny", { skupina: skup, typ: "pripominka" }, T); rec("nahled-kvota", { zbyva: npk2.data.gmailZbyva, prijemci: npk2.data.prijemci.length });
  var odesBefore = __sent.length;
  rec("odeslat-kvota", C("odeslat", { token: npk2.data.token, vyber: npk2.data.prijemci.map(function(p) { return p.tridaId + ":" + p.radek; }) }, T));
  rec("odeslat-kvota-neodeslano", __sent.length - odesBefore);
  zbyvaGmailKvota_ = keepQuota;
  var odes2 = __sent.length;
  rec("odeslat-pripominky", C("odeslat", { token: npk.data.token, vyber: npk.data.prijemci.map(function(p) { return p.tridaId + ":" + p.radek; }) }, T));
  rec("odeslat-pripominky-pocet", __sent.length - odes2);
  // --- komu poslat: žákovi, rodičům, oběma
  var cA = sb.data.sbirky[0].colIndex;
  var n1 = C("nahledOdeslani", { colIndex: cA, tridaId: 11, typ: "qr" }, T);
  rec("nahled-komu", n1.data.prijemci.filter(function(p) { return p.radek >= 15; }).map(function(p) { return { radek: p.radek, emailZak: p.emailZak, emailRodice: p.emailRodice, jizZak: p.jizZak, jizRodic: p.jizRodic }; }));
  var p0 = __sent.length;
  rec("odeslat-bez-cile", C("odeslat", { token: n1.data.token, vyber: ["11:15"], cile: { zak: false, rodic: false } }, T));
  var n2 = C("nahledOdeslani", { colIndex: cA, tridaId: 11, typ: "qr" }, T);
  rec("odeslat-rodicum", C("odeslat", { token: n2.data.token, vyber: ["11:15", "11:16"], cile: { zak: false, rodic: true } }, T));
  rec("odeslat-rodicum-maily", __sent.slice(p0).map(function(m) { return { komu: m.to, predmet: m.subject, oslovení: /Dobrý den/.test(m.opts.htmlBody) ? "rodič" : "žák", jmeno: /za žáka <b>[^<]+<\/b>/.test(m.opts.htmlBody) }; }));
  var n3 = C("nahledOdeslani", { colIndex: cA, tridaId: 11, typ: "qr" }, T);
  rec("nahled-po-rodicich", n3.data.prijemci.filter(function(p) { return p.radek >= 15; }).map(function(p) { return { radek: p.radek, jizZak: p.jizZak, jizRodic: p.jizRodic, pocetOdeslani: p.pocetOdeslani }; }));
  var p1 = __sent.length;
  rec("odeslat-oboum", C("odeslat", { token: n3.data.token, vyber: ["11:15", "11:16"], cile: { zak: true, rodic: true } }, T));
  rec("odeslat-oboum-maily", __sent.slice(p1).map(function(m) { return m.to; }));
  rec("odeslane-radky", (function() { var l = __SS.getSheetByName("Odeslané e-maily"); var o = []; for (var r = 1; r <= l.getLastRow(); r++) { var x = l.getRange(r, 4, 1, 7).getValues()[0]; if (/Dvořák|Rodičovský|Komu/.test(String(x[1]) + String(x[6]))) o.push(String(x[1]) + " | " + x[3] + " | " + x[6]); } return o; })());
  rec("moje-zak", C("moje", {}, Z));

  // --- rodiče: e-mail ve sloupci F (rovnou), přes dítě (kód od dítěte), limity
  var lst = __SS.getSheetByName("2.A");
  rec("sloupec-F-import", [lst.getRange(7, 6).getValue(), lst.getRange(15, 6).getValue(), lst.getRange(16, 6).getValue()]);
  rec("reg-rodic-ve-sloupci", C("registrovat", { typ: "zak", jmeno: "Matka Dvořáková", email: "mama@x.cz" }));
  var rm = C("registraceOverit", { email: "mama@x.cz", kod: kod() }); rec("reg-rodic-ve-sloupci-overit", rm);
  rec("moje-rodic-ve-sloupci", C("moje", {}, rm.data.token));
  rec("reg-rodic-pres-dite", C("registrovat", { typ: "zak", jmeno: "Otec Nováků", email: "otec@x.cz" }));
  rec("reg-rodic-pres-dite-overit", C("registraceOverit", { email: "otec@x.cz", kod: kod() }));
  rec("dite-kod-aktivni-ucet", C("rodicDiteKod", { email: "mama@x.cz", diteEmail: "rodic2@x.cz" }));
  rec("dite-kod-neznama-adresa", C("rodicDiteKod", { email: "otec@x.cz", diteEmail: "nikdo@x.cz" }));
  var sentPred = __sent.length;
  rec("dite-kod", C("rodicDiteKod", { email: "otec@x.cz", diteEmail: "rodic2@x.cz" }));
  var mDite = __sent[__sent.length - 1]; rec("dite-mail", { komu: mDite.to, text: mDite.text.replace(/\d{6}/, "<KOD>"), poslano: __sent.length - sentPred });
  var kodD = kod();
  rec("dite-overit-spatny", C("rodicDiteOverit", { email: "otec@x.cz", kod: "000000" }));
  rec("dite-overit", C("rodicDiteOverit", { email: "otec@x.cz", kod: kodD }));
  rec("dite-overit-znovu", C("rodicDiteOverit", { email: "otec@x.cz", kod: kodD }));
  rec("sloupec-F-po-overeni", lst.getRange(11, 6).getValue());
  var lo = login("otec@x.cz"); rec("login-otec", lo.ok);
  rec("moje-otec", lo.data ? C("moje", {}, lo.data.token) : "nepřihlášen");
  rec("reg-rodic-limit", C("registrovat", { typ: "zak", jmeno: "Teta", email: "teta@x.cz" })); C("registraceOverit", { email: "teta@x.cz", kod: kod() });
  for (var li = 1; li <= 4; li++) rec("dite-limit-" + li, C("rodicDiteKod", { email: "teta@x.cz", diteEmail: "rodic3@x.cz" }));
  rec("dite-kod-se-sebou", C("rodicDiteKod", { email: "teta@x.cz", diteEmail: "teta@x.cz" }));
  rec("reg-rodic-3", C("registrovat", { typ: "zak", jmeno: "Strejda", email: "strejda@x.cz" })); C("registraceOverit", { email: "strejda@x.cz", kod: kod() });
  var s0 = __sent.length;
  rec("dite-adresa-rodice", C("rodicDiteKod", { email: "strejda@x.cz", diteEmail: "tata@x.cz" }));      // adresa rodiče (sloupec F) není adresa dítěte: kód nejde
  rec("dite-adresa-rodice-poslano-mailu", __sent.length - s0);

  rec("vse-admin", C("vse", {}, A)); rec("vse-ucitel", C("vse", { obnovit: true }, T)); rec("vse-zak", C("vse", {}, Z));
  rec("zak-zakaz", C("prehled", {}, Z));
  rec("nastaveni-admin", C("nastaveni", {}, A)); rec("profil-ucitel", C("profil", {}, T)); rec("informace", C("informace", {}, T));
  rec("schranky", C("schrankyStav", {}, A)); rec("mail-stav", C("mailStav", {}, A)); rec("diag-nepovolena", C("diagnostika", {}, A));
  rec("profil-uloz-ucitel", C("profilUlozit", { iban: "CZ7908000000002000145399", nazevUctu: "Třída 3.B", emailOznameni: "eva@skola.cz", adminId: C("stavPristupu").data.adminUcty[0].id, zobrazit: "Eva Učitelka" }, T));
  rec("ucty-2", C("ucty", {}, A));
  rec("nastavit-auto", C("nastavit", { klic: "auto", hodnota: true }, A));
  rec("nastavit-banky", C("nastavit", { klic: "bankyNavic", hodnota: "novabanka.cz" }, A));
  rec("zkus-banku", C("zkusitBankovniEmail", { text: __gmail.messages[0].body }, A));
  rec("auto-kontrola", (function() { try { automatickaKontrola(); return "ok"; } catch (e) { return "chyba: " + e.message; } })());
  rec("arch-bez-hesla", C("archivovatTridu", { tridaId: 22 }, T));
  rec("arch", C("archivovatTridu", { tridaId: 22 }, A));
  rec("tridy-arch", C("tridy", { zaci: true }, A)); rec("prehled-arch", C("prehled", {}, A));
  rec("zalozit-do-arch", C("zalozitSbirku", { nazev: "X", tridaId: 22, castka: 1 }, T));
  rec("obnov", C("obnovitTridu", { tridaId: 22 }, A));
  var ns = C("nahledSmazaniSbirky", { skupina: sb2.data.skupina }, A); rec("nahled-smaz-sbirku", ns);
  rec("smaz-sbirku-spatne-heslo", C("smazatSbirku", { token: ns.data.token, heslo: "spatne" }, A));
  rec("smaz-sbirku", C("smazatSbirku", { token: ns.data.token, heslo: "dlouheheslo123", smazatHistorii: true }, A));
  var nt = C("nahledOdstraneniZaku", { tridaId: 22, radky: [{ radek: 11 }] }, T); rec("nahled-odstr", nt);
  rec("odstr", C("odstranitZaky", { token: nt.data.token }, T));
  var np = C("nahledPresunuZaku", { tridaId: 11, cilTridaId: 22, radky: [{ radek: 15 }] }, T); rec("nahled-presun", np);
  rec("presun", C("presunoutZaky", { token: np.data.token }, T));
  rec("sloupec-F-v-cili-presunu", (function() { var l = __SS.getSheetByName("1.C"); var out = []; for (var r = 9; r <= 14; r++) out.push(l.getRange(r, 3).getValue() + " | " + l.getRange(r, 6).getValue()); return out; })());
  rec("prehled-konec", C("prehled", {}, T)); rec("zaci-konec", C("tridy", { zaci: true }, T));
  rec("odhlasit", C("odhlasit", {}, T)); rec("po-odhlaseni", C("prehled", {}, T));
  // bezpečnost: odesílatel, který jen obsahuje doménu banky
  banka("a0000201", ssA, "104", 150, "Phish <x@kb.cz.evil.example>"); banka("a0000202", ssA, "105", 150, "x@notairbank.cz");
  var A2 = login("admin@gmail.com", "dlouheheslo123").data.token;
  rec("kontrola-phishing", C("zkontrolovat", { tridaId: 11, colIndex: sb.data.sbirky[0].colIndex }, A2));
  rec("hist-po-phishingu", C("historie", {}, A2).data.platby.length);
  return { log: LOG, sent: __sent, stats: __stats, props: Object.keys(__props).sort() };
}
