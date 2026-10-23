# Třídní fond – instalace a provoz ve škole

Aplikace na evidenci třídních peněz: sbírky, QR platby pro rodiče, automatické párování plateb z e-mailů banky, historie a přehledy. **Každá škola má vlastní kopii** – data jsou v tabulce Google na účtu školy, autor aplikace k nim nemá přístup.

Návod počítá s tím, že nejste programátor. Celé nastavení zabere asi 45 minut.

---

## 1. Nejdůležitější pravidlo (přečtěte první)

> **Účet Google, pod kterým aplikaci nasadíte, musí být tentýž, na který chodí e-maily z banky o příchozích platbách.**

Proč: aplikace zjišťuje, kdo zaplatil, čtením bankovních e-mailů ve schránce Gmail. Google skriptu dovolí číst jen schránku toho, kdo ho nasadil – ne schránku toho, kdo se právě přihlásil. Aplikace to hlídá: první správce se musí zaregistrovat přesně e-mailem té schránky, jinak ho nepustí dál.

Dvě běžná řešení:
- **Nejjednodušší:** pořiďte pro fond vlastní účet (např. `trida-fond-skola@gmail.com`), do banky zadejte tuto adresu pro oznámení a pod tímto účtem všechno nainstalujte.
- **Školní Google Workspace:** použijte společný/funkční účet školy (ne osobní účet jednoho učitele – kdyby odešel ze školy, přijdete o přístup).

Přeposílání e-mailů z jiné schránky funguje také, ale přidává krok, který se může rozbít. Pokud ho použijete, zkontrolujte v kroku 7, že aplikace banku „vidí".

---

## 2. Co potřebujete

