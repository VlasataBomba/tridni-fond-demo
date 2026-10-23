# Změny

## 5.10
- **Rodiče se přihlašují vlastním Gmailem.** Dřív se rodič dostal k platbám jen e-mailem, který byl v tabulce u žáka (tedy typicky e-mailem dítěte). Ve třídě je teď sloupec **F „E-mail rodiče“** (až 4 adresy u žáka); při vkládání žáků ho vyplníte druhým sloupcem s e-maily (aplikace ho pozná podle záhlaví nebo druhého sloupce) nebo ho dopíšete přímo v Tabulce. Rodič se zaregistruje svým Gmailem a vstoupí hned. Sloupce A–E a sbírky od G zůstaly, takže starší tabulky fungují beze změny (záhlaví nad F se doplní při prvním zápisu).
- **Ověření přes dítě.** Rodič, jehož e-mail škola nemá, v Registraci zvolí „Ověřit se přes dítě“ a zadá e-mail žáka. Kód přijde **dítěti**, to ho rodiči předá a rodič ho opíše; adresa rodiče se zapíše do sloupce F a účet se aktivuje (přihlásí se pak běžným kódem na svou adresu – kód od dítěte sám žádnou relaci nevydává). Omezení: 3 kódy za hodinu na rodiče a 4 kódy za 6 hodin na adresu dítěte, odpověď je stejná, ať adresa žáka v tabulce je, nebo ne; jako „dítě“ nejde zadat adresu rodiče.
- Seznam žáků ukazuje e-mail rodiče; při přesunu žáka do jiné třídy se e-mail rodiče přenese s ním.
- **QR platby a připomínky jde poslat žákům, rodičům, nebo oběma.** V náhledu odeslání jsou nad tabulkou dvě zaškrtávátka „Žákům“ a „Rodičům“ (lze obojí) a v tabulce vidíte e-mail žáka i rodičů a komu už co odešlo. Předvybere se jen ten, kdo e-mail ještě nedostal. Rodič dostane vlastní e-mail s oslovením „Dobrý den“ a jménem žáka (předmět „Platba: sbírka – jméno žáka“). Žák bez vlastního e-mailu, ale s e-mailem rodiče, se do náhledu dostane taky. Limit Gmailu se počítá po adresách, takže rozeslání oběma spotřebuje víc. Na listu „Odeslané e-maily“ přibyl sloupec „Komu“ (starší listy ho dostanou samy); z menu tabulky se dál posílá jen žákům.
- Nové: složka `testy/` – celý scénář aplikace v simulovaném prostředí Google (`node run.js .. vysledek.json`) a sestavení samostatné ukázkové stránky se smyšlenými daty (`node sestav_demo.js`).
- Migrace: žádná. Po nahrazení souborů udělejte **novou verzi nasazení** (u šablony se nenasazuje).

