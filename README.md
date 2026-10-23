# Třídní fond

Aplikace pro **třídní pokladnu**: sbírky na divadlo, výlet nebo fotky, **QR platby** pro rodiče a **automatické párování plateb** z e-mailů banky. Staví na Google Tabulkách, Apps Scriptu a Gmailu, takže škola nic neplatí a nepotřebuje server.

**Vyzkoušejte si ukázku (smyšlená data, bez přihlášení): https://vlasatabomba.github.io/tridni-fond-demo/**
Nepřihlášený začátek (registrace rodiče, přihlášení): [`?anon=1`](https://vlasatabomba.github.io/tridni-fond-demo/?anon=1). Ukázka běží celá ve vašem prohlížeči, nic se neodesílá ani neukládá. E-maily, které by aplikace poslala, jsou vlevo dole v „Ukázkové poště“.

## Co umí
- Učitel založí třídu a sbírku, vybere žáky a částky; aplikace rozešle e-mail s **QR kódem** (žákům, rodičům, nebo oběma, vždy až po náhledu a potvrzení). QR kód si aplikace generuje sama (formát SPAYD), bez cizí služby.
- Platby se zjišťují **čtením e-mailů banky** ve schránce fondu: podle variabilního symbolu se pozná žák, podle specifického sbírka. Přeplatky, částečné platby i ruční platby (hotovost).
- Role: žák / rodič, učitel, školní admin. Rodič se přihlašuje **vlastním Gmailem**; propojení s dítětem potvrdí dítě kódem, nebo ho zapíše učitel.
- Rychlé rozhraní (změna se ukáže hned, zápis do tabulky doběhne na pozadí), mobil, světlý i tmavý vzhled, archiv tříd.

## Jak je to zabezpečené
Přihlášení kódem z e-mailu (správce navíc heslo), práva vynucuje server, e-maily rodičům jen po potvrzení, mazání s vlastním heslem, kontrola odesílatele bankovních e-mailů (falešný e-mail se nezapočítá), každá škola má **vlastní kopii** a autor k jejím datům nemá přístup. Podrobně: [schéma](dokumentace/schema_tridni_fond.png), [co se děje s falešným e-mailem](dokumentace/schema_falesny_email.png).

## Poctivě o limitech
- Platby se čtou z e-mailů banky, ne přímo z banky (API k účtu banky nabízejí jen licencovaným firmám nebo za poplatek). Aplikace nepozná platbu, o které banka e-mail neposlala.
- Denní limit Gmailu je tvrdý (zhruba 100 e-mailů zdarma, 1 500 ve školním Workspace); aplikace hlídá, kolik dnes ještě zbývá.
- Víc přihlášených účtů Google v jednom prohlížeči dělá u webových aplikací Apps Script potíže, v anonymním okně to funguje.
- Není to účetnictví: pravdou o penězích zůstává bankovní výpis.
- Je to **šablona**, kterou si škola zkopíruje do svého Google účtu (ne jedna veřejná aplikace), jinak by autor měl přístup k datům všech škol.

## Co je v repozitáři
| Složka | Obsah |
|---|---|
| `index.html` | ukázka (celá aplikace + simulace Googlu + smyšlená data v jedné stránce; sestaví ji `testy/sestav_demo.js`) |
| `zdrojovy-kod/` | zdrojový kód aplikace: `tridni_fond.gs` (logika tabulky, QR, platby), `webapp.gs` (přihlášení, role, rozhraní serveru), `Index.html` (rozhraní) |
| `dokumentace/` | návod pro školy, změny po verzích, šablony k ochraně osobních údajů, schémata |
| `testy/` | celý scénář aplikace v simulovaném prostředí Google (kontrola QR kódů nezávislou čtečkou), viz `testy/README.md` |

Testy: `cd testy && npm install && node run.js` (Node.js).

## Jak vznikl projekt a použité nástroje
Projekt vznikl s pomocí AI nástrojů (Gemini a Claude). Co dělala AI a co autor, je popsáno v přihlášce do soutěže MAIDAY 2026.

## Práva
© 2026 autor. **Všechna práva vyhrazena.** Zdrojový kód a ukázka jsou zveřejněny pouze pro posouzení v soutěži MAIDAY 2026. Bez souhlasu autora je nekopírujte, nešiřte ani nepoužívejte.
