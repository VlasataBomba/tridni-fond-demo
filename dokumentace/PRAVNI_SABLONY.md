# Právní a GDPR šablony pro školy (Třídní fond)

> **Upozornění.** Tohle jsou **šablony a pracovní podklady, ne právní poradenství.** Autor aplikace není advokát. Před použitím je nechte projít **pověřencem pro ochranu osobních údajů** (DPO) vaší školy nebo právníkem. Vše v hranatých závorkách `[...]` vyplňte nebo smažte. Odkazy na předpisy jsou obecné; ověřte jejich aktuální znění.
>
> Nejdřív přečtěte část A (kdo za co odpovídá). Odpovědnost za zákonnost zpracování nese **provozovatel** (škola, případně spolek rodičů) – ne autor aplikace.

---

## A. Kdo je kdo (a proč na tom záleží)

| Subjekt | Role podle GDPR | Poznámka |
|---|---|---|
| **Škola** (nebo spolek rodičů, který fond provozuje) | **Správce** | Rozhoduje, proč a jak se údaje zpracovávají. Odpovídá za informování rodičů, právní základ, bezpečnost a lhůty uložení. |
| **Google** (Tabulky, Gmail, Apps Script) | **Zpracovatel** (nebo samostatný správce u spotřebitelského účtu) | Údaje leží v účtu školy u Googlu. Pro Google Workspace for Education / Workspace uzavřete a uchovejte **dodatek o zpracování údajů** (Data Processing Amendment) – u Workspace se obvykle přijímá v administrátorské konzoli. U osobního Gmailu (`@gmail.com`) tuto jistotu **nemáte** – zvažte to (viz sekce E). |
| **Brevo / Resend** (jen pokud zapnete) | **Zpracovatel** | Dostávají adresu příjemce a text systémového e-mailu (kód, „vše zaplaceno"). Uzavřete s nimi smlouvu o zpracování a ověřte sídlo a předávání údajů mimo EU. |
| **Autor aplikace** | **Není zpracovatel – pokud nemá přístup k vašim datům** | Aplikace běží ve vašem účtu, autor k datům nemá přístup. **Jakmile by autor přístup získal** (účet vlastníka ve vaší kopii, správa na dálku, podpora s přihlášením), stává se zpracovatelem a je potřeba smlouva o zpracování. Proto se role „vlastník" před předáním ruší (viz `PRO_AUTORA_PREDANI.md`). |

---

## B. Podmínky použití aplikace (šablona licenční smlouvy autor – škola)

**Podmínky použití aplikace „Třídní fond"**

Verze [číslo/datum]. Poskytovatel: [jméno autora, adresa / IČO]. Uživatel: [název školy / spolku, IČO, adresa].

1. **Předmět.** Poskytovatel poskytuje uživateli nevýhradní, nepřenosné právo používat zdrojový kód aplikace „Třídní fond" (soubory `tridni_fond.gs`, `webapp.gs`, `Index.html`) pro vlastní potřebu uživatele při evidenci třídních peněz. [Odměna: bezplatně / [částka]. Doba: na dobu neurčitou / [doba].]
2. **Provoz.** Uživatel si aplikaci sám zkopíruje a nasadí ve svém účtu Google podle návodu. **Poskytovatel aplikaci neprovozuje, nehostuje a nemá k datům uživatele přístup.** Všechna data jsou v účtu uživatele.
3. **Povinnosti uživatele.** Uživatel (a) odpovídá za správnost údajů a za to, že má pro jejich zpracování právní základ; (b) odpovídá za účty a role v aplikaci; (c) zabezpečuje svůj účet Google (silné heslo, dvoufázové ověření); (d) před rozesláním e-mailů kontroluje náhled; (e) ověřuje stav plateb vůči výpisu z banky.
4. **Omezení použití.** Aplikace není účetní systém ani platební služba, platby jen eviduje na základě e-mailů banky. Uživatel nesmí kód vydávat za vlastní dílo a [nesmí ho dále šířit třetím osobám bez souhlasu poskytovatele / smí ho šířit v rámci své školy].
5. **Bez záruky.** Aplikace se poskytuje „tak, jak je". Poskytovatel nezaručuje bezchybnost ani dostupnost; aplikace závisí na službách Google a na formátu e-mailů banky, které poskytovatel nemůže ovlivnit. [Případné aktualizace a podpora: v rozsahu [..] / bez nároku.]
6. **Odpovědnost.** [Odpovědnost poskytovatele za škodu je omezena na [částka / cenu za poskytnutí aplikace], pokud to zákon dovoluje.] **Poznámka pro právníka:** možnost omezit či vyloučit odpovědnost je v českém právu omezená (zejména u škody způsobené úmyslně nebo z hrubé nedbalosti, u bezplatných licencí se posuzuje jinak) – tuto klauzuli nechte právně posoudit.
7. **Osobní údaje.** Poskytovatel osobní údaje uživatele nezpracovává. Pokud by mu uživatel zpřístupnil data (např. při řešení závady), uzavřou strany předem smlouvu o zpracování osobních údajů dle čl. 28 GDPR.
8. **Ukončení.** Uživatel může aplikaci kdykoliv přestat používat a smazat. [Poskytovatel může právo užívání vypovědět při závažném porušení podmínek.]
9. **Rozhodné právo.** Právo České republiky. [Příslušný soud.]
10. **Změny.** Nové verze aplikace se řídí těmito podmínkami, pokud se strany nedohodnou jinak.

V [místo] dne [datum] · [podpis poskytovatele] · [podpis uživatele]

---

## C. Informace o zpracování osobních údajů (pro rodiče a žáky – šablona dle čl. 13 GDPR)

**Informace o zpracování osobních údajů při evidenci třídních peněz**

**1. Správce.** [Název školy / spolku rodičů], IČO [..], adresa [..], e-mail [..]. Pověřenec pro ochranu osobních údajů: [jméno, kontakt] / [nebyl jmenován].

**2. Jaké údaje zpracováváme.**
- žák: jméno, příjmení, třída, variabilní symbol (přidělené číslo pro platby), částky sbírek a stav jejich úhrady;
- zákonný zástupce (nebo žák): e-mailová adresa (u žáka ve sloupci „E-mail rodiče“; zapíše ji učitel, nebo se zapíše po ověření dítětem) a – při registraci do aplikace – jméno;
- platby: datum, částka, variabilní a specifický symbol, jméno žáka, odkaz na e-mail z banky; v samotné e-mailové schránce fondu zůstávají bankovní oznámení, která mohou obsahovat i jméno a číslo účtu plátce;
- učitelé a správci: jméno, e-mail, role v aplikaci (u pozvaných i údaj, kdo je pozval); u správců navíc ověřovací otisk (hash) hesla, nikoli heslo samotné.

**3. Účel a právní základ.** [Vyberte a doplňte, co odpovídá vašemu uspořádání:]
- evidence a vyúčtování dobrovolných třídních sbírek a komunikace s rodiči o platbách – [čl. 6 odst. 1 písm. a) souhlas zákonného zástupce / písm. b) plnění smlouvy, např. členství ve spolku rodičů / písm. f) oprávněný zájem správce na řádné správě společných prostředků];
- zabezpečení přístupu do aplikace (e-mailové přihlašovací kódy) – [oprávněný zájem na ochraně údajů];
- plnění zákonných povinností (např. účetní, pokud se uplatní) – [čl. 6 odst. 1 písm. c)].