## 5.9
Celková kontrola a úklid kódu. Funkce zůstávají stejné; ověřeno testovacím scénářem (registrace, přihlášení, třídy, sbírky, platby z Gmailu, ruční platby, rozesílání, archiv, mazání), který dává před úpravami i po nich stejné výsledky – kromě změn uvedených níže. QR kódy z e-mailů se navíc dekódují nezávislou čtečkou a obsahují správný IBAN, VS, SS i částku.
- **Ověření odesílatele banky je přísnější.** Dřív stačilo, aby se text domény banky objevil kdekoli v hlavičce „Od“ – prošla by tedy adresa typu `x@kb.cz.neco.example` nebo `x@notairbank.cz`. Teď musí být doména odesílatele přesně doménou banky nebo její poddoménou (`info.airbank.cz`).
- **Denní limit Gmailu při rozesílání.** Náhled odeslání ukáže, kolik e-mailů Google dnes ještě dovolí (u běžného Gmailu cca 100, u školního účtu cca 1 500). Když vybíráte víc, tlačítko Odeslat se zamkne, dokud část příjemců neodškrtnete; server navíc pošle buď všechno, nebo nic (dřív by zbytek po vyčerpání limitu tiše selhal).
- **Rychlejší první načtení stránky:** dotaz na stav přihlášení (první, co aplikace po otevření udělá) čte vlastnosti skriptu 6× místo 17×.
- **Velké školy:** předčítání „všeho najednou“ se omezilo na nejnovější sbírky (do cca 1,4 MB dat); starší se načtou až při otevření, jako dřív. Při 200 sbírkách tím balík klesl z 9,4 MB na 2,3 MB (a z ~1,6 s na ~0,45 s práce serveru) a vejde se do mezipaměti. Na malé a střední školy to nemá vliv.
- **Kontrola kódu při přihlášení** počítá špatné pokusy pod zámkem, takže pět pokusů na kód nejde obejít souběžnými požadavky.
- **„Moje platby“** (žák/rodič) už nerozebírá třídy, kde jeho e-mail u žádného žáka není. Přidání žáků do třídy a automatická kontrola čtou méně dat; texty stavů buněk se nepřekompilovávají.
- Úklid: odstraněny nepoužívané funkce a proměnné (server i rozhraní), v odpovědi serveru už není zbytečné jméno přihlášeného uživatele (mezipaměť přehledu je sdílená podle role).
- Migrace: žádná. Po nahrazení souborů udělejte **novou verzi nasazení** (u šablony se nenasazuje).

## 5.8
- **Vzhled se pamatuje a přepíná správně.** Ve vloženém okně Apps Scriptu je úložiště prohlížeče zablokované, takže se zvolený vzhled neukládal a aplikace se pořád chovala „podle zařízení“. Vzhled se teď drží v paměti stránky a ukládá se **u účtu** (nová akce `temaUlozit`), takže po přihlášení platí na každém zařízení.
- **Tlačítko v záhlaví** se střídá: ☾ přepne na tmavý vzhled a ukáže ☀, ☀ vrátí světlý vzhled a ukáže ☾.
- **Nastavení je rozdělené do rozklikávacích sekcí:** Účty a schvalování (rozbalené, když někdo čeká na schválení), Škola, Číslo účtu a profil, Banka a automatická kontrola, E-maily a schránky, Pokročilé. Nahoře zůstává „Přihlášen jako“ a Vzhled. Co je rozbalené, si stránka pamatuje.
- Migrace: žádná. Po nahrazení souborů udělejte **novou verzi nasazení** (u šablony se nenasazuje).

## 5.7
- **Tmavý vzhled:** v Nastavení je nová karta **Vzhled** (Podle zařízení / Světlý / Tmavý) a v záhlaví tlačítko ☾ / ☀ pro rychlé přepnutí, které vidí i žáci a rodiče (ti Nastavení nemají). Volba se pamatuje v daném prohlížeči. Výchozí je dál podle zařízení. Barva školy se respektuje v obou vzhledech.
- **Mobil:** oranžový proužek „QR neodesláno“ u žáka byl uvnitř textu a překrýval první písmena jména. Na telefonu je teď na levém okraji celé karty žáka, text je odsazený. Na počítači se nic nemění.
- Migrace: žádná. Po nahrazení souborů udělejte **novou verzi nasazení** (u šablony se nenasazuje).

## 5.6
- **Více ručních plateb po sobě:** každý žák se přepne z tmavě zeleného „zapisuje se“ na běžný stav ve chvíli, kdy doběhne zápis právě jeho platby. Ostatní žáci, kteří se ještě zapisují, zůstávají označení, takže je vidět, že se ověřují. Dřív se po dokončení prvního zápisu mohla zobrazená data přepsat starším stavem ze serveru a ostatní žáci „zmizeli“.
- Načtení ze serveru, které začalo dřív než místní změna, už tuto změnu nepřepíše (týká se detailu sbírky, třídy i přehledu). Po posledním zápisu se data jednou načtou ze serveru a srovnají.
- Migrace: žádná. Po nahrazení souborů udělejte **novou verzi nasazení**.

