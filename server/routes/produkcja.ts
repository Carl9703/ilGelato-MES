import { getBuforWzByPartia } from "../utils/magazyn";
import { Router } from "express";
import { prisma, globalTransactionMutex } from "../db";
import { generateDocNumber, generateSesjaNumber, generateZlecenieNumber } from "../utils/docNumbers";
import { generateDocumentHTML, generatePDF } from "../../server-pdf";

const router = Router();

router.post("/api/produkcja/rozliczenie", async (req, res) => {
    try {
      // pozycje: [{ id_receptury, ilosc_produkcji }]
      const pozycje: { id_receptury: string; ilosc_produkcji: number }[] = req.body.pozycje || [];
      if (pozycje.length === 0) return res.json({ produkty: [], skladniki: [], suma_produkty: 0, suma_skladniki: 0 });

      // Pobierz receptury z składnikami
      const receptury = await prisma.receptury.findMany({
        where: { id: { in: pozycje.map(p => p.id_receptury) }, czy_aktywne: true },
        include: {
          asortyment_docelowy: true,
          skladniki: {
            where: { czy_aktywne: true },
            include: { asortyment_skladnika: true },
          },
        },
      });

      // Ceny zakupu z kartoteki asortymentu
      const allIngredientIds = [...new Set(receptury.flatMap(r => r.skladniki.map(s => s.id_asortymentu_skladnika)))];
      const cenySrednie: Record<string, number> = {};
      const asortymenty = await prisma.asortyment.findMany({
        where: { id: { in: allIngredientIds } },
        select: { id: true, cena_zakupu: true },
      });
      asortymenty.forEach(a => { cenySrednie[a.id] = a.cena_zakupu ?? 0; });

      // Kalkulacja na produkt
      const produkty: any[] = [];
      const skladnikiMap: Record<string, any> = {};

      for (const poz of pozycje) {
        const rec = receptury.find(r => r.id === poz.id_receptury);
        if (!rec || poz.ilosc_produkcji <= 0) continue;

        let koszt_jm = 0;
        for (const s of rec.skladniki) {
          const przelicznik = s.czy_pomocnicza && s.asortyment_skladnika.przelicznik_jednostki ? s.asortyment_skladnika.przelicznik_jednostki : 1;
          const straty = 1 + (s.procent_strat || 0) / 100;
          const ilosc_na_jm = (s.czy_pomocnicza ? s.ilosc_wymagana / przelicznik : s.ilosc_wymagana) * straty;
          const cena = cenySrednie[s.id_asortymentu_skladnika] || 0;
          koszt_jm += ilosc_na_jm * cena;

          // Agreguj składniki
          const key = s.id_asortymentu_skladnika;
          const zuzycie = ilosc_na_jm * poz.ilosc_produkcji;
          if (!skladnikiMap[key]) {
            skladnikiMap[key] = {
              id_asortymentu: key,
              nazwa: s.asortyment_skladnika.nazwa,
              kod: s.asortyment_skladnika.kod_towaru,
              typ: s.asortyment_skladnika.typ_asortymentu,
              jednostka: s.asortyment_skladnika.jednostka_miary,
              zuzycie: 0,
              cena_srednia: cena,
              wartosc: 0,
            };
          }
          skladnikiMap[key].zuzycie += zuzycie;
          skladnikiMap[key].wartosc += zuzycie * cena;
        }

        produkty.push({
          id_receptury: rec.id,
          nazwa: rec.asortyment_docelowy.nazwa,
          kod: rec.asortyment_docelowy.kod_towaru,
          typ: rec.asortyment_docelowy.typ_asortymentu,
          jednostka: rec.asortyment_docelowy.jednostka_miary,
          ilosc_produkcji: poz.ilosc_produkcji,
          koszt_jm,
          wartosc: koszt_jm * poz.ilosc_produkcji,
        });
      }

      // Sortuj składniki wg typ → nazwa
      const skladniki = Object.values(skladnikiMap).sort((a: any, b: any) => a.typ.localeCompare(b.typ) || a.nazwa.localeCompare(b.nazwa));

      res.json({
        produkty,
        skladniki,
        suma_produkty: produkty.reduce((s, p) => s + p.wartosc, 0),
        suma_skladniki: skladniki.reduce((s: number, c: any) => s + c.wartosc, 0),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Błąd rozliczenia" });
    }
  });

router.get("/api/produkcja/sesje/:id/koszty", async (req, res) => {
    try {
      const { id } = req.params;
      const zlecenia = await prisma.zlecenia_Produkcyjne.findMany({
        where: { id_sesji: id, czy_aktywne: true },
        include: {
          receptura: { include: { asortyment_docelowy: true } },
          ruchy_magazynowe: {
            where: { czy_aktywne: true },
            include: { partia: { include: { asortyment: true } } },
          },
        },
        orderBy: { etap: "asc" },
      });

      if (zlecenia.length === 0) return res.json(null);

      const processZlecenie = (z: any) => {
        const zuzycie = z.ruchy_magazynowe.filter((r: any) => r.typ_ruchu === "Zuzycie");
        const pw = z.ruchy_magazynowe.find((r: any) => r.typ_ruchu === "Przyjecie_Z_Produkcji" && r.ilosc > 0);
        const ilosc_kg = pw?.ilosc || z.rzeczywista_ilosc_wyrobu || 0;

        // Zawsze przeliczamy z aktualnej cena_zakupu z kartoteki; ilości konwertujemy do kg gdy jest przelicznik
        const surowceMap: Record<string, { nazwa: string; kod: string; jednostka: string; ilosc: number; cena_jm: number; wartosc: number }> = {};
        for (const r of zuzycie) {
          const ilosc_raw = Math.abs(r.ilosc);
          const asort = r.partia?.asortyment;
          const jmGl = asort?.jednostka_miary || "kg";
          const przelicznik = asort?.przelicznik_jednostki ?? 0;
          const jm_pomocnicza = asort?.jednostka_pomocnicza;
          const mainIsKg = jmGl.toLowerCase() === "kg";
          const auxIsKg = jm_pomocnicza?.toLowerCase() === "kg" && przelicznik > 0;
          const ilosc = auxIsKg ? Math.round(ilosc_raw * przelicznik * 1000) / 1000 : ilosc_raw;
          const cena_raw = asort?.cena_zakupu ?? 0;
          const cena_jm = auxIsKg ? cena_raw / przelicznik : cena_raw;
          const jednostka = (mainIsKg || auxIsKg) ? "kg" : jmGl;
          const key = asort?.id || r.id_partii;
          if (!surowceMap[key]) {
            surowceMap[key] = {
              nazwa: asort?.nazwa || "—",
              kod: asort?.kod_towaru || "—",
              jednostka, ilosc: 0, cena_jm, wartosc: 0,
            };
          }
          surowceMap[key].ilosc += ilosc;
          surowceMap[key].wartosc += ilosc_raw * cena_raw;
        }
        const surowce = Object.values(surowceMap).sort((a, b) => b.wartosc - a.wartosc);
        const surowce_ilosc_kg_total = surowce.reduce((s, r) => s + r.ilosc, 0);
        const koszt_surowcow = surowce.reduce((s, r) => s + r.wartosc, 0);
        const koszt_total = koszt_surowcow;
        const koszt_per_kg = ilosc_kg > 0 ? koszt_total / ilosc_kg : 0;
        const cena_sprzedazy = z.receptura?.asortyment_docelowy?.cena_sprzedazy ?? 0;
        const wartosc_sprzedazy = ilosc_kg * cena_sprzedazy;

        return { id: z.id, nazwa: z.receptura?.asortyment_docelowy?.nazwa || "—", ilosc_kg, koszt_per_kg, koszt_total, koszt_surowcow, cena_sprzedazy, wartosc_sprzedazy, surowce_ilosc_kg_total, surowce };
      };

      const bazaZp = zlecenia.find((z: any) => z.etap === 1);
      const wyrobyZp = zlecenia.filter((z: any) => z.etap === 2 || (z.etap == null && !zlecenia.some((x: any) => x.etap === 1)));

      const baza = bazaZp ? processZlecenie(bazaZp) : null;
      const wyroby = wyrobyZp.map(processZlecenie);

      const masa_wyrobow_total = wyroby.reduce((s: number, w: any) => s + w.ilosc_kg, 0);
      // Gdy jest etap bazy: koszt = surowce etapu 1 + surowce etapu 2 bez bazy (produkt pośredni),
      // identycznie jak na wydruku. Bez bazy: suma kosztów wyrobów bez zmian.
      const bazaKod = bazaZp?.receptura?.asortyment_docelowy?.kod_towaru;
      const koszt_wyrobow_total = baza
        ? baza.koszt_surowcow + wyroby.reduce((s: number, w: any) => {
            const bazaInWyrob = w.surowce.find((sur: any) => sur.kod === bazaKod);
            return s + w.koszt_total - (bazaInWyrob?.wartosc || 0);
          }, 0)
        : wyroby.reduce((s: number, w: any) => s + w.koszt_total, 0);
      const wartosc_sprzedazy_total = wyroby.reduce((s: number, w: any) => s + w.wartosc_sprzedazy, 0);

      res.json({
        baza,
        wyroby,
        masa_wyrobow_total,
        koszt_wyrobow_total,
        koszt_wyrobow_avg_per_kg: masa_wyrobow_total > 0 ? koszt_wyrobow_total / masa_wyrobow_total : 0,
        wartosc_sprzedazy_total,
      });
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania kosztów sesji" });
    }
  });

router.get("/api/produkcja", async (req, res) => {
    try {
      const zlecenia = await prisma.zlecenia_Produkcyjne.findMany({
        where: { OR: [{ czy_aktywne: true }, { status: "Anulowane" }] },
        include: {
          sesja: true,
          receptura: {
            include: {
              asortyment_docelowy: true,
              skladniki: {
                include: {
                  asortyment_skladnika: true,
                },
              },
            },
          },
          ruchy_magazynowe: {
            include: {
              partia: {
                include: {
                  asortyment: true,
                },
              },
            },
          },
          rezerwacje: {
            where: { czy_aktywne: true, status: "Aktywna" },
            include: {
              partia: {
                include: {
                  asortyment: true,
                }
              },
              asortyment: true
            }
          }
        },
        orderBy: {
          utworzono_dnia: "desc",
        },
      });
      // Optymalizacja zapytań N+1: pobieramy wszystkie dostępne partie dla potrzebnego asortymentu w jednym zapytaniu
      const neededAsortymentIds = new Set<string>();
      zlecenia.forEach(z => {
        if (z.status !== "Zrealizowane" && z.status !== "Anulowane") {
          z.receptura.skladniki.forEach(s => neededAsortymentIds.add(s.id_asortymentu_skladnika));
        }
      });

      let wszystkiePartieCache: any[] = [];
      let buforWzCache: Map<string, number> = new Map();

      if (neededAsortymentIds.size > 0) {
        wszystkiePartieCache = await prisma.partie_Magazynowe.findMany({
          where: {
            id_asortymentu: { in: Array.from(neededAsortymentIds) },
            status_partii: "Dostepna"
          },
          include: {
            ruchy_magazynowe: { where: { czy_aktywne: true } },
            rezerwacje: { where: { czy_aktywne: true, status: "Aktywna" } }
          },
          orderBy: [
            { termin_waznosci: 'asc' },
            { utworzono_dnia: 'asc' }
          ]
        });
        buforWzCache = await getBuforWzByPartia(wszystkiePartieCache.map(p => p.id));
      }

      // Proaktywna inicjatywa: Dodajemy sugestie partii FIFO do każdego zlecenia w widoku produkcji
      const zleceniaWithSuggestions = zlecenia.map((z) => {
        if (z.status === "Zrealizowane" || z.status === "Anulowane") return {
          ...z,
          opakowania: z.opakowania_json ? JSON.parse(z.opakowania_json) : [],
        };

        const skladnikiWithBatches = z.receptura.skladniki.map((s) => {
          const partie = wszystkiePartieCache.filter(p => p.id_asortymentu === s.id_asortymentu_skladnika);

          const sugestie = partie.map(p => ({
            id: p.id,
            numer_partii: p.numer_partii,
            termin_waznosci: p.termin_waznosci,
            stan: p.ruchy_magazynowe.reduce((sum: any, r: any) => sum + r.ilosc, 0)
                - p.rezerwacje.reduce((sum: any, r: any) => sum + r.ilosc_zarezerwowana, 0)
                - (buforWzCache.get(p.id) || 0)
          })).filter(p => p.stan > 0);

          return { ...s, sugerowane_partie: sugestie };
        });

        return {
          ...z,
          opakowania: [],
          receptura: { ...z.receptura, skladniki: skladnikiWithBatches }
        };
      });

      res.json(zleceniaWithSuggestions);
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania zleceń produkcyjnych" });
    }
  });

router.post("/api/produkcja", async (req, res) => {
    try {
      const { id_receptury, planowana_ilosc_wyrobu } = req.body;

      const releaseMutex = await globalTransactionMutex.acquire();
      let zlecenie;
      try {
        zlecenie = await prisma.$transaction(async (tx) => {
          const numer_zlecenia = await generateZlecenieNumber(tx);
          return tx.zlecenia_Produkcyjne.create({
            data: {
              numer_zlecenia,
              id_receptury,
              planowana_ilosc_wyrobu: parseFloat(planowana_ilosc_wyrobu),
              status: "Planowane",
            },
            include: {
              receptura: {
                include: {
                  asortyment_docelowy: true,
                },
              },
            },
          });
        });
      } finally {
        releaseMutex();
      }

      res.json(zlecenie);
    } catch (error) {
      res.status(500).json({ error: "Błąd tworzenia zlecenia produkcyjnego" });
    }
  });

router.get("/api/produkcja/sesja-robocza/:id", async (req, res) => {
    try {
      const row = await (prisma as any).sesja_Robocza.findUnique({ where: { id: req.params.id } });
      if (!row) return res.status(404).json({ error: "Nie znaleziono szkicu" });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.post("/api/produkcja/sesja-robocza", async (req, res) => {
    try {
      const { krok, dane_json, nazwa, zdarzenie = "auto" } = req.body;
      const row = await (prisma as any).sesja_Robocza.create({ data: { krok, dane_json, nazwa: nazwa ?? null } });
      await (prisma as any).sesja_Robocza_Log.create({
        data: { id_sesji_roboczej: row.id, krok, zdarzenie, dane_json },
      });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.put("/api/produkcja/sesja-robocza/:id", async (req, res) => {
    try {
      const { krok, dane_json, nazwa, zdarzenie = "auto" } = req.body;
      const updateData: any = { krok, dane_json };
      if (nazwa !== undefined) updateData.nazwa = nazwa;
      const row = await (prisma as any).sesja_Robocza.update({ where: { id: req.params.id }, data: updateData });
      await (prisma as any).sesja_Robocza_Log.create({
        data: { id_sesji_roboczej: row.id, krok, zdarzenie, dane_json },
      });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.put("/api/produkcja/sesja-robocza", async (req, res) => {
    try {
      const { krok, dane_json, id: sesjaId, zdarzenie = "auto" } = req.body;
      let row;
      if (sesjaId) {
        row = await (prisma as any).sesja_Robocza.update({ where: { id: sesjaId }, data: { krok, dane_json } });
      } else {
        const existing = await (prisma as any).sesja_Robocza.findFirst({ orderBy: { zaktualizowano_dnia: "desc" } });
        row = existing
          ? await (prisma as any).sesja_Robocza.update({ where: { id: existing.id }, data: { krok, dane_json } })
          : await (prisma as any).sesja_Robocza.create({ data: { krok, dane_json } });
      }
      await (prisma as any).sesja_Robocza_Log.create({
        data: { id_sesji_roboczej: row.id, krok, zdarzenie, dane_json },
      });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.delete("/api/produkcja/sesja-robocza/:id", async (req, res) => {
    try {
      await (prisma as any).sesja_Robocza_Log.deleteMany({ where: { id_sesji_roboczej: req.params.id } });
      await (prisma as any).sesja_Robocza.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.post("/api/produkcja/sesja", async (req, res) => {
    try {
      const { id_receptury_bazy, ilosc_bazy, rzeczywista_ilosc_bazy, surowce_bazy, wyroby, data_produkcji } = req.body;
      // wyroby: [{ id_receptury, ilosc, surowce: [{ id_partii, ilosc }] }]
      const isSorbety = !id_receptury_bazy;
      if (!isSorbety && !(parseFloat(ilosc_bazy) > 0)) throw new Error("Podaj recepturę i ilość bazy");
      if (!wyroby || wyroby.length === 0) throw new Error("Dodaj co najmniej jeden wyrób gotowy");

      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const releaseMutex = await globalTransactionMutex.acquire();
      let result;
      try {
        result = await prisma.$transaction(async (tx) => {
          const numer_sesji = await generateSesjaNumber(tx);
          const sesja = await tx.sesje_Produkcji.create({ data: { numer_sesji, data_produkcji: data_produkcji ? new Date(data_produkcji) : null } });

          let partiaBazy: any = null;
          let cenaBazy = 0;
          let recepturaBazy: any = null;
          let zlecenieBazy: any = null;
          let pwBazyNr: string | null = null;
          let numer_zp_bazy: string | null = null;
          let iloscBazy = 0;

          if (!isSorbety) {
            // ── Etap 1: Polprodukt (baza) ────────────────────────────────────
            recepturaBazy = await tx.receptury.findUnique({
              where: { id: id_receptury_bazy },
              include: { asortyment_docelowy: true },
            });
            if (!recepturaBazy) throw new Error("Nie znaleziono receptury bazy");

            numer_zp_bazy = await generateZlecenieNumber(tx);
            zlecenieBazy = await tx.zlecenia_Produkcyjne.create({
              data: { numer_zlecenia: numer_zp_bazy, id_receptury: id_receptury_bazy, id_sesji: sesja.id, etap: 1, planowana_ilosc_wyrobu: parseFloat(ilosc_bazy), status: "Planowane" },
            });

            const rwBazyNr = await generateDocNumber(tx, "RW");
            pwBazyNr = await generateDocNumber(tx, "PW");
            let kosztBazy = 0;

            // Śledź łączne zużycie per partia w tej sesji (ochrona przed overdraftem przy duplikatach)
            const zuzyteWTransakcji: Record<string, number> = {};

            for (const s of surowce_bazy || []) {
              if (!s.id_partii || !(parseFloat(s.ilosc) > 0)) continue;
              const ilosc = parseFloat(s.ilosc);
              const partia = await tx.partie_Magazynowe.findUnique({
                where: { id: s.id_partii },
                include: { ruchy_magazynowe: { where: { czy_aktywne: true } }, asortyment: true },
              });
              if (!partia) throw new Error(`Partia ${s.id_partii} nie istnieje`);
              const stanPartii = partia.ruchy_magazynowe.reduce((sum: number, r: any) => sum + r.ilosc, 0);
              const juzZuzyte = zuzyteWTransakcji[s.id_partii] || 0;
              if (stanPartii - juzZuzyte < ilosc - 0.001) throw new Error(`Niewystarczający stan partii ${partia.numer_partii}`);
              zuzyteWTransakcji[s.id_partii] = juzZuzyte + ilosc;
              const cenaJednBazy = partia.asortyment?.cena_zakupu ?? 0;
              kosztBazy += ilosc * cenaJednBazy;
              await tx.ruchy_Magazynowe.create({
                data: { id_partii: s.id_partii, id_zlecenia: zlecenieBazy.id, typ_ruchu: "Zuzycie", ilosc: -ilosc, cena_jednostkowa: cenaJednBazy, referencja_dokumentu: rwBazyNr, id_uzytkownika: user.id },
              });
            }

            iloscBazy = rzeczywista_ilosc_bazy != null && parseFloat(rzeczywista_ilosc_bazy) > 0
              ? parseFloat(rzeczywista_ilosc_bazy)
              : parseFloat(ilosc_bazy);
            const terminWaznosci_baza = recepturaBazy.dni_trwalosci ? new Date(Date.now() + recepturaBazy.dni_trwalosci * 86400000) : null;
            partiaBazy = await tx.partie_Magazynowe.create({
              data: { id_asortymentu: recepturaBazy.id_asortymentu_docelowego, numer_partii: pwBazyNr, data_produkcji: new Date(), termin_waznosci: terminWaznosci_baza, status_partii: "Dostepna" },
            });
            cenaBazy = iloscBazy > 0 ? kosztBazy / iloscBazy : 0;
            await tx.ruchy_Magazynowe.create({
              data: { id_partii: partiaBazy.id, id_zlecenia: zlecenieBazy.id, typ_ruchu: "Przyjecie_Z_Produkcji", ilosc: iloscBazy, cena_jednostkowa: cenaBazy, referencja_dokumentu: pwBazyNr, id_uzytkownika: user.id },
            });
            await tx.zlecenia_Produkcyjne.update({ where: { id: zlecenieBazy.id }, data: { status: "Zrealizowane", rzeczywista_ilosc_wyrobu: iloscBazy } });
          }

          // ── Etap 2: Wyroby gotowe ───────────────────────────────────────────
          const zleceniaWyrobow = [];
          for (const wyrob of wyroby) {
            const recepturaWyrobu = await tx.receptury.findUnique({
              where: { id: wyrob.id_receptury },
              include: { asortyment_docelowy: true, skladniki: { include: { asortyment_skladnika: true } } },
            });
            if (!recepturaWyrobu) throw new Error(`Receptura ${wyrob.id_receptury} nie znaleziona`);

            const iloscWyrobu = parseFloat(wyrob.ilosc);
            const rzeczywistaIloscWyrobu = wyrob.rzeczywista_ilosc ? parseFloat(wyrob.rzeczywista_ilosc) : iloscWyrobu;
            const numer_zp = await generateZlecenieNumber(tx);
            const zlecenieWyrobu = await tx.zlecenia_Produkcyjne.create({
              data: { numer_zlecenia: numer_zp, id_receptury: wyrob.id_receptury, id_sesji: sesja.id, etap: 2, planowana_ilosc_wyrobu: iloscWyrobu, status: "Planowane" },
            });

            const rwNr = await generateDocNumber(tx, "RW");
            const pwNr = await generateDocNumber(tx, "PW");
            let kosztWyrobu = 0;

            // Zużycie bazy (tylko dla lodów — gdy był etap 1)
            if (recepturaBazy && partiaBazy) {
              const skladnikBazy = recepturaWyrobu.skladniki.find(
                (s: any) => s.asortyment_skladnika.id === recepturaBazy.id_asortymentu_docelowego
              );
              if (skladnikBazy) {
                const iloscBazyDo = skladnikBazy.ilosc_wymagana * iloscWyrobu * (1 + (skladnikBazy.procent_strat || 0) / 100);
                kosztWyrobu += iloscBazyDo * cenaBazy;
                await tx.ruchy_Magazynowe.create({
                  data: { id_partii: partiaBazy.id, id_zlecenia: zlecenieWyrobu.id, typ_ruchu: "Zuzycie", ilosc: -iloscBazyDo, cena_jednostkowa: cenaBazy, referencja_dokumentu: rwNr, id_uzytkownika: user.id },
                });
              }
            }

            // Zużycie pozostałych surowców
            for (const s of wyrob.surowce || []) {
              if (!s.id_partii || !(parseFloat(s.ilosc) > 0)) continue;
              const ilosc = parseFloat(s.ilosc);
              const partia = await tx.partie_Magazynowe.findUnique({
                where: { id: s.id_partii },
                include: { ruchy_magazynowe: { where: { czy_aktywne: true } }, asortyment: true },
              });
              if (!partia) throw new Error(`Partia ${s.id_partii} nie istnieje`);
              const stanPartii = partia.ruchy_magazynowe.reduce((sum: number, r: any) => sum + r.ilosc, 0);
              if (stanPartii < ilosc - 0.001) throw new Error(`Niewystarczający stan partii ${partia.numer_partii}`);
              const cenaJednWyrobu = partia.asortyment?.cena_zakupu ?? 0;
              kosztWyrobu += ilosc * cenaJednWyrobu;
              await tx.ruchy_Magazynowe.create({
                data: { id_partii: s.id_partii, id_zlecenia: zlecenieWyrobu.id, typ_ruchu: "Zuzycie", ilosc: -ilosc, cena_jednostkowa: cenaJednWyrobu, referencja_dokumentu: rwNr, id_uzytkownika: user.id },
              });
            }

            // OPCJA C: Zasoby nieograniczone (woda, media) — wirtualna partia AUTO-
            for (const sk of recepturaWyrobu.skladniki) {
              if (!sk.asortyment_skladnika.czy_zasob_nieograniczony) continue;
              let iloscSk = sk.ilosc_wymagana * iloscWyrobu * (1 + (sk.procent_strat || 0) / 100);
              if (sk.czy_pomocnicza && sk.asortyment_skladnika.przelicznik_jednostki) {
                iloscSk = iloscSk / sk.asortyment_skladnika.przelicznik_jednostki;
              }
              const kodTowaru = sk.asortyment_skladnika.kod_towaru;
              let virtualPartia = await tx.partie_Magazynowe.findFirst({
                where: { id_asortymentu: sk.id_asortymentu_skladnika, numer_partii: `AUTO-${kodTowaru}` },
              });
              if (!virtualPartia) {
                virtualPartia = await tx.partie_Magazynowe.create({
                  data: { id_asortymentu: sk.id_asortymentu_skladnika, numer_partii: `AUTO-${kodTowaru}`, status_partii: 'Dostepna' },
                });
              }
              await tx.ruchy_Magazynowe.create({
                data: { id_partii: virtualPartia.id, id_zlecenia: zlecenieWyrobu.id, typ_ruchu: 'Zuzycie', ilosc: -iloscSk, cena_jednostkowa: 0, referencja_dokumentu: rwNr, id_uzytkownika: user.id },
              });
            }

            const terminWaznosci_wyrob = recepturaWyrobu.dni_trwalosci ? new Date(Date.now() + recepturaWyrobu.dni_trwalosci * 86400000) : null;
            const partiaWyrobu = await tx.partie_Magazynowe.create({
              data: {
                id_asortymentu: recepturaWyrobu.id_asortymentu_docelowego,
                numer_partii: pwNr,
                data_produkcji: new Date(),
                termin_waznosci: terminWaznosci_wyrob,
                status_partii: "Dostepna",
                opakowania_json: wyrob.opakowania?.length > 0 ? JSON.stringify(wyrob.opakowania) : null,
              },
            });
            const cenaWyrobu = rzeczywistaIloscWyrobu > 0 ? kosztWyrobu / rzeczywistaIloscWyrobu : 0;
            await tx.ruchy_Magazynowe.create({
              data: { id_partii: partiaWyrobu.id, id_zlecenia: zlecenieWyrobu.id, typ_ruchu: "Przyjecie_Z_Produkcji", ilosc: rzeczywistaIloscWyrobu, cena_jednostkowa: cenaWyrobu, referencja_dokumentu: pwNr, id_uzytkownika: user.id },
            });
            await tx.zlecenia_Produkcyjne.update({
              where: { id: zlecenieWyrobu.id },
              data: {
                status: "Zrealizowane",
                rzeczywista_ilosc_wyrobu: rzeczywistaIloscWyrobu,
                opakowania_json: wyrob.opakowania?.length > 0 ? JSON.stringify(wyrob.opakowania) : null,
              },
            });
            zleceniaWyrobow.push({ id: zlecenieWyrobu.id, numer: numer_zp, wyrob: recepturaWyrobu.asortyment_docelowy.nazwa, ilosc: rzeczywistaIloscWyrobu, pw: pwNr });
          }

          // ── Strata bazy (tylko dla lodów) ─────────────────────────────────
          let rwStrata: { numer: string; ilosc: number } | null = null;
          if (!isSorbety && partiaBazy) {
            const stanBazyAgg = await tx.ruchy_Magazynowe.aggregate({
              where: { id_partii: partiaBazy.id, czy_aktywne: true },
              _sum: { ilosc: true },
            });
            const pozostalaBaza = stanBazyAgg._sum.ilosc ?? 0;
            if (pozostalaBaza > 0.001) {
              const rwStrataNr = await generateDocNumber(tx, "RW");
              await tx.ruchy_Magazynowe.create({
                data: { id_partii: partiaBazy.id, id_zlecenia: zlecenieBazy.id, typ_ruchu: "Strata", ilosc: -pozostalaBaza, cena_jednostkowa: cenaBazy, referencja_dokumentu: rwStrataNr, id_uzytkownika: user.id },
              });
              rwStrata = { numer: rwStrataNr, ilosc: pozostalaBaza };
            }
          }

          const bazaResult = zlecenieBazy
            ? { numer_zp: numer_zp_bazy, pw: pwBazyNr, ilosc: iloscBazy }
            : null;
          return { sesja: { id: sesja.id, numer_sesji }, baza: bazaResult, wyroby: zleceniaWyrobow, rw_strata: rwStrata };
        }, { timeout: 30000 });
      } finally {
        releaseMutex();
      }

      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Błąd sesji produkcyjnej" });
    }
  });

router.post("/api/produkcja/:id/realizuj", async (req, res) => {
    try {
      const { id } = req.params;
      const { rzeczywista_ilosc, zuzyte_partie, opakowania } = req.body; // zuzyte_partie: { id_partii: string, ilosc: number }[]

      if (!rzeczywista_ilosc || isNaN(parseFloat(rzeczywista_ilosc))) {
        throw new Error("Nie podano rzeczywistej ilości wyprodukowanej");
      }

      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const zlecenie = await prisma.zlecenia_Produkcyjne.findUnique({
        where: { id },
        include: {
          receptura: {
            include: {
              skladniki: { include: { asortyment_skladnika: true } },
            },
          },
        },
      });

      if (!zlecenie) throw new Error("Nie znaleziono zlecenia");
      if (zlecenie.status === "Zrealizowane") throw new Error("Zlecenie zostało już zrealizowane");

      const rzeczywistaIloscNum = parseFloat(rzeczywista_ilosc);

      const result = await prisma.$transaction(async (tx) => {
        const rwNumber = await generateDocNumber(tx, "RW");
        const pwNumber = await generateDocNumber(tx, "PW");

        // Dodano kalkulację rzeczywistego kosztu
        let totalCost = 0;

        // 1. Zużycie składników
        if (zuzyte_partie && Array.isArray(zuzyte_partie) && zuzyte_partie.length > 0) {
          // OPCJA A: Użycie konkretnych partii wskazanych przez użytkownika (Proaktywne)
          // Śledź łączne zużycie per partia (ochrona przed overdraftem przy duplikatach)
          const zuzyteWTransakcji: Record<string, number> = {};
          for (const p of zuzyte_partie) {
            // Walidacja partii: status i dostępny stan
            const partia = await tx.partie_Magazynowe.findUnique({
              where: { id: p.id_partii },
              include: { ruchy_magazynowe: { where: { czy_aktywne: true } }, asortyment: true }
            });
            if (!partia) throw new Error(`Partia ${p.id_partii} nie istnieje`);
            if (partia.status_partii !== "Dostepna") throw new Error(`Partia ${partia.numer_partii} nie jest dostępna (status: ${partia.status_partii})`);
            const stanPartii = partia.ruchy_magazynowe.reduce((sum, r) => sum + r.ilosc, 0);
            const pobieranaIlosc = Math.abs(p.ilosc);
            const juzZuzyte = zuzyteWTransakcji[p.id_partii] || 0;
            if (stanPartii - juzZuzyte < pobieranaIlosc - 0.001) throw new Error(`Niewystarczający stan partii ${partia.numer_partii}: dostępne ${(stanPartii - juzZuzyte).toFixed(3).replace('.', ',')}, żądane ${pobieranaIlosc.toFixed(3).replace('.', ',')}`)
            zuzyteWTransakcji[p.id_partii] = juzZuzyte + pobieranaIlosc;

            const cenaKosztowaPartii = partia.asortyment?.cena_zakupu ?? 0;
            totalCost += pobieranaIlosc * cenaKosztowaPartii;

            await tx.ruchy_Magazynowe.create({
              data: {
                id_partii: p.id_partii,
                id_zlecenia: zlecenie.id,
                typ_ruchu: "Zuzycie",
                ilosc: -pobieranaIlosc,
                cena_jednostkowa: cenaKosztowaPartii,
                referencja_dokumentu: rwNumber,
                id_uzytkownika: user.id,
              },
            });
          }
        } else {
          // OPCJA B: Automatyczne FIFO (fallback)
          for (const skladnik of zlecenie.receptura.skladniki) {
            const asort = await tx.asortyment.findUnique({ where: { id: skladnik.id_asortymentu_skladnika } });
            if (asort?.czy_zasob_nieograniczony) continue; // obsługiwane przez OPCJA C
            let iloscWymagana = skladnik.ilosc_wymagana * rzeczywistaIloscNum * (1 + (skladnik.procent_strat || 0) / 100);

            // Konwersja na jednostkę podstawową jeśli podano w pomocniczej
            if (skladnik.czy_pomocnicza && asort?.przelicznik_jednostki) {
              iloscWymagana = iloscWymagana / asort.przelicznik_jednostki;
            }

            const dostepnePartie = await tx.partie_Magazynowe.findMany({
              where: {
                id_asortymentu: skladnik.id_asortymentu_skladnika,
                status_partii: "Dostepna",
                czy_aktywne: true,
              },
              include: { ruchy_magazynowe: { where: { czy_aktywne: true } } },
              orderBy: { termin_waznosci: "asc" },
            });

            let pozostaloDoPobrania = iloscWymagana;
            for (const partia of dostepnePartie) {
              if (pozostaloDoPobrania <= 0) break;
              const stanPartii = partia.ruchy_magazynowe.reduce((sum, r) => sum + r.ilosc, 0);
              if (stanPartii <= 0) continue;

              const iloscDoPobrania = Math.min(stanPartii, pozostaloDoPobrania);
              
              const cenaKosztowaPartii = asort?.cena_zakupu ?? 0;
              totalCost += iloscDoPobrania * cenaKosztowaPartii; // sumujemy koszt RW

              await tx.ruchy_Magazynowe.create({
                data: {
                  id_partii: partia.id,
                  id_zlecenia: zlecenie.id,
                  typ_ruchu: "Zuzycie",
                  ilosc: -iloscDoPobrania,
                  cena_jednostkowa: cenaKosztowaPartii,
                  referencja_dokumentu: rwNumber,
                  id_uzytkownika: user.id,
                },
              });
              pozostaloDoPobrania -= iloscDoPobrania;
            }

            if (pozostaloDoPobrania > 0.001) {
              const nazwaSkladnika = asort?.nazwa || "nieznanego składnika";
              throw new Error(`Brak wystarczającej ilości składnika [${nazwaSkladnika}] w magazynie. Brakuje: ${pozostaloDoPobrania.toFixed(3).replace('.', ',')} ${asort?.jednostka_miary || ""}`);
            }
          }
        }

        // OPCJA C: Zasoby nieograniczone (woda, media) — wirtualna partia, brak kontroli stanu
        for (const skladnik of zlecenie.receptura.skladniki) {
          if (!skladnik.asortyment_skladnika.czy_zasob_nieograniczony) continue;
          let iloscWymagana = skladnik.ilosc_wymagana * rzeczywistaIloscNum * (1 + (skladnik.procent_strat || 0) / 100);
          if (skladnik.czy_pomocnicza && skladnik.asortyment_skladnika.przelicznik_jednostki) {
            iloscWymagana = iloscWymagana / skladnik.asortyment_skladnika.przelicznik_jednostki;
          }
          const kodTowaru = skladnik.asortyment_skladnika.kod_towaru;
          let virtualPartia = await tx.partie_Magazynowe.findFirst({
            where: { id_asortymentu: skladnik.id_asortymentu_skladnika, numer_partii: `AUTO-${kodTowaru}` }
          });
          if (!virtualPartia) {
            virtualPartia = await tx.partie_Magazynowe.create({
              data: {
                id_asortymentu: skladnik.id_asortymentu_skladnika,
                numer_partii: `AUTO-${kodTowaru}`,
                status_partii: 'Dostepna',
              }
            });
          }
          await tx.ruchy_Magazynowe.create({
            data: {
              id_partii: virtualPartia.id,
              id_zlecenia: zlecenie.id,
              typ_ruchu: 'Zuzycie',
              ilosc: -iloscWymagana,
              cena_jednostkowa: 0,
              referencja_dokumentu: rwNumber,
              id_uzytkownika: user.id,
            }
          });
        }

        // 1.5. Zwolnienie rezerwacji
        await tx.rezerwacje_Magazynowe.updateMany({
          where: { id_zlecenia: zlecenie.id, status: "Aktywna" },
          data: { status: "Zrealizowana" }
        });

        // 2. Przyjęcie wyrobu gotowego z kalkulacją shelf-life i kosztem
        const recepturaFull = await tx.receptury.findUnique({ where: { id: zlecenie.id_receptury } });
        const terminWaznosci = recepturaFull?.dni_trwalosci
          ? new Date(Date.now() + recepturaFull.dni_trwalosci * 24 * 60 * 60 * 1000)
          : null;

        const nowaPartia = await tx.partie_Magazynowe.create({
          data: {
            id_asortymentu: zlecenie.receptura.id_asortymentu_docelowego,
            numer_partii: pwNumber,
            data_produkcji: new Date(),
            termin_waznosci: terminWaznosci,
            status_partii: "Dostepna",
          },
        });

        const nowaCenaJednostkowa = rzeczywistaIloscNum > 0 ? (totalCost / rzeczywistaIloscNum) : 0;

        await tx.ruchy_Magazynowe.create({
          data: {
            id_partii: nowaPartia.id,
            id_zlecenia: zlecenie.id,
            typ_ruchu: "Przyjecie_Z_Produkcji",
            ilosc: rzeczywistaIloscNum,
            cena_jednostkowa: nowaCenaJednostkowa,
            referencja_dokumentu: pwNumber,
            id_uzytkownika: user.id,
          },
        });

        // 3. Zmiana statusu zlecenia i zapisanie rzeczywistej ilości
        const zaktualizowaneZlecenie = await tx.zlecenia_Produkcyjne.update({
          where: { id: zlecenie.id },
          data: {
            status: "Zrealizowane",
            rzeczywista_ilosc_wyrobu: rzeczywistaIloscNum,
            opakowania_json: opakowania && Array.isArray(opakowania) && opakowania.length > 0
              ? JSON.stringify(opakowania)
              : null,
          },
        });

        return zaktualizowaneZlecenie;
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd realizacji zlecenia" });
    }
  });

router.post("/api/produkcja/:id/rozpocznij", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika");

      const result = await prisma.$transaction(async (tx) => {
        const zlecenie = await tx.zlecenia_Produkcyjne.findUnique({
          where: { id },
          include: { receptura: { include: { skladniki: { include: { asortyment_skladnika: true } } } } }
        });
        if (!zlecenie) throw new Error("Nie znaleziono zlecenia");
        if (zlecenie.status !== "Planowane") throw new Error("Zlecenie nie jest w statusie Planowane");

        for (const skladnik of zlecenie.receptura.skladniki) {
          if (skladnik.asortyment_skladnika.czy_zasob_nieograniczony) continue; // zasób nieograniczony — bez rezerwacji

          let wymaganaIlosc = skladnik.ilosc_wymagana * zlecenie.planowana_ilosc_wyrobu * (1 + (skladnik.procent_strat || 0) / 100);

          if (skladnik.czy_pomocnicza && skladnik.asortyment_skladnika.przelicznik_jednostki) {
            wymaganaIlosc = wymaganaIlosc / skladnik.asortyment_skladnika.przelicznik_jednostki;
          }

          // Sprawdzenie całkowitej dostępności asortymentu (suma wszystkich partii - suma wszystkich rezerwacji)
          const dbPartie = await tx.partie_Magazynowe.findMany({
            where: { id_asortymentu: skladnik.id_asortymentu_skladnika, status_partii: "Dostepna", czy_aktywne: true },
            include: { 
              ruchy_magazynowe: { where: { czy_aktywne: true } }, 
              rezerwacje: { where: { czy_aktywne: true, status: "Aktywna" } } 
            }
          });

          // Rezerwacje globalne dla tego asortymentu (nieprzypisane do partii)
          const globalneRezerwacje = await tx.rezerwacje_Magazynowe.findMany({
            where: { id_asortymentu: skladnik.id_asortymentu_skladnika, id_partii: null, czy_aktywne: true, status: "Aktywna" }
          });

          let totalStan = 0;
          let totalZarezerwowane = globalneRezerwacje.reduce((sum, r) => sum + r.ilosc_zarezerwowana, 0);

          for (const p of dbPartie) {
            totalStan += p.ruchy_magazynowe.reduce((sum, r) => sum + r.ilosc, 0);
            totalZarezerwowane += p.rezerwacje.reduce((sum, r) => sum + r.ilosc_zarezerwowana, 0);
          }

          const dostepne = totalStan - totalZarezerwowane;

          if (dostepne < wymaganaIlosc - 0.001) {
            throw new Error(`Brak wystarczającej ilości: ${skladnik.asortyment_skladnika.nazwa}. Całkowita dostępna ilość: ${dostepne.toFixed(3).replace('.', ',')} ${skladnik.asortyment_skladnika.jednostka_miary}. Potrzeba: ${wymaganaIlosc.toFixed(3).replace('.', ',')}`);
          }

          // Tworzymy REZERWACJĘ ILOŚCIOWĄ (miękką) - nie przypisaną do konkretnej partii
          await tx.rezerwacje_Magazynowe.create({
            data: { 
              id_asortymentu: skladnik.id_asortymentu_skladnika, 
              id_zlecenia: zlecenie.id, 
              ilosc_zarezerwowana: wymaganaIlosc,
              id_partii: null // To jest kluczowe!
            }
          });
        }

        return tx.zlecenia_Produkcyjne.update({ where: { id }, data: { status: "W_toku" } });
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd rozpoczęcia zlecenia" });
    }
  });

router.put("/api/produkcja/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { planowana_ilosc_wyrobu } = req.body;

      const zlecenie = await prisma.zlecenia_Produkcyjne.findUnique({ where: { id } });
      if (!zlecenie) return res.status(404).json({ error: "Nie znaleziono zlecenia" });
      if (zlecenie.status !== "Planowane") return res.status(400).json({ error: "Edycja możliwa tylko dla zleceń w statusie Planowane" });

      const qty = parseFloat(planowana_ilosc_wyrobu);
      if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: "Nieprawidłowa ilość" });

      const updated = await prisma.zlecenia_Produkcyjne.update({
        where: { id },
        data: { planowana_ilosc_wyrobu: qty },
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

router.delete("/api/produkcja/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await prisma.$transaction(async (tx) => {
        const zlecenie = await tx.zlecenia_Produkcyjne.findUnique({
          where: { id },
          include: { rezerwacje: true }
        });

        if (!zlecenie) throw new Error("Nie znaleziono zlecenia");

        if (zlecenie.status === "Zrealizowane") throw new Error("Nie można usunąć zrealizowanego zlecenia");

        // Usuń rezerwacje (jeśli istnieją)
        await tx.rezerwacje_Magazynowe.deleteMany({
          where: { id_zlecenia: id }
        });

        if (zlecenie.status === "Planowane") {
          // Planowane: twarde usunięcie (soft delete)
          return tx.zlecenia_Produkcyjne.update({
            where: { id },
            data: { czy_aktywne: false }
          });
        } else {
          // W_toku: anulowanie (zachowujemy historię)
          return tx.zlecenia_Produkcyjne.update({
            where: { id },
            data: { status: "Anulowane" }
          });
        }
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd usuwania zlecenia" });
    }
  });

router.get("/sesja-robocza", async (_req, res) => {
    try {
      const rows = await (prisma as any).sesja_Robocza.findMany({
        orderBy: { zaktualizowano_dnia: "desc" },
        select: { id: true, krok: true, nazwa: true, zaktualizowano_dnia: true, dane_json: true },
      });
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.delete("/sesja-robocza", async (_req, res) => {
    try {
      await (prisma as any).sesja_Robocza_Log.deleteMany();
      await (prisma as any).sesja_Robocza.deleteMany();
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

export default router;