- účet Google (viz výše) s přístupem k Tabulkám a Apps Script,
- bankovní účet fondu, u kterého banka posílá **e-mail o každé příchozí platbě** (v internetovém bankovnictví zapnout „oznámení o příchozí platbě e-mailem"),
- bankovní účet musí v oznámení uvádět **specifický symbol** (aplikace podle něj pozná sbírku) a ideálně variabilní symbol (pozná žáka),
- odkaz na šablonu tabulky od autora aplikace.

---

## 3. Instalace krok za krokem

### Krok 1 – Zkopírujte šablonu
1. Otevřete odkaz na šablonu a přihlaste se účtem z kroku 1.
2. Pokud odkaz končí `/copy`, Google rovnou nabídne **Vytvořit kopii**. Jinak: **Soubor → Vytvořit kopii**.
3. Kopii pojmenujte např. „Třídní fond – ZŠ Název". Tohle je vaše tabulka, vaše data.

Skript se zkopíruje spolu s tabulkou. Uložená nastavení skriptu (účty, klíče, IBAN) se při kopii nepřenášejí, takže začínáte s čistým stavem.

### Krok 2 – Otevřete tabulku a povolte aplikaci
1. Obnovte stránku tabulky; po chvíli se v liště objeví menu **Třídní fond**.
2. V menu zvolte **Třídní fond → Adresa webové aplikace**. Při prvním použití se Google zeptá na oprávnění. Zvolte svůj účet. Pokud se objeví „Google neověřil tuto aplikaci": **Rozšířené → Přejít na … (nebezpečné) → Povolit**. Je to váš vlastní skript, proto to Google takhle hlásí.
3. Aplikace potřebuje číst a zapisovat tabulku, číst a štítkovat Gmail, posílat e-maily, vytvářet časové spouštěče a (volitelně) volat e-mailovou službu třetí strany. Oprávnění musí udělit **účet, který aplikaci nasazuje** – proto se to dělá před nasazením.
4. Kdyby se menu zobrazilo, ale nic se nestalo, zopakujte krok z menu ještě jednou (první pokus jen vyvolá dialog oprávnění).

### Krok 3 – Nasaďte webovou aplikaci
1. V editoru Apps Script: **Nasadit → Nové nasazení**.
2. Ozubené kolečko → **Webová aplikace**.
3. **Spustit jako: Já** (⚠ nikoli „uživatel, který přistupuje").
4. **Kdo má přístup: Kdokoli**. (Pokud váš Workspace „Kdokoli" zakazuje, zvolte „Kdokoli v organizaci" – pak se ale nepřihlásí rodiče s osobním Gmailem.)
5. **Nasadit** a zkopírujte **adresu webové aplikace**. Tu pošlete učitelům a rodičům. Později ji znovu najdete v menu **Třídní fond → Adresa webové aplikace**.

> „Kdokoli" neznamená, že data jsou veřejná. Do aplikace se dostane jen ten, kdo zadá e-mail a opíše kód, který na něj přijde, a kdo má v aplikaci účet s rolí (správci k tomu zadávají ještě heslo). Právě to „Spustit jako: Já" ale znamená, že všechno běží pod vaším účtem a jeho limity.

### Krok 4 – První spuštění: první správce
1. Otevřete adresu aplikace. Protože v ní ještě nikdo není, uvidíte **první spuštění**.
2. Vyplňte **název školy** a **web nebo symbol školy** (např. `jaroska.cz`, nebo RED-IZO / IZO / IČO – 6 až 10 číslic). Podle webu se aplikace **přizpůsobí vaší škole**: převezme z titulní stránky barvu a logo (pokud je web nabízí – jde o „best effort", když ne, zůstane výchozí vzhled) a ukáže název školy i na přihlašovací stránce. Se symbolem místo webu se vzhled nemění, ale škola je v aplikaci jednoznačně označená.
3. Vyplňte své **jméno** a **e-mail**. E-mail musí být **přesně adresa schránky, pod kterou jste aplikaci nasadili** (aplikace ukáže její zamaskovaný tvar, např. `tr***@gmail.com`).
4. Zadejte číslo účtu fondu (nebo IBAN). Podle něj se tvoří QR platby; stane se i výchozím účtem pro učitele, kteří svůj nezadávají. **Číslo účtu se při registraci ptá jen správce** – učitel ani rodič ho nezadává (vlastní účet si učitel může přidat později v Nastavení).
5. Zvolte si **heslo správce** (aspoň 10 znaků). Správci se do aplikace přihlašují kódem z e-mailu **a** tímto heslem; heslo budete zadávat i při citlivých akcích (mazání sbírek a tříd, změny správců – viz kapitola 4). Nikam se neposílá, na serveru je uložené jen v podobě otisku (hashe).
6. Přijde e-mail s šestimístným kódem. Opište ho. Jste **přihlášeni** jako **školní admin**. Tím se zároveň **tabulka připraví pro vaši školu**: pojmenuje se „Třídní fond – název školy" a založí se listy historie. Každá škola má tedy vlastní tabulku (vlastní kopii) – data nejsou nikde společná.

### Krok 5 – Ověřte napojení na banku
Nastavení → **Banka** → **Ověřit napojení na banku**. Aplikace prohledá schránku a ukáže poslední e-mail od banky a to, jestli mu rozumí (částka, symboly).

Ukáže, kolik e-mailů od banky ve schránce našla, a u posledního z nich od koho je, kdy přišel, jestli ho pozná jako příchozí platbu, jestli v něm našla částku, variabilní a specifický symbol.

- Všechno rozpoznáno → hotovo.
- Žádný e-mail od banky → buď chodí oznámení jinam (viz pravidlo v kroku 1), nebo zatím žádné nepřišlo. Pošlete si na účet testovací platbu 1 Kč.
- Něco chybí (částka, symboly) → viz kapitola Banky níže (tlačítko **Zkusit rozpoznat**).

### Krok 6 – Třídy a žáci
1. **Žáci a třídy → + Nová třída**, např. „5.A". První třída využije prázdný „List 1" v tabulce, další přidávají nové listy.
2. **Přidat žáky** – vložte (Ctrl+V) tabulku z Excelu/Tabulek: příjmení, jméno, e-mail (na něj půjde QR a připomínky – obvykle e-mail žáka nebo zákonného zástupce), volitelně **e-mail rodiče** (druhý sloupec s e-maily, v náhledu ho označte jako „E-mail rodiče“), variabilní symbol a výchozí částku. Chybějící variabilní symboly aplikace vygeneruje.
3. **Jak se dostane k platbám rodič.** Rodič se do aplikace přihlašuje **vlastním Gmailem** (záložka Registrace → Žák nebo rodič). Jsou tři cesty:
   - **E-mail rodiče je v tabulce** (sloupec F „E-mail rodiče“, až 4 adresy u žáka oddělené čárkou; vkládá se při přidání žáků, nebo se dopíše přímo v Tabulce): po registraci a kódu vstoupí hned.
   - **Ověření přes dítě:** rodič, jehož e-mail škola nemá, se po registraci zvolí „Ověřit se přes dítě“ a zadá e-mail žáka (ten, který je v tabulce ve sloupci E-mail). Kód přijde **dítěti**, to ho rodiči předá a rodič ho opíše. Adresa rodiče se pak sama zapíše do sloupce F u žáka a účet se aktivuje (přihlásí se kódem na svou adresu). Kód jde poslat jen třikrát za hodinu (a dítěti nejvýš čtyřikrát za 6 hodin) a odpověď je stejná, ať adresa žáka v tabulce je, nebo ne.
   - **Schválení správcem** v Nastavení → Účty a schvalování (když ani jedno nejde).
   Rodič vidí jen platby svého dítěte (nebo dětí, má-li ve více řádcích svůj e-mail). Ke každému žákovi lze v e-mailu žáka zadat i více adres oddělených mezerou, čárkou nebo středníkem.

### Krok 7 – Zkušební sbírka (doporučeno)
Založte sbírku jen pro sebe: jeden žák (vy nebo testovací záznam), částka 1 Kč. Pošlete si QR, zaplaťte, počkejte na e-mail od banky a stiskněte **Zkontrolovat platby teď**. Tím ověříte celou cestu. E-maily se vždy odesílají až po zobrazení náhledu a potvrzení – nikdy samy.

### Krok 8 – Pozvěte učitele a rodiče
- **Pozvánka (nejpohodlnější):** v **Nastavení → Účty a schvalování → + Pozvat učitele** napíšete e-mailové adresy (až 20 najednou, oddělené mezerou, čárkou nebo novým řádkem), vyberete roli (Učitel / Školní admin) a případně připíšete vzkaz. Nejdřív uvidíte **náhled** – komu a co se pošle – a teprve po vašem potvrzení se pozvánky odešlou. Pozvání **školního admina** potvrzujete navíc **svým heslem**. Pozvaný dostane e-mail s odkazem na aplikaci; účet na něj už čeká, takže se **nemusí registrovat ani čekat na schválení** – zadá svůj e-mail a opíše kód, který mu přijde. Účet vznikne až po úspěšném odeslání pozvánky. Kdo už účet má, přeskočí se.
- **Vlastní registrace:** učitel se zaregistruje sám (adresa aplikace → záložka **Registrace** → Učitel). Kód se při registraci **neposílá** (učitele stejně schvaluje školní admin a přihlašuje se kódem na tuto adresu). Školní admin ho **schválí** v **Nastavení → Účty a schvalování** a dotyčnému automaticky přijde e-mail, že registrace je dokončená a může se přihlásit.
- **Číslo účtu učitele:** učitel může zadat vlastní (nepovinně). Když ho nevyplní, platí účet **správce, kterého si vybere z nabídky**. Pokud se učitelův účet liší od účtu správce, aplikace napíše, na jakou adresu musí banka posílat oznámení o příchozích platbách (je to schránka, kterou aplikace čte), jinak by platby na jeho účet neviděla.
- **Rodiče a žáci** se zaregistrují e-mailem uvedeným v tabulce (e-mail žáka, nebo e-mail rodiče ve sloupci „E-mail rodiče“) a vstoupí hned. Rodič s jiným e-mailem se může **ověřit přes dítě** (kód na adresu žáka), ostatní čekají na schválení správcem.
- Kdo se pokusí přihlásit adresou, která v aplikaci **není registrovaná**, dostane srozumitelnou zprávu „Tento účet není registrovaný" a návod, co dál (registrace nebo pozvánka). Aplikace tím o neregistrované adrese prozradí, že ji nezná; počet takových pokusů je omezený (30 za 10 minut dohromady).
- Seznam účtů je ve výchozím stavu **seřazený do skupin**: Čekají na schválení → Nedokončená registrace → Vlastník → Školní admini → Učitelé → Žáci a rodiče → Zablokované. Pro stovky účtů je nad seznamem **hledání** (jméno, e-mail, role; funguje i bez diakritiky), **filtr podle stavu** (Čekají na schválení, Schválení, Zablokovaní…) a role a **řazení** (jméno, e-mail, role, nejnovější / nejstarší registrace, poslední přihlášení). Seznam ukazuje po 50 účtech, další se načtou tlačítkem „Zobrazit dalších“.

---

## 4. Role a práva

Přehled je i přímo v aplikaci (záložka **Informace**). Práva se vždy ověřují na serveru; tlačítka, která nesmíte použít, se jen skrývají.

| Role | Co smí |
|---|---|
| **Žák / rodič** | Vidí jen platby žáka, u kterého je jeho e-mail (e-mail žáka nebo e-mail rodiče) v tabulce, a QR kód k zaplacení. |
| **Učitel** | Zakládá třídy a sbírky, spravuje žáky, ručně zapisuje platby, spouští kontrolu plateb a rozesílá QR platby a připomínky (po potvrzení náhledu). |
| **Školní admin** | Vše výše + maže sbírky, archivuje a maže třídy, schvaluje registrace a zve učitele, mění role, nastavuje školu, schránky a e-maily, banky a automatiku. |
| **Vlastník** | Role tvůrce aplikace pro zkušební provoz; **nejde ji odebrat, změnit ani zablokovat** (ani správcem). Ve vaší kopii **neexistuje** – zanikla předáním. |

Role jsou jen čtyři (dřívější „finančník" a „kontrolor" zanikly): starší účty se při aktualizaci převedou samy – finančník, odesílání a zápis na **Učitele**, kontrolor a čtení na **Žáka / rodiče**, admin na **Školního admina**. Pokud jste dřív někomu dali jen čtení (např. řediteli), po aktualizaci uvidí jen „Moje platby" – případně ho povyšte na Učitele.

Doporučení: školní adminy mějte dva (záloha), běžné učitele jako **Učitel**.

### Přihlášení (od verze 5.2 jen e-mailem)
- **Všichni** se přihlašují **e-mailem a jednorázovým kódem**, který na e-mail přijde. Přihlášení „jménem a heslem" **už neexistuje**.
- **Školní admin** (a vlastník) po kódu zadá ještě **své heslo** (poprvé si ho nastaví). Rodič nebo učitel heslo nemá.
- Starý účet, který měl jen přihlašovací jméno bez e-mailu, se **nepřihlásí**. V Nastavení → Účty je označený „bez přihlášení". Odeberte ho a danou osobu pozvěte e-mailem.
- Zapomenuté heslo správce: v tabulce **Třídní fond → Přístup do aplikace → Obnovit heslo správce** (správce se přihlásí kódem a nastaví nové). Správce přidáte přes **Přidat správce**.

### Heslo při citlivých akcích
Pro vybrané akce aplikace znovu chce **vaše vlastní heslo** (ne heslo jiného uživatele) – kdyby někdo seděl u odemčeného počítače nebo se zmocnil přihlášení:
- **smazání sbírky**,
- **smazání třídy nadobro** (z archivu),
- **povýšení** učitele na školního admina, **snížení** admina, **zablokování / odblokování** admina, **schválení** čekajícího rovnou jako admina,
- **odebrání** školního admina,
- **pozvání** školního admina.

Špatné heslo akci neprovede a započítá se mezi pokusy o přihlášení (po pěti chybách se účet na čas zamkne). Akce, které nic nemažou, heslo nechtějí – např. **archivace třídy** (jde vrátit tlačítkem Obnovit).

### Konec školního roku: archiv tříd, mazání sbírek
- **Třídu, která skončila, nemažte – archivujte ji** (**Žáci a třídy → Archivovat třídu…**). Třída se schová z běžné práce (nelze z ní vybírat žáky do nových sbírek, neposílají se jí e-maily, nehledají se platby), ale **žáci i záznamy proběhlých sbírek zůstanou** a jdou prohlížet. Sbírky jsou v přehledu v oddílu **Archiv**, rodiče dál vidí svoje platby. Třídu lze kdykoli **Obnovit**. Nejde archivovat poslední aktivní třídu – nejdřív založte novou (např. „6.A").
- **Mazání třídy nadobro** jde jen z archivu (**Smazat nadobro…**): musíte opsat název třídy a zadat své heslo. Smaže se celý list třídy, tedy **i záznamy o tom, kdo kolik v jejích sbírkách zaplatil**. „Historie plateb" v tabulce a štítky v Gmailu zůstanou.
- **Smazání sbírky** (v detailu sbírky tlačítko **Smazat sbírku…**, jen školní admin): ukáže, v kterých třídách se smaže (i v archivovaných), kolik se vybralo, a chce heslo. Záznamy v **Historii plateb** a v přehledu odeslaných e-mailů **zůstanou**, dokud nezaškrtnete „Smazat také záznamy…". Štítek v Gmailu se nemaže nikdy.

---

## 5. E-maily, limity a služba třetí strany

Aplikace posílá dva druhy e-mailů:
1. **QR platby a připomínky žákům** – vždy z vašeho Gmailu, vždy až po potvrzení náhledu.
2. **Systémové e-maily** – přihlašovací kódy, pozvánky a upozornění „vše zaplaceno". Ty lze volitelně posílat přes službu třetí strany.

### Odkud a kam e-maily chodí (Nastavení → Schránky)
Tahle sekce na jednom místě ukazuje a umožňuje změnit všechno, co se změnit dá:

| Co | Odkud / kam | Jde změnit v aplikaci? |
|---|---|---|
| QR platby, připomínky, pozvánky odcházejí z | účtu Google, pod kterým je aplikace nasazená | **Jen jméno odesílatele, adresu pro odpovědi a (je-li v Gmailu nastaveno „Odesílat jako") alias.** Samotnou schránku určuje Google. |
| Bankovní oznámení o platbách aplikace čte ze schránky | účtu Google, pod kterým je aplikace nasazená | Ne (omezení Googlu). Změna = nasadit aplikaci pod jiným účtem (návod je přímo v sekci). |
| Banka posílá oznámení na | adresa uložená v nastavení | Ano – zapíšete adresu, kterou máte v bankovnictví. Aplikace **varuje, pokud nesouhlasí se schránkou, kterou čte**. |
| Zpráva „sbírka je celá zaplacená" chodí na | výchozí adresa (a adresy z profilů učitelů) | Ano. |
| Přihlašovací e-mail (kam chodí kódy při přihlášení) | e-mail uživatele | Ano: **Nastavení → Můj profil → Změnit přihlašovací e-mail** – kód přijde na novou adresu a po jeho zadání se účet přesune. Neplatí pro vlastníka. |

Pokud potřebujete mít **stejný účet pro přihlašování i čtení plateb**, změňte přihlašovací e-mail na adresu schránky aplikace (a naopak ji uveďte u banky) – aplikace vás na případný nesoulad upozorní.

Limity Googlu (Google je může změnit):
- běžný Gmail zhruba **100 e-mailů za den**,
- Google Workspace zhruba **1 500 za den**.

Aplikace si z kvóty nechává rezervu 15 e-mailů pro QR platby a omezuje kódy (nejvýš 6 na adresu za hodinu a 200 za 6 hodin), aby kódy nevyčerpaly kvótu. Ve větší škole (stovky rodičů) proto doporučujeme školní Workspace nebo službu třetí strany:

**Nastavení → E-maily → Odesílání kódů a upozornění** → Brevo nebo Resend → zadat e-mail odesílatele (ověřený ve službě) a API klíč → **Uložit** → **Poslat zkušební e-mail sobě**.

- Když služba e-mail odmítne, aplikace ho pošle záložně přes Gmail – přihlášení nepřestane fungovat.
- API klíč se ukládá jen na serveru (ve vlastnostech skriptu), do prohlížeče se nevrací.
- ⚠ **Napojení na Brevo a Resend je napsáno podle jejich dokumentace, ale nebylo ověřeno na živém účtu.** Vždy použijte tlačítko „Poslat zkušební e-mail sobě" a výsledek zkontrolujte.
- Přes službu třetí strany tedy půjde adresa příjemce a text zprávy (kód; u „vše zaplaceno" název sbírky a součty, odkaz na tabulku). Jména žáků ne. Zvažte to v GDPR (viz `PRAVNI_SABLONY.md`).

QR e-maily žákům odcházejí vždy z vašeho Gmailu, nikdy přes službu třetí strany.

---

## 6. Banky

Aplikace čte e-maily od těchto bank: Air Bank, Fio, Česká spořitelna, Komerční banka, ČSOB, MONETA, Raiffeisenbank, mBank, Creditas, UniCredit, Equa, Trinity, Oberbank, Partners, PPF banka. Další doménu odesílatele přidáte v **Nastavení → Banka → Další domény bank**.

Poctivě:
- Formát e-mailu se liší banka od banky a banky ho občas mění. **Spolehlivě ověřený je jen Air Bank** (podle skutečného e-mailu). U ostatních bank je rozpoznávání obecné a **musíte ho ověřit** tlačítkem „Ověřit napojení na banku" nebo vložením skutečného e-mailu do „Zkusit rozpoznat".
- **Bez specifického symbolu v oznámení banky platbu nelze spárovat se sbírkou** – to aplikace sama nevyřeší. Banky, které SS v oznámení neuvádějí, aplikaci nepodporují (nespárované platby se zobrazí v přehledu; platbu lze zapsat ručně).
- Pokud vaše banka nefunguje, pošlete autorovi text e-mailu (bez citlivých údajů) a rozpoznávání se upraví.

---

## 7. Automatická kontrola plateb

Menu **Třídní fond → Zapnout automatickou kontrolu** (každou hodinu). Automatika jen značí zaplacené platby a zapisuje historii. **Nikdy sama nerozesílá e-maily žákům ani rodičům.** Pošle jen upozornění „vše zaplaceno" na adresu z profilu majitele sbírky.

---

## 8. Aktualizace

Ve škole běží vaše kopie, takže se nová verze **nenainstaluje sama** – a nikdo další na ni nemá vliv. To je záměr (data i chod zůstávají u vás).

Jak aktualizovat:
1. Od autora dostanete nové soubory `tridni_fond.gs`, `webapp.gs` a `Index.html` + poznámku k verzi.
2. V Apps Scriptu otevřete stejnojmenné soubory a **celý obsah nahraďte** novým. Data v tabulce a nastavení zůstávají.
3. **Nasadit → Spravovat nasazení → ✎ upravit → Verze: Nová verze → Nasadit.** (Bez tohoto kroku webová aplikace dál běží ve staré verzi!)
4. Verzi uvidíte v aplikaci v záložce **Informace** a v Nastavení.
5. Od verze 5 je v Nastavení sekce **Schránky**: po aktualizaci si ji projděte a zkontrolujte adresy (banka, „vše zaplaceno", odesílatel).
6. **Z verze 5.1 na 5.2:** nic se v tabulce nepřevádí. Správci se přihlašují jako dřív (e-mail, kód, heslo), jen přibyla hesla u citlivých akcí, tlačítko **Smazat sbírku**, **archiv tříd** a zmizelo přihlášení jménem a heslem (viz kapitola 4). Třída, kterou jste dřív mazali, se nově nejdřív archivuje.

Proč ne „knihovna" (jedna verze pro všechny školy)? Knihovna by znamenala, že vaše škola závisí na účtu autora – a to je přesně to, čemu se tato varianta vyhýbá. Webové stránky aplikace (HTML) se navíc z knihovny nedají načíst. Pokud byste ji přesto chtěli, vyžaduje to technickou pomoc.

**Rychlost a čerstvost dat:** po přihlášení si aplikace na pozadí načte všechno najednou, takže přepínání mezi stránkami nečeká. Pro rychlé čtení tabulky zapněte v Apps Scriptu službu **Google Sheets API** (Služby → + → Google Sheets API → Přidat); bez ní aplikace funguje, jen je pomalejší. Server si navíc na dvě minuty pamatuje, co přečetla z tabulky. Všechno, co děláte v aplikaci (zápisy, schvalování, odesílání), tuto paměť hned zahodí. Pokud ale něco změníte přímo v samotné tabulce Google, projeví se to v aplikaci nejpozději za dvě minuty, nebo hned po stisknutí tlačítka **Obnovit** v záhlaví.

**Zálohy:** tabulka je soubor na Disku Google. Čas od času **Soubor → Historie verzí → Pojmenovat aktuální verzi**, případně **Soubor → Stáhnout → .xlsx**.

---

## 9. Řešení potíží

| Příznak | Příčina / řešení |
|---|---|
| Nepřichází přihlašovací kód | Zkontrolujte složku Spam. V Nastavení → E-maily je „Poslední potíž s odesíláním". Možná došla denní kvóta Gmailu (100) – kódy se pak nepošlou do druhého dne; použijte Workspace nebo službu třetí strany. |
| „Tento účet není registrovaný" | Adresa v aplikaci nemá účet. Zaregistrujte se v záložce Registrace, nebo požádejte školního admina o pozvánku (Nastavení → Účty a schvalování → + Pozvat učitele). |
| Pozvánka se neodeslala | V okně s výsledkem je u adresy důvod (typicky vyčerpaná denní kvóta Gmailu). Účet se pro ni nevytvořil – zkuste to znovu později. |
| „Aplikace čte bankovní e-maily jen ze schránky …" | Porušení pravidla z kroku 1. Nasaďte aplikaci pod správným účtem nebo nastavte přeposílání bankovních e-mailů. |
| „Aplikace zatím nezná tabulku" | Otevřete tabulku v prohlížeči a počkejte, až se objeví menu Třídní fond; pak obnovte aplikaci. |
| Platba nepřišla do přehledu | Ověřte napojení na banku. Platbu bez SS nebo s cizím SS aplikace nespáruje – je v „Nespárované platby". |
| Po úpravě kódu se nic nezměnilo | Chybí „Nová verze" nasazení (krok 8, bod 3). |
| Rodič se nedostane dál | Jeho e-mail není v tabulce u žádného žáka (ani ve sloupci „E-mail rodiče“). Může se ověřit přes dítě (Registrace → Ověřit se přes dítě), jinak čeká na schválení v Nastavení → Účty a schvalování. |
| Aplikace hlásí chybu oprávnění, nenačte se nebo se chová divně, i když je všechno správně | Je-li v prohlížeči přihlášeno **víc účtů Google najednou**, Google u webových aplikací Apps Script někdy zvolí špatný účet a ověření selže. Otevřete aplikaci v **anonymním okně** a přihlaste se jen jedním účtem (nebo ostatní účty v prohlížeči odhlaste). V anonymním okně to funguje spolehlivě. |
| Při rozesílání QR e-mailů se ukáže, že dnes už nejde odeslat víc | Narazili jste na **denní limit odesílání Gmailu** (běžný účet cca 100 e-mailů za den, školní Google Workspace cca 1 500). Odškrtněte část příjemců (třeba jen rodiče nebo jen žáky) a zbytek pošlete další den, nebo použijte placený účet s vyšším limitem. |
| Účet zablokovaný po špatných kódech nebo heslech | Menu Třídní fond → Přístup do aplikace → Odhlásit všechny a odemknout přihlašování. |
| Správce zapomněl heslo | Menu Třídní fond → Přístup do aplikace → Obnovit heslo správce. Správce se pak přihlásí kódem a nastaví nové. |
| Starý účet (jméno a heslo) se nepřihlásí | Od verze 5.2 se přihlašuje jen e-mailem. Účet odeberte a danou osobu pozvěte e-mailem (Nastavení → Účty a schvalování). |
| Nejde archivovat třídu | Je to poslední aktivní třída. Nejdřív založte novou třídu. |
| Po smazání sbírky zůstaly platby v „Historii plateb" | Záměr: přijaté platby zůstanou v historii, dokud při mazání nezaškrtnete „Smazat také záznamy…". |

---

## 10. Co aplikace neumí / na co dát pozor

- Je to skript v Google Apps Script, ne certifikovaný bankovní nebo účetní systém. **Neslouží k účetnictví** a **není zdrojem pravdy o penězích** – tím je výpis z banky. Aplikace je pomůcka pro přehled.
- Platby se zjišťují z e-mailů, ne z banky přímo. Zpožděný, chybějící nebo změněný e-mail banky = chybějící platba.
- Quoty a limity (e-maily, doba běhu, počet volání) stanovuje Google a mohou se měnit.
- **Denní limit e-mailů je tvrdý.** Zdarma (běžný Gmail) je to zhruba 100 e-mailů za den, ve školním Google Workspace zhruba 1 500. Počítá se každý příjemce zvlášť, takže rozeslání QR žákům **i** rodičům spotřebuje dvojnásobek. Pro větší školu je potřeba účet s vyšším limitem, nebo omezit rozesílání (jen rodiče, jedna sbírka za den). Aplikace si hlídá, kolik e-mailů dnes ještě zbývá, a nedovolí poslat víc.
- **Platby se čtou z e-mailů banky, ne z banky.** Bankovní API, které by dalo transakce přímo, banky obvykle nabízejí jen licencovaným firmám (PSD2) nebo za poplatek, takže pro bezplatnou aplikaci zbývá číst oznámení o příchozích platbách ze schránky. Z toho plyne, že aplikace nepozná platbu, o které banka e-mail neposlala.
- **Víc přihlášených účtů Google v jednom prohlížeči** dělá u webových aplikací Apps Script potíže (viz Řešení potíží): používejte anonymní okno.
- Aplikace byla testována simulovaným prostředím Apps Script a v prohlížeči Chromium; na živé škole ji nejdřív vyzkoušejte s malou testovací sbírkou. Totéž platí pro **archivaci a mazání tříd a sbírek** – nejdřív si je zkuste na zkušební třídě.
- **Jedna kopie = jedna škola.** Aplikace nemá víc škol v jedné tabulce ani výběr školy při přihlášení; kdo spravuje víc škol, má pro každou svou kopii a svou adresu aplikace.
- Osobní údaje dětí: viz `PRAVNI_SABLONY.md`. Škola je jejich správcem a odpovídá za vyplnění a schválení těch dokumentů.