## 5.5
- **Ruční platba je vidět hned.** Po zapsání se žák na obrazovce okamžitě přepne na „zaplaceno“ **tmavě zelenou** se symbolem zápisu, přepočtou se součty a okno se zavře. Do tabulky se zapisuje na pozadí a po dokončení se štítek sám změní na běžnou zelenou. Při chybě se stav vrátí a ukáže se důvod. Totéž platí pro smazání ruční platby a změnu částky nebo vyřazení žáka. Více změn po sobě se do tabulky zapisuje ve stejném pořadí.
- **Nová třída, přidání žáků a nová sbírka bez čekání.** Třída (a okno pro přidání žáků) se otevře hned, žáci se ve třídě ukážou hned, nová sbírka se v přehledu ukáže jako karta „zakládá se…“. Server po založení sbírky vrací rovnou hotový detail, takže se po dokončení otevře bez dalšího načítání. Přejmenování třídy je také okamžité.
- Okna „Přidat žáky“ a „Nová sbírka“ se otevírají z dat v paměti stránky, bez čekání na server.
- Po zápisech, které nic nemažou, zůstávají zobrazená data v paměti stránky (jen zastarají a obnoví se na pozadí), takže se po změně nenačítá celá stránka znovu. Po mazání, archivaci a přesunech se paměť zahodí.
- Migrace: žádná. Po nahrazení souborů udělejte **novou verzi nasazení**.

## 5.4
- **Nikde se nečeká:** po přihlášení se na pozadí jedním dotazem načte všechno (přehled, žáci a třídy, historie, detail každé sbírky, moje platby, informace, nastavení). Přepínání mezi stránkami a otevření sbírky pak nevolá server. Po každé změně se paměť na pozadí znovu naplní. Nový serverový dotaz `vse` čte tabulku přes **Sheets API** (všechny třídy jedním dotazem, v živém testu z desítek čtení na dvě); když Sheets API není zapnuté nebo selže, použije se běžné čtení a výsledek je stejný.
- **Učitel zadává číslo účtu (nepovinně):** při registraci i v profilu. Když ho nevyplní, platí účet správce, kterého si vybere z nabídky (jinak první správce). Jinak se použije jeho vlastní.
- **Když se účet učitele liší od účtu správce**, aplikace u čísla účtu napíše, na jakou adresu musí banka posílat oznámení o příchozích platbách (adresa schránky, kterou aplikace čte). Vidí to přihlášený učitel v profilu, správce v seznamu účtů i v profilu učitele a učitel to dostane v e-mailu po schválení. Nepřihlášeným se adresa neukazuje, v registraci je jen obecná poznámka.
- **Registrace učitele bez kódu:** kód nic neověřoval (učitele stejně schvaluje správce a přihlašuje se kódem na tuto adresu), proto se neposílá. Registrace je rovnou čekající a omezená na 30 za hodinu. Žák a rodič kód dostávají dál.
- **E-mail po schválení:** když správce schválí čekající účet, dotyčný dostane e-mail, že registrace je dokončená a může se přihlásit. Pokud odeslání selže, správce to uvidí a účet zůstane schválený.
- **Tlačítka podle práv:** žák a rodič už nevidí tlačítko Obnovit (načítá data z tabulky). Ostatní tlačítka byla zkontrolována, učitel nevidí správcovské.
- Migrace: v Apps Scriptu musí být zapnutá služba **Google Sheets API** (Služby → +). Bez ní vše funguje, jen pomaleji. Po nahrazení souborů udělejte **novou verzi nasazení**.