**4. Příjemci.** Údaje jsou uloženy v účtu [Google Workspace/Google] školy a zpracovává je poskytovatel těchto služeb jako zpracovatel. [Pokud zapnete: Systémové e-maily (přihlašovací kódy) odesílá [Brevo / Resend] jako zpracovatel.] Údaje o platbách se nepředávají dalším subjektům, pokud to nevyžaduje zákon. [Přístup mají pověření pracovníci školy podle role: učitel, školní admin.]

**5. Předání mimo EU.** [Služby Google a [Resend] mohou zahrnovat přenos do USA; ten se opírá o [rozhodnutí o odpovídající ochraně (EU–US Data Privacy Framework) / standardní smluvní doložky]. Ověřte aktuální stav u poskytovatele.]

**6. Doba uložení.** [Např.: do konce školního roku, v němž byla sbírka uzavřena, a dále po dobu [..], resp. dle spisového a skartačního řádu / zákonných lhůt pro účetní doklady.] Po této době se údaje z tabulky smažou nebo anonymizují. [Uzavřená třída se po skončení školního roku přesune do archivu (jen ke čtení), kde zůstává po dobu uvedenou výše; potom se trvale smaže.]

**7. Vaše práva.** Máte právo na přístup k údajům, opravu, výmaz (pokud nebrání zákon), omezení zpracování, přenositelnost a vznést námitku. Pokud se zpracování opírá o souhlas, můžete jej kdykoli odvolat (zpracování před odvoláním zůstává zákonné). Máte právo podat stížnost u **Úřadu pro ochranu osobních údajů** (uoou.gov.cz). Požadavky směřujte na kontakt v bodě 1.