## 5.3 – rychlost
Měření v živém projektu ukázalo, že čas se neztrácí na hesle ani na vlastnostech skriptu (desítky ms), ale na čtení Tabulek: každé volání stojí 100 až 700 ms a přehled jich dělal desítky.
- **Čtení tabulky:** celý list třídy se načte jedním čtením místo šesti (výsledek je shodný, ověřeno na 1000 náhodných listech). Stejně historie plateb a přehled odeslaných e-mailů.
- **Mezipaměť na serveru (2 min):** výsledky čtení (přehled, sbírky, žáci, historie, nastavení, moje platby) se odloží. **Každá akce, která může něco změnit, mezipaměť okamžitě zneplatní**, stejně tak automatická kontrola a menu tabulky. Oprávnění se kontrolují vždy, i když odpověď přijde z mezipaměti. Úpravy provedené přímo v tabulce se projeví nejpozději za 2 minuty; tlačítko **Obnovit** mezipaměť obejde.
- **Rozhraní:** stránky se ukážou hned z posledních známých dat a čerstvá se dotáhnou na pozadí (tenký pruh nahoře), stránka bez dat se přepne na kostru okamžitě. Obrazovka se při načítání už nezamyká. Přehled se při startu načítá souběžně s ověřením přihlášení, žáci a historie se předčítají na pozadí.
- **Změny na pozadí:** schválení, role, blokace a odebrání účtu, ruční platba, úprava částky a smazání ruční platby se v rozhraní projeví hned a server je dostane na pozadí (jedna po druhé). Při chybě se zobrazí hláška a data se načtou znovu podle serveru. Akce s heslem, odesíláním e-mailů a kontrola plateb dál čekají na výsledek.
- Migrace: žádná. Po nahrazení souborů udělejte **novou verzi nasazení**.

## 5.2
- **Přihlášení jménem a heslem zrušeno.** Všichni se přihlašují e-mailem a kódem, správci po kódu ještě heslem. Účty bez e-mailu (jen jméno) se nepřihlásí, v seznamu účtů jsou označené „bez přihlášení“; odeberte je a pozvěte e-mailem.
- **Heslo správce u citlivých akcí:** smazání sbírky, trvalé smazání třídy, povýšení, degradace, blokace a odebrání správce, pozvání a schválení správce. Špatné heslo se počítá do stejného zámku jako přihlášení.
- **Archiv tříd:** skončenou třídu archivujte (jen ke čtení, záznamy sbírek zůstanou). Trvalé smazání jde jen z archivu (opsat název + heslo). Poslední aktivní třídu nelze archivovat.
- **Smazání sbírky** (náhled, potvrzení, heslo). Historie plateb a seznam odeslaných e-mailů zůstanou, pokud výslovně nezaškrtnete jejich smazání; štítky v Gmailu se nemažou.
- Migrace: žádná. Po nahrazení souborů udělejte **novou verzi nasazení**.

## 5.1
- **Správce se přihlašuje kódem z e-mailu a heslem.** Platí pro školního admina a vlastníka. Heslo se zadává při registraci prvního správce; pozvaný nebo povýšený správce si ho nastaví při prvním přihlášení. Samotné heslo správci nestačí (druhý krok po kódu), změna hesla funguje i u vlastníka. Zapomenuté heslo obnoví menu tabulky *Obnovit heslo správce*.
- **Role finančník** už se nikde nenabízí ani nezmiňuje; staré účty se dál samy převedou na učitele (`STARE_ROLE`).
- **Číslo účtu se při registraci ptá jen správce.** Učitel a žák ho nezadávají, QR platby se jim tvoří z výchozího účtu (nastaví se z účtu prvního správce).
- **Účty a schvalování:** hledání (bez diakritiky), filtr podle stavu a role, řazení (jméno, e-mail, role, registrace, poslední přihlášení), stránkování po 50 účtech.
- **Neregistrovaný účet:** hláška „Tento účet není registrovaný“ se ukáže hned při zadání e-mailu (před odesláním kódu) i při přihlášení jménem a heslem; účet čekající na schválení to řekne také hned a kód mu neposílá. Pod polem pro e-mail je o tom věta.
- Migrace: žádná. Po nahrazení souborů udělejte **novou verzi nasazení**.