**8. Zdroj a povinnost poskytnutí.** Údaje o žácích a e-maily poskytují zákonní zástupci nebo je zadala škola/třídní učitel. Poskytnutí je [dobrovolné; bez e-mailu nelze žákovi zaslat QR kód, platit lze i jinak].

**9. Automatizované rozhodování a profilování** se neprovádí. Aplikace pouze páruje platby podle symbolů; chybné spárování řeší člověk.

---

## D. Záznam o činnostech zpracování (čl. 30 GDPR – kostra)

| Položka | Vyplnění |
|---|---|
| Název činnosti | Evidence třídních peněz a sbírek (aplikace Třídní fond) |
| Správce / kontakt | [škola / spolek, kontakt] |
| Účel | Evidence sbírek, rozesílání výzev k platbě (QR), párování plateb, vyúčtování |
| Kategorie subjektů | Žáci, zákonní zástupci, zaměstnanci školy (uživatelé aplikace) |
| Kategorie údajů | Identifikační (jméno, třída), kontaktní (e-mail), platební (částky, symboly; v e-mailech banky ve schránce fondu i jméno/číslo účtu plátce), přístupové (role, e-mail účtu) |
| Příjemci | Google (zpracovatel) [; Brevo/Resend – zpracovatel] |
| Předání do třetích zemí | [ano/ne, jaké záruky] |
| Lhůty výmazu | [..] (archivované třídy se uchovávají jen po tuto dobu, pak se trvale smažou – viz část E, „Archiv a mazání“) |
| Technická a organizační opatření | viz část E |

---

## E. Technická a organizační opatření (co aplikace skutečně dělá)

**V aplikaci (ověřeno testy v simulovaném prostředí):**
- Přihlášení: všichni uživatelé se přihlašují **e-mailem a jednorázovým šestimístným kódem** (platí 10 minut, po 5 špatných zadáních se zruší). **Správci (školní admin, případně vlastník) zadávají po kódu ještě heslo.** Přihlášení jménem a heslem bez e-mailu už **neexistuje**. Heslo se ukládá jen jako solený hash (SHA-256 opakovaný 300×, což je skromnější ochrana než specializované algoritmy; min. 10 znaků; po opakovaných chybách se účet na čas zamkne).
- **Citlivé akce správce potvrzuje vlastním heslem:** smazání sbírky, trvalé smazání třídy, povýšení učitele na správce, odebrání správcovských práv, zablokování/odblokování a smazání správce, pozvání nebo schválení nového správce. Chrání to před zneužitím odemčeného zařízení nebo cizí relace. Archivace třídy (vratná) heslo nevyžaduje.
- Přihlášení vyprší po 7 dnech nečinnosti (nejdéle 30 dní).
- Role a práva se ověřují **na serveru** při každé akci; skrytá tlačítka nejsou jediná pojistka. Rodič vidí jen platby dítěte, u kterého je jeho e-mail v tabulce.
- **Ověření rodiče přes dítě:** rodič, jehož e-mail škola nemá, může požádat o kód, který přijde na adresu žáka; dítě ho rodiči předá. Teprve po jeho zadání se adresa rodiče zapíše k žákovi a účet se aktivuje (přihlášení pak běží běžným kódem na adresu rodiče, takže kód od dítěte sám o sobě přístup k cizímu účtu nedává). Počet kódů je omezen (3 za hodinu na rodiče a 4 za 6 hodin na adresu dítěte) a odpověď je stejná, ať adresa žáka v tabulce je, nebo ne, aby nešlo zjišťovat, které adresy škola eviduje.
- Registrace nových učitelů musí **schválit školní admin**. E-mailová adresa učitele se při registraci **neověřuje kódem** (kód nic nedokazuje, protože do aplikace se dostane až po schválení a přihlášení kódem na tuto adresu); počet takových registrací je omezený. Po schválení dostane dotyčný e-mail, že se může přihlásit; učitele může školní admin také **pozvat** (náhled adres a textu → potvrzení → odeslání; účet vznikne jen pro adresu, na kterou pozvánka skutečně odešla). První správce se musí prokázat schránkou, ze které se čtou bankovní e-maily.
- Při pokusu o přihlášení neregistrovanou adresou aplikace sdělí, že účet neexistuje (kvůli srozumitelnosti). Tím lze zjistit, zda je adresa v aplikaci registrována; počet takových pokusů je omezen (30 za 10 minut). Zvažte, zda je to pro vaši školu přijatelné.
- Při zadání webu školy aplikace jednou načte její veřejnou titulní stránku (barva, logo, název); žádné osobní údaje se neodesílají. Zadání webu je nepovinné jen v tom smyslu, že místo něj lze uvést symbol školy (RED-IZO / IZO / IČO).
- Rozesílání e-mailů žákům vždy předchází **náhled a potvrzení**; mazání tříd, odebrání a přesun žáků jsou na potvrzení.
- **Archiv a mazání (důležité pro lhůty výmazu):** třídu lze **archivovat** – list se skryje a třída zůstane jen ke čtení, aby nezmizely záznamy o proběhlých sbírkách. **Archivovaná třída dál obsahuje osobní údaje dětí a rodičů** (jména, e-maily, symboly, stavy plateb), dokud ji někdo z archivu **trvale nesmaže**; archiv tedy není výmaz. Trvalé smazání třídy odstraní i záznamy jejích sbírek a jde jen z archivu (opsání názvu + heslo správce). Poslední aktivní třídu nelze archivovat.
- Smazání sbírky odstraní její sloupec a vazby v tabulce; **„Historie plateb“ a seznam odeslaných e-mailů se ponechají**, pokud správce výslovně nezaškrtne jejich smazání. Štítky ve schránce Gmail aplikace nikdy nemaže. Pro splnění výmazu (čl. 17) proto smažte i historii, případně i bankovní e-maily ve schránce.
- Omezení počtu přihlašovacích kódů (ochrana proti zneužití a vyčerpání denní kvóty e-mailů).
- API klíč externí e-mailové služby se ukládá jen na serveru a nevrací se do prohlížeče.
- Bankovní e-maily se čtou jen od povolených domén bank.

**Na straně školy (na vás, aplikace to nezajistí):**
- účet Google s **dvoufázovým ověřením**, ideálně školní Workspace místo osobního Gmailu;
- sdílení tabulky s minimem lidí (kdo má přístup k Tabulce, vidí všechna data bez ohledu na role v aplikaci!);
- mějte nejméně dva školní adminy (záloha a odpovědnost);
- pravidelná revize účtů (Nastavení → Účty a schvalování), odebrání odešlých učitelů;
- smlouvy se zpracovateli (Google, případně Brevo/Resend);
- lhůty výmazu a jejich dodržování; záloha tabulky;
- poučení uživatelů (třídní učitelé, rodiče-pokladníci) o mlčenlivosti.

**Známá omezení, o kterých musí škola vědět:**
- Role v aplikaci chrání jen přístup přes webovou aplikaci. **Kdo otevře samotnou tabulku Google (nebo editor skriptu), obejde je.** Sdílení tabulky proto omezte.
- Aplikace neukládá auditní záznam zobrazení údajů (eviduje platby a odeslané e-maily, ale není to audit přístupů).
- Bankovní e-maily zůstávají ve schránce Gmail fondu (aplikace je jen označuje štítkem). Kdo má přístup do schránky, vidí i údaje plátců; stanovte, jak dlouho se uchovávají.
- Platby se zjišťují z e-mailů; zpoždění nebo změna formátu e-mailu banky = chybějící/nesprávná evidence.
- Při použití osobního Gmailu (`@gmail.com`) nemáte k dispozici dodatek o zpracování údajů jako u Workspace; zvažte, jestli je to pro školu přijatelné.

---

## F. Kontrolní seznam před ostrým provozem

- [ ] Určeno, kdo je správce (škola vs. spolek rodičů) a kdo odpovídá za fond.
- [ ] Zvolen právní základ a informování rodičů (část C rozeslána / zveřejněna).
- [ ] Zapsáno do záznamu o činnostech zpracování (část D).
- [ ] Účet Google chráněn dvoufázovým ověřením; sdílení tabulky omezeno.
- [ ] Smlouva o zpracování s Googlem (Workspace) uzavřena; u Brevo/Resend (pokud se používají) také.
- [ ] Aplikace nasazena pod účtem, na který chodí bankovní e-maily (návod, krok 1).
- [ ] Vlastník (autor) v aplikaci **neexistuje**: v Nastavení → Účty a schvalování není skupina „Vlastník“ (po předání je `VLASTNIK_EMAIL` v kódu prázdný – viz `PRO_AUTORA_PREDANI.md`).
- [ ] Zkušební sbírka (1 Kč) proběhla celá: QR → platba → e-mail banky → zaplaceno.
- [ ] Určeny lhůty výmazu a osoba, která je hlídá (včetně toho, kdy se **archivované třídy trvale smažou**).
- [ ] Každý správce si nastavil vlastní heslo a ví, že citlivé akce (mazání, změna správců) se potvrzují heslem.
- [ ] Staré účty bez e-mailu (jen jméno) odebrány a pozvány e-mailem – bez e-mailu se nelze přihlásit.
- [ ] Pověřenec/právník dokumenty prošel.
