import { getBuforWzByPartia } from "../utils/magazyn";
import { Router } from "express";
import { prisma } from "../db";
import { generateDocNumber, generateSesjaNumber, generateZlecenieNumber } from "../utils/docNumbers";
import { generateDocumentHTML, generatePDF } from "../../server-pdf";

const router = Router();

router.get("/api/dokumenty", async (req, res) => {
    try {
      const { typ: filterTyp } = req.query;
      const dokumentyMap = new Map();

      // PZ/WZ/RW(nagłówek) — pobieramy z Dokumenty_Magazynowe (żródło prawdy)
      const showPZ = !filterTyp || filterTyp === "all" || filterTyp === "PZ";
      const showWZ = !filterTyp || filterTyp === "all" || filterTyp === "WZ";
      const showRW = !filterTyp || filterTyp === "all" || filterTyp === "RW";

      let rwDocRefs: string[] = [];

      if (showPZ || showWZ || showRW) {
        const headerTypList: string[] = [];
        if (showPZ) headerTypList.push("PZ");
        if (showWZ) headerTypList.push("WZ");
        if (showRW) headerTypList.push("RW");
        const headerWhere: any = { typ: headerTypList.length === 1 ? headerTypList[0] : { in: headerTypList } };

        const headers = await prisma.dokumenty_Magazynowe.findMany({
          where: headerWhere,
          include: { uzytkownik_utworzenia: true, kontrahent: true },
          orderBy: { utworzono_dnia: 'desc' }
        });

        const refs = headers.map(h => h.referencja);
        const ruchy = refs.length > 0 ? await prisma.ruchy_Magazynowe.findMany({
          where: { referencja_dokumentu: { in: refs } },
          include: { partia: { include: { asortyment: true } } }
        }) : [];

        const ruchyByRef = new Map<string, typeof ruchy>();
        ruchy.forEach(r => {
          const ref = r.referencja_dokumentu!;
          if (!ruchyByRef.has(ref)) ruchyByRef.set(ref, []);
          ruchyByRef.get(ref)!.push(r);
        });

        for (const header of headers) {
          const docRuchy = ruchyByRef.get(header.referencja) || [];
          dokumentyMap.set(header.referencja, {
            referencja: header.referencja,
            typ: header.typ,
            status: header.status,
            data: header.utworzono_dnia,
            uzytkownik: header.uzytkownik_utworzenia.login,
            numer_zlecenia: null,
            numer_zewnetrzny: (header as any).numer_zewnetrzny || null,
            kontrahent: (header as any).kontrahent ? { id: (header as any).kontrahent.id, kod: (header as any).kontrahent.kod, nazwa: (header as any).kontrahent.nazwa } : null,
            pozycje: docRuchy.map(r => ({
              id_asortymentu: r.partia.id_asortymentu,
              asortyment: r.partia.asortyment.nazwa,
              kod_towaru: r.partia.asortyment.kod_towaru,
              numer_partii: r.partia.numer_partii,
              ilosc: Math.abs(r.ilosc),
              jednostka: r.partia.asortyment.jednostka_miary,
              termin_waznosci: r.partia.termin_waznosci,
              data_produkcji: r.partia.data_produkcji,
              cena_jednostkowa: r.cena_jednostkowa || 0,
              wartosc: (r.cena_jednostkowa || 0) * Math.abs(r.ilosc)
            }))
          });
        }
        rwDocRefs = headers.filter(h => h.typ === "RW").map(h => h.referencja);
      }

      // PW/RW(ruchy) — pobieramy z Ruchy_Magazynowe (brak statusów, bez pokrytych przez nagłówki)
      const showPW = !filterTyp || filterTyp === "all" || filterTyp === "PW";

      if (showPW || showRW) {
        const ruchTypy: string[] = [];
        if (showPW) ruchTypy.push("Przyjecie_Z_Produkcji");
        if (showRW) ruchTypy.push("Zuzycie", "Strata");

        const ruchWhere: any = { typ_ruchu: { in: ruchTypy }, czy_aktywne: true };
        if (showRW && rwDocRefs.length > 0) {
          ruchWhere.OR = [
            { referencja_dokumentu: null },
            { referencja_dokumentu: { notIn: rwDocRefs } },
          ];
        }

        const ruchy = await prisma.ruchy_Magazynowe.findMany({
          where: ruchWhere,
          include: { partia: { include: { asortyment: true } }, zlecenie: true, uzytkownik: true },
          orderBy: { utworzono_dnia: 'desc' }
        });

        ruchy.forEach(ruch => {
          const ref = ruch.referencja_dokumentu || ruch.id;
          if (!dokumentyMap.has(ref)) {
            dokumentyMap.set(ref, {
              referencja: ref,
              typ: ruch.typ_ruchu === "Przyjecie_Z_Produkcji" ? "PW" : "RW",
              status: "Zatwierdzony",
              data: ruch.utworzono_dnia,
              uzytkownik: ruch.uzytkownik?.login || "system",
              numer_zlecenia: ruch.zlecenie?.numer_zlecenia || null,
              pozycje: []
            });
          }
          const doc = dokumentyMap.get(ref);
          doc.pozycje.push({
            id_asortymentu: ruch.partia.id_asortymentu,
            asortyment: ruch.partia.asortyment.nazwa,
            kod_towaru: ruch.partia.asortyment.kod_towaru,
            numer_partii: ruch.partia.numer_partii,
            ilosc: Math.abs(ruch.ilosc),
            jednostka: ruch.partia.asortyment.jednostka_miary,
            termin_waznosci: ruch.partia.termin_waznosci,
            data_produkcji: ruch.partia.data_produkcji,
            cena_jednostkowa: ruch.cena_jednostkowa || 0,
            wartosc: (ruch.cena_jednostkowa || 0) * Math.abs(ruch.ilosc)
          });
        });
      }

      // ZP — zlecenia produkcyjne
      if (!filterTyp || filterTyp === "all") {
        const zlecenia = await prisma.zlecenia_Produkcyjne.findMany({
          where: { czy_aktywne: true },
          include: { receptura: { include: { asortyment_docelowy: true } } },
          orderBy: { utworzono_dnia: 'desc' }
        });
        zlecenia.forEach(zl => {
          const ref = zl.numer_zlecenia || `ZP-${zl.id.substring(0, 8)}`;
          dokumentyMap.set(ref, {
            referencja: ref,
            typ: "ZP",
            status: "Zatwierdzony",
            data: zl.utworzono_dnia,
            uzytkownik: "system",
            numer_zlecenia: ref,
            pozycje: [{
              id_asortymentu: zl.receptura.id_asortymentu_docelowego,
              asortyment: zl.receptura.asortyment_docelowy.nazwa,
              kod_towaru: zl.receptura.asortyment_docelowy.kod_towaru,
              numer_partii: "-",
              ilosc: zl.planowana_ilosc_wyrobu,
              jednostka: zl.receptura.asortyment_docelowy.jednostka_miary,
              termin_waznosci: null
            }]
          });
        });
      }

      const result = Array.from(dokumentyMap.values())
        .map(d => ({ ...d, wartosc_calkowita: d.pozycje.reduce((s: number, p: any) => s + (p.wartosc || 0), 0) }))
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Błąd pobierania dokumentów" });
    }
  });

router.put("/api/dokumenty/:ref", async (req, res) => {
    try {
      const { ref } = req.params;
      const userId = (req as any).userId;

      // Pobierz dokument
      const doc = await prisma.dokumenty_Magazynowe.findUnique({ where: { referencja: ref } });
      if (!doc) return res.status(404).json({ error: "Dokument nie istnieje" });
      if (doc.status !== "Bufor") return res.status(400).json({ error: "Można edytować tylko dokumenty w statusie Bufor" });
      if (doc.typ === "PW") return res.status(400).json({ error: "Dokumenty PW nie podlegają ręcznej edycji" });

      const { pozycje, referencja_zewnetrzna, id_kontrahenta, data_dostawy } = req.body;

      if (!pozycje || pozycje.length === 0) return res.status(400).json({ error: "Lista pozycji nie może być pusta" });

      // Walidacja specyficzna dla typu
      if (doc.typ === "WZ" && !id_kontrahenta) return res.status(400).json({ error: "Kontrahent jest wymagany dla dokumentu WZ" });

      await prisma.$transaction(async (tx) => {
        // Nadpisz pozycje_json
        const updateData: any = {
          pozycje_json: JSON.stringify(pozycje),
          numer_zewnetrzny: referencja_zewnetrzna || null,
        };
        if (doc.typ === "WZ") {
          updateData.id_kontrahenta = id_kontrahenta;
          updateData.data_dostawy = data_dostawy ? new Date(data_dostawy) : null;
        }
        await tx.dokumenty_Magazynowe.update({ where: { referencja: ref }, data: updateData });

        // Usuń stare ruchy i utwórz nowe (bufor — nieaktywne)
        await tx.ruchy_Magazynowe.deleteMany({ where: { referencja_dokumentu: ref } });

        const user = await tx.uzytkownicy.findFirst();
        if (!user) throw new Error("Brak użytkownika w systemie");

        if (doc.typ === "WZ") {
          for (const item of pozycje) {
            const { id_partii, ilosc } = item;
            const parsedIlosc = parseFloat(ilosc);
            if (!id_partii || isNaN(parsedIlosc) || parsedIlosc <= 0) throw new Error("Nieprawidłowe dane pozycji WZ");
            const partia = await tx.partie_Magazynowe.findUnique({ where: { id: id_partii } });
            if (!partia) throw new Error(`Partia ${id_partii} nie istnieje`);
            // Cena ważona z aktywnych ruchów przyjęcia
            const pzRuchy = await tx.ruchy_Magazynowe.findMany({
              where: { id_partii, cena_jednostkowa: { not: null }, ilosc: { gt: 0 }, czy_aktywne: true }
            });
            let cena_jednostkowa: number | null = null;
            if (pzRuchy.length > 0) {
              const totalIlosc = pzRuchy.reduce((s, r) => s + r.ilosc, 0);
              const totalWartosc = pzRuchy.reduce((s, r) => s + r.ilosc * (r.cena_jednostkowa || 0), 0);
              if (totalIlosc > 0) cena_jednostkowa = totalWartosc / totalIlosc;
            }
            await tx.ruchy_Magazynowe.create({
              data: { id_partii, typ_ruchu: "WZ", ilosc: -parsedIlosc, cena_jednostkowa, referencja_dokumentu: ref, id_uzytkownika: user.id, czy_aktywne: false },
            });
          }
        } else if (doc.typ === "RW") {
          for (const item of pozycje) {
            const { id_partii, ilosc } = item;
            const parsedIlosc = parseFloat(ilosc);
            if (!id_partii || isNaN(parsedIlosc) || parsedIlosc <= 0) throw new Error("Nieprawidłowe dane pozycji RW");
            await tx.ruchy_Magazynowe.create({
              data: { id_partii, typ_ruchu: "Zuzycie", ilosc: -parsedIlosc, referencja_dokumentu: ref, id_uzytkownika: user.id, czy_aktywne: false },
            });
          }
        } else if (doc.typ === "PZ") {
          for (const item of pozycje) {
            const { id_asortymentu, numer_partii, ilosc, cena_jednostkowa, data_produkcji, termin_waznosci } = item;
            const parsedIlosc = parseFloat(ilosc);
            if (!numer_partii || isNaN(parsedIlosc) || parsedIlosc <= 0) throw new Error("Nieprawidłowe dane pozycji PZ");
            // Znajdź lub utwórz partię (tak jak w POST /api/magazyn/pz)
            let partia = await tx.partie_Magazynowe.findUnique({ where: { numer_partii } });
            if (!partia) {
              if (!id_asortymentu) throw new Error(`Brak ID asortymentu dla partii ${numer_partii}`);
              partia = await tx.partie_Magazynowe.create({
                data: {
                  id_asortymentu,
                  numer_partii,
                  data_produkcji: data_produkcji ? new Date(data_produkcji) : null,
                  termin_waznosci: termin_waznosci ? new Date(termin_waznosci) : null,
                  status_partii: "Dostepna",
                },
              });
            }
            await tx.ruchy_Magazynowe.create({
              data: { id_partii: partia.id, typ_ruchu: "PZ", ilosc: parsedIlosc, cena_jednostkowa: cena_jednostkowa ?? null, referencja_dokumentu: ref, id_uzytkownika: user.id, czy_aktywne: false },
            });
          }
        }
      });

      const updated = await prisma.dokumenty_Magazynowe.findUnique({ where: { referencja: ref } });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

router.post("/api/dokumenty/:ref/zatwierdz", async (req, res) => {
    try {
      const ref = decodeURIComponent(req.params.ref);
      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const header = await prisma.dokumenty_Magazynowe.findUnique({ where: { referencja: ref } });
      if (!header) return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      if (header.status !== "Bufor") return res.status(400).json({ error: `Dokument jest już w stanie: ${header.status}` });

      await prisma.$transaction(async (tx) => {
        const ruchy = await tx.ruchy_Magazynowe.findMany({
          where: { referencja_dokumentu: ref },
          include: { partia: { include: { ruchy_magazynowe: { where: { czy_aktywne: true } } } } }
        });

        if (header.typ === "WZ" || header.typ === "RW") {
          // Sprawdź dostępność przed aktywacją
          const niedobory: string[] = [];
          for (const ruch of ruchy) {
            const stanAktywny = ruch.partia.ruchy_magazynowe.reduce((s, r) => s + r.ilosc, 0);
            const wymagana = Math.abs(ruch.ilosc);
            if (stanAktywny < wymagana - 0.0001) {
              niedobory.push(`${ruch.partia.numer_partii}: dostępne ${stanAktywny.toFixed(3).replace('.', ',')}, wymagane ${wymagana.toFixed(3).replace('.', ',')}`);
            }
          }
          if (niedobory.length > 0) {
            throw new Error(`Niewystarczający stan magazynowy:\n${niedobory.join('\n')}`);
          }
        }

        await tx.ruchy_Magazynowe.updateMany({
          where: { referencja_dokumentu: ref },
          data: { czy_aktywne: true }
        });

        const updateResult = await tx.dokumenty_Magazynowe.updateMany({
          where: { referencja: ref, status: "Bufor" },
          data: {
            status: "Zatwierdzony",
            id_uzytkownika_zatwierdzenia: user.id,
            data_zatwierdzenia: new Date()
          }
        });

        if (updateResult.count === 0) {
          throw new Error("Wyścig żądań: Dokument nie jest w Buforze lub został już zatwierdzony");
        }

        // ── AUTOMATYCZNA CYRKULACJA OPAKOWAŃ ────────────────────────────────
        if (header.typ === "WZ") {
          // Wydanie zewnętrzne (WZ) -> WYDA opakowania do kontrahenta
          if (header.pozycje_json) {
            try {
              const pozycje = JSON.parse(header.pozycje_json) as any[];
              const countsToCreate = new Map<string, number>(); // id_asortymentu -> totalCount

              for (const p of pozycje) {
                if (!p.sztuki || typeof p.sztuki !== "object") continue;
                
                // Pobierz partię aby uzyskać mapping id_asortymentu dla opakowań
                const partia = await tx.partie_Magazynowe.findUnique({ where: { id: p.id_partii } });
                if (!partia?.opakowania_json) continue;
                const opMap = JSON.parse(partia.opakowania_json) as any[]; // [{id_asortymentu, waga_kg, nazwa}]
                
                for (const [label, count] of Object.entries(p.sztuki)) {
                  const ilosc = Number(count);
                  if (ilosc <= 0) continue;

                  // Wyciągnij nazwę i wagę z labela "Pozetti (5,0 kg)"
                  const match = label.match(/^(.*)\s+\((\d+(?:[\.,]\d+)?)\s*kg\)$/);
                  if (!match) continue;
                  const nazwaNominalna = match[1].trim();
                  const wagaNominalna = parseFloat(match[2].replace(',', '.'));
                  
                  // Szukaj pasującego id_asortymentu w mappingu partii
                  const matched = opMap.find(o => o.nazwa.trim() === nazwaNominalna && Math.abs(o.waga_kg - wagaNominalna) < 0.01);
                  if (matched && matched.id_asortymentu) {
                    countsToCreate.set(matched.id_asortymentu, (countsToCreate.get(matched.id_asortymentu) || 0) + ilosc);
                  }
                }
              }

              // Twórz skonsolidowane wpisy
              for (const [id_asort, total] of countsToCreate.entries()) {
                const packagingAsort = await tx.asortyment.findUnique({ where: { id: id_asort } });
                if (packagingAsort?.czy_zwrotne) {
                  await tx.ruchy_Opakowan_Zwrotnych.create({
                    data: {
                      id_asortymentu: id_asort,
                      ilosc: total,
                      typ_ruchu: "WYDA",
                      id_kontrahenta: header.id_kontrahenta,
                      referencja_dokumentu: ref,
                      id_uzytkownika: user.id,
                      uwagi: `Automat WZ: ${ref}`
                    }
                  });
                }
              }
            } catch (e) { console.error("Błąd automatycznej cyrkulacji WZ:", e); }
          }
        } else if (header.typ === "PZ") {
          // Przyjęcie zewnętrzne (PZ) -> PRZYJECIE lub ZWROT (jeśli od kontrahenta)
          const ruchyPZ = await tx.ruchy_Magazynowe.findMany({
            where: { referencja_dokumentu: ref },
            include: { partia: { include: { asortyment: true } } }
          });
          
          const countsToCreatePZ = new Map<string, number>();
          for (const r of ruchyPZ) {
             if (r.partia.asortyment.czy_zwrotne) {
               const id = r.partia.asortyment.id;
               countsToCreatePZ.set(id, (countsToCreatePZ.get(id) || 0) + Math.abs(r.ilosc));
             }
          }

          for (const [id_asort, total] of countsToCreatePZ.entries()) {
             await tx.ruchy_Opakowan_Zwrotnych.create({
               data: {
                 id_asortymentu: id_asort,
                 ilosc: Math.round(total), // zaokrąglenie do Int (opakowania są zwykle całkowite)
                 typ_ruchu: header.id_kontrahenta ? "ZWROT" : "PRZYJECIE",
                 id_kontrahenta: header.id_kontrahenta,
                 referencja_dokumentu: ref,
                 id_uzytkownika: user.id,
                 uwagi: `Automat PZ: ${ref}`
               }
             });
          }
        }
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd zatwierdzania dokumentu" });
    }
  });

router.post("/api/dokumenty/:ref/anuluj", async (req, res) => {
    try {
      const ref = decodeURIComponent(req.params.ref);
      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const header = await prisma.dokumenty_Magazynowe.findUnique({ where: { referencja: ref } });
      if (!header) return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      if (header.status === "Anulowany") return res.status(400).json({ error: "Dokument jest już anulowany" });

      await prisma.$transaction(async (tx) => {
        if (header.status === "Zatwierdzony" && header.typ === "PZ") {
          // Anulowanie zatwierdzonego PZ: sprawdź czy deaktywacja nie spowoduje ujemnych stanów
          const ruchy = await tx.ruchy_Magazynowe.findMany({
            where: { referencja_dokumentu: ref, czy_aktywne: true },
            include: { partia: { include: { ruchy_magazynowe: { where: { czy_aktywne: true } } } } }
          });

          const niedobory: string[] = [];
          for (const ruch of ruchy) {
            const stanAktywny = ruch.partia.ruchy_magazynowe.reduce((s, r) => s + r.ilosc, 0);
            // Po deaktywacji tego ruchu, stan = stanAktywny - ruch.ilosc (który jest dodatni dla PZ)
            const stanPo = stanAktywny - ruch.ilosc;
            if (stanPo < -0.001) {
              niedobory.push(`${ruch.partia.numer_partii}: stan ${stanAktywny.toFixed(3).replace('.', ',')}, cofnięcie ${ruch.ilosc.toFixed(3).replace('.', ',')} → niedobór`);
            }
          }
          if (niedobory.length > 0) {
            throw new Error(`Nie można anulować — towar już rozchodowany:\n${niedobory.join('\n')}`);
          }
        }

        // Dezaktywuj ruchy (dla Bufor — ruchy już są nieaktywne, dla Zatwierdzony — deaktywuj)
        await tx.ruchy_Magazynowe.updateMany({
          where: { referencja_dokumentu: ref },
          data: { czy_aktywne: false }
        });

        await tx.dokumenty_Magazynowe.update({
          where: { referencja: ref },
          data: {
            status: "Anulowany",
            id_uzytkownika_anulowania: user.id,
            data_anulowania: new Date()
          }
        });

        // Usuń automatyczne ruchy opakowań zwrotnych
        await tx.ruchy_Opakowan_Zwrotnych.deleteMany({
          where: { referencja_dokumentu: ref }
        });
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd anulowania dokumentu" });
    }
  });

router.post("/api/dokumenty/:ref/wystaw-fakture", async (req, res) => {
    try {
      const ref = decodeURIComponent(req.params.ref);
      const header = await prisma.dokumenty_Magazynowe.findUnique({ where: { referencja: ref } });
      if (!header) return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      if (header.typ !== "WZ") return res.status(400).json({ error: "Akcja dotyczy tylko dokumentów WZ" });
      if (header.status !== "Zatwierdzony") return res.status(400).json({ error: "Dokument musi być w statusie Zatwierdzony, aby wystawić fakturę" });

      await prisma.dokumenty_Magazynowe.update({
        where: { referencja: ref },
        data: { status: "Faktura wystawiona" }
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd zmiany statusu faktury" });
    }
  });

router.post("/api/dokumenty/:ref/cofnij-fakture", async (req, res) => {
    try {
      const ref = decodeURIComponent(req.params.ref);
      const header = await prisma.dokumenty_Magazynowe.findUnique({ where: { referencja: ref } });
      if (!header) return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      if (header.typ !== "WZ") return res.status(400).json({ error: "Akcja dotyczy tylko dokumentów WZ" });
      if (header.status !== "Faktura wystawiona") return res.status(400).json({ error: "Dokument nie ma statusu Faktura wystawiona" });

      await prisma.dokumenty_Magazynowe.update({
        where: { referencja: ref },
        data: { status: "Zatwierdzony" }
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd cofania statusu faktury" });
    }
  });

router.delete("/api/dokumenty/:ref", async (req, res) => {
    try {
      const ref = decodeURIComponent(req.params.ref);

      const header = await prisma.dokumenty_Magazynowe.findUnique({ where: { referencja: ref } });
      if (!header) return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      if (header.status !== "Bufor") return res.status(400).json({ error: "Można usunąć tylko dokument w stanie Bufor" });

      await prisma.$transaction(async (tx) => {
        const ruchy = await tx.ruchy_Magazynowe.findMany({ where: { referencja_dokumentu: ref } });
        const partieIds = [...new Set(ruchy.map(r => r.id_partii))];

        await tx.ruchy_Magazynowe.deleteMany({ where: { referencja_dokumentu: ref } });

        // Dla PZ: usuń partie które nie mają już żadnych ruchów
        if (header.typ === "PZ") {
          for (const partiaId of partieIds) {
            const rezerwacje = await tx.rezerwacje_Magazynowe.count({ where: { id_partii: partiaId } });
            if (rezerwacje > 0) {
              throw new Error("Nie można usunąć dokumentu PZ: przyjęte partie posiadają już aktywne rezerwacje.");
            }
            const pozostale = await tx.ruchy_Magazynowe.count({ where: { id_partii: partiaId } });
            if (pozostale === 0) {
              await tx.partie_Magazynowe.delete({ where: { id: partiaId } });
            }
          }
        }

        await tx.dokumenty_Magazynowe.delete({ where: { referencja: ref } });
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd usuwania dokumentu" });
    }
  });

router.get("/api/next-doc-number/:prefix", async (req, res) => {
    try {
      const prefix = req.params.prefix.toUpperCase();
      const number = await generateDocNumber(prisma, prefix);
      res.json({ number });
    } catch (error) {
      res.status(500).json({ error: "Błąd generowania numeru" });
    }
  });

router.get("/api/dokumenty/edit/:referencja", async (req, res) => {
    try {
      const referencja = decodeURIComponent(req.params.referencja);
      const header = await prisma.dokumenty_Magazynowe.findUnique({
        where: { referencja },
        include: { kontrahent: true }
      });
      if (!header) return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      if (header.status !== "Bufor") return res.status(400).json({ error: "Można edytować tylko dokumenty w statusie Bufor" });

      // Pobierz ruchy z pełnymi danymi partii i asortymentu
      const ruchy = await prisma.ruchy_Magazynowe.findMany({
        where: { referencja_dokumentu: referencja },
        include: { partia: { include: { asortyment: true } } },
        orderBy: { utworzono_dnia: 'asc' }
      });

      // Parsuj pozycje_json — zawiera oryginalne dane (sztuki, ceny) przed rozwinięciem
      let pozycjeJson: any[] = [];
      if (header.pozycje_json) {
        try { pozycjeJson = JSON.parse(header.pozycje_json); } catch {}
      }

      // Zbuduj mapę id_partii -> dane z pozycje_json
      const jsonByPartia = new Map<string, any>();
      for (const p of pozycjeJson) {
        if (p.id_partii) jsonByPartia.set(p.id_partii, p);
      }

      // Scal ruchy (unikalne partie) z danymi z pozycje_json
      const seen = new Set<string>();
      const pozycje = [];
      for (const r of ruchy) {
        if (seen.has(r.id_partii)) continue;
        seen.add(r.id_partii);
        const json = jsonByPartia.get(r.id_partii) || {};
        const ilosc_kg = Math.abs(r.ilosc);
        // Dla WZ z opakowaniami: ilosc w kg z ruchu, sztuki z pozycje_json
        pozycje.push({
          id_partii: r.id_partii,
          id_asortymentu: r.partia.id_asortymentu,
          typ_asortymentu: r.partia.asortyment.typ_asortymentu,
          asortyment: r.partia.asortyment.nazwa,
          kod_towaru: r.partia.asortyment.kod_towaru,
          jednostka: r.partia.asortyment.jednostka_miary,
          numer_partii: r.partia.numer_partii,
          ilosc: ilosc_kg,
          sztuki: json.sztuki || {},
          cena_netto: json.cena_netto ?? null,
          stawka_vat: json.stawka_vat ?? null,
          cena_jednostkowa: r.cena_jednostkowa ?? null,
          data_produkcji: r.partia.data_produkcji,
          termin_waznosci: r.partia.termin_waznosci,
        });
      }

      res.json({
        referencja,
        typ: header.typ,
        status: header.status,
        numer_zewnetrzny: (header as any).numer_zewnetrzny || null,
        data_dostawy: (header as any).data_dostawy || null,
        kontrahent: header.kontrahent ? { id: header.kontrahent.id, kod: header.kontrahent.kod, nazwa: header.kontrahent.nazwa } : null,
        pozycje,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

router.get("/api/dokumenty/podglad/:referencja", async (req, res) => {
    try {
      const { referencja } = req.params;

      // Pobierz nagłówek (jeśli istnieje) — zwłaszcza dla PZ/WZ
      const header = await prisma.dokumenty_Magazynowe.findUnique({
        where: { referencja },
        include: { uzytkownik_utworzenia: true, uzytkownik_zatwierdzenia: true, uzytkownik_anulowania: true, kontrahent: true }
      });

      // Pobierz wszystkie ruchy (włącznie z nieaktywnymi dla BUFOR)
      const ruchy = await prisma.ruchy_Magazynowe.findMany({
        where: { referencja_dokumentu: referencja },
        include: {
          partia: { include: { asortyment: true } },
          zlecenie: true,
          uzytkownik: true
        },
        orderBy: { utworzono_dnia: 'asc' }
      });

      if (ruchy.length === 0 && !header) {
        return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      }

      const firstRuch = ruchy[0];
      const status = header?.status || "Zatwierdzony";

      // Parse sztuki + ceny z pozycje_json
      let sztukiByPartia: Record<string, Record<string, number>> = {};
      let cenyByPartia: Record<string, { cena_brutto: number | null; cena_netto: number | null; stawka_vat: number | null }> = {};
      if (header?.pozycje_json) {
        try {
          const parsed = JSON.parse(header.pozycje_json) as { id_partii: string; sztuki?: Record<string, number>; cena_brutto?: number | null; cena_netto?: number | null; stawka_vat?: number | null }[];
          parsed.forEach(p => {
            sztukiByPartia[p.id_partii] = p.sztuki || {};
            cenyByPartia[p.id_partii] = { cena_brutto: p.cena_brutto ?? null, cena_netto: p.cena_netto ?? null, stawka_vat: p.stawka_vat ?? null };
          });
        } catch {}
      }

      const allOpIds = new Set<string>();
      for (const r of ruchy) {
        if (r.typ_ruchu === "Przyjecie_Z_Produkcji" && r.partia.opakowania_json) {
          try {
            const ops = JSON.parse(r.partia.opakowania_json) as { id_asortymentu: string; waga_kg: number }[];
            ops.forEach(o => { if (o.id_asortymentu) allOpIds.add(o.id_asortymentu); });
          } catch {}
        }
      }
      const opNazwy = await prisma.asortyment.findMany({ where: { id: { in: [...allOpIds] } }, select: { id: true, nazwa: true } });
      const opNazwyMap: Record<string, string> = {};
      opNazwy.forEach(a => opNazwyMap[a.id] = a.nazwa);

      // Dla PW: przelicz koszt/kg z bieżących cena_zakupu składników (tak jak zakładka Koszty)
      const kosztyPerKgByZlecenie: Record<string, number> = {};
      const pwRuchyIds = [...new Set(ruchy.filter(r => r.typ_ruchu === 'Przyjecie_Z_Produkcji' && r.id_zlecenia).map(r => r.id_zlecenia as string))];
      if (pwRuchyIds.length > 0) {
        const zuzycieRuchy = await prisma.ruchy_Magazynowe.findMany({
          where: { id_zlecenia: { in: pwRuchyIds }, typ_ruchu: 'Zuzycie', czy_aktywne: true },
          include: { partia: { include: { asortyment: true } } },
        });
        for (const zlId of pwRuchyIds) {
          const zuzycie = zuzycieRuchy.filter(r => r.id_zlecenia === zlId);
          const totalKoszt = zuzycie.reduce((sum, r) => {
            const cenaZakupu = (r.partia.asortyment as any).cena_zakupu ?? 0;
            return sum + Math.abs(r.ilosc) * cenaZakupu;
          }, 0);
          const pwRuch = ruchy.find(r => r.id_zlecenia === zlId && r.typ_ruchu === 'Przyjecie_Z_Produkcji');
          const iloscWyrobu = pwRuch ? pwRuch.ilosc : 0;
          kosztyPerKgByZlecenie[zlId] = iloscWyrobu > 0 ? totalKoszt / iloscWyrobu : 0;
        }
      }

      let wartosc_calkowita = 0;
      const pozycje: any[] = [];
      for (const r of ruchy) {
        const ilosc = Math.abs(r.ilosc);
        const cena = r.typ_ruchu === 'Przyjecie_Z_Produkcji'
          ? (r.id_zlecenia ? (kosztyPerKgByZlecenie[r.id_zlecenia] ?? r.cena_jednostkowa ?? 0) : (r.cena_jednostkowa ?? 0))
          : r.typ_ruchu === 'PZ'
          ? (r.cena_jednostkowa ?? (r.partia.asortyment as any).cena_zakupu ?? 0)
          : ((r.partia.asortyment as any).cena_zakupu ?? 0);
        let sztuki = sztukiByPartia[r.id_partii] || {};

        if (r.typ_ruchu === "Przyjecie_Z_Produkcji" && r.partia.opakowania_json) {
          try {
            const parsedOp = JSON.parse(r.partia.opakowania_json) as { id_asortymentu: string; waga_kg: number }[];
            sztuki = {};
            parsedOp.forEach(op => {
               const nazwa = opNazwyMap[op.id_asortymentu] || "Opakowanie";
               const k = `${nazwa} (${op.waga_kg} kg)`;
               sztuki[k] = (sztuki[k] || 0) + 1;
            });
          } catch {}
        }

        const hasOp = Object.keys(sztuki).length > 0;

        // Fallback do kartoteki gdy pozycje_json nie ma cen (stare dokumenty)
        const katCenaNetto: number | null = (r.partia.asortyment as any).cena_sprzedazy ?? null;
        const katVat: number | null = (r.partia.asortyment as any).stawka_vat ?? null;

        if (hasOp) {
          // Rozwiń każde opakowanie jako osobną pozycję
          for (const [label, szt] of Object.entries(sztuki) as [string, number][]) {
            if (szt <= 0) continue;
            // label format: "Nazwa (X kg)" — wyciągamy wagę
            const match = label.match(/^(.*)\s+\((\d+(?:\.\d+)?)\s*kg\)$/);
            const nazwaOp = match ? match[1] : label;
            const wagaKg = match ? parseFloat(match[2]) : 0;
            const iloscKg = Math.round(szt * wagaKg * 1000) / 1000;
            const wartosc = iloscKg * cena;
            wartosc_calkowita += wartosc;
            const ceny = cenyByPartia[r.id_partii];
            const cenaNetto = ceny?.cena_netto ?? katCenaNetto;
            const stawkaVat = ceny?.stawka_vat ?? katVat;
            const cenaBrutto = ceny?.cena_brutto ?? (cenaNetto != null && stawkaVat != null ? Math.round(cenaNetto * (1 + stawkaVat / 100) * 10000) / 10000 : null);
            const cenaZKartoteki = ceny?.cena_netto == null && cenaNetto != null;
            const wartosc_netto = cenaNetto != null && iloscKg > 0 ? Math.round(cenaNetto * iloscKg * 100) / 100 : null;
            const wartosc_brutto = cenaBrutto != null && iloscKg > 0 ? Math.round(cenaBrutto * iloscKg * 100) / 100 : null;
            pozycje.push({
              id_partii: r.id_partii,
              id_asortymentu: r.partia.id_asortymentu,
              typ_asortymentu: r.partia.asortyment.typ_asortymentu,
              asortyment: nazwaOp,
              wyrob: r.partia.asortyment.nazwa,
              kod_towaru: r.partia.asortyment.kod_towaru,
              numer_partii: r.partia.numer_partii,
              ilosc: szt,
              jednostka: "szt.",
              ilosc_kg: iloscKg,
              data_produkcji: r.partia.data_produkcji,
              termin_waznosci: r.partia.termin_waznosci,
              cena_jednostkowa: cena > 0 ? cena : null,
              wartosc,
              cena_netto: cenaNetto,
              cena_brutto: cenaBrutto,
              stawka_vat: stawkaVat,
              wartosc_netto,
              wartosc_brutto,
              cena_z_kartoteki: cenaZKartoteki,
            });
          }
        } else {
          const wartosc = ilosc * cena;
          wartosc_calkowita += wartosc;
          const ceny2 = cenyByPartia[r.id_partii];
          const cenaNetto2 = ceny2?.cena_netto ?? katCenaNetto;
          const stawkaVat2 = ceny2?.stawka_vat ?? katVat;
          const cenaBrutto2 = ceny2?.cena_brutto ?? (cenaNetto2 != null && stawkaVat2 != null ? Math.round(cenaNetto2 * (1 + stawkaVat2 / 100) * 10000) / 10000 : null);
          const cenaZKartoteki2 = ceny2?.cena_netto == null && cenaNetto2 != null;
          const wartosc_netto2 = cenaNetto2 != null ? Math.round(cenaNetto2 * ilosc * 100) / 100 : null;
          const wartosc_brutto2 = cenaBrutto2 != null ? Math.round(cenaBrutto2 * ilosc * 100) / 100 : null;
          pozycje.push({
            id_partii: r.id_partii,
            id_asortymentu: r.partia.id_asortymentu,
            typ_asortymentu: r.partia.asortyment.typ_asortymentu,
            asortyment: r.partia.asortyment.nazwa,
            wyrob: null,
            kod_towaru: r.partia.asortyment.kod_towaru,
            numer_partii: r.partia.numer_partii,
            ilosc,
            jednostka: r.partia.asortyment.jednostka_miary,
            ilosc_kg: r.partia.asortyment.jednostka_miary === 'szt.' && (r.partia.asortyment as any).waga_jednostkowa_kg
              ? Math.round(ilosc * ((r.partia.asortyment as any).waga_jednostkowa_kg) * 1000) / 1000
              : null,
            data_produkcji: r.partia.data_produkcji,
            termin_waznosci: r.partia.termin_waznosci,
            cena_jednostkowa: cena > 0 ? cena : null,
            wartosc,
            cena_netto: cenaNetto2,
            cena_brutto: cenaBrutto2,
            stawka_vat: stawkaVat2,
            wartosc_netto: wartosc_netto2,
            wartosc_brutto: wartosc_brutto2,
            cena_z_kartoteki: cenaZKartoteki2,
          });
        }
      }

      const typDok = firstRuch
        ? (firstRuch.typ_ruchu === "Zuzycie" || firstRuch.typ_ruchu === "Strata" ? "RW" : firstRuch.typ_ruchu === "Przyjecie_Z_Produkcji" ? "PW" : firstRuch.typ_ruchu)
        : header!.typ;

      res.json({
        referencja,
        typ: typDok,
        status,
        data: header?.utworzono_dnia || firstRuch?.utworzono_dnia,
        uzytkownik: header?.uzytkownik_utworzenia?.login || firstRuch?.uzytkownik?.login || "system",
        data_zatwierdzenia: header?.data_zatwierdzenia || null,
        uzytkownik_zatwierdzenia: header?.uzytkownik_zatwierdzenia?.login || null,
        data_anulowania: header?.data_anulowania || null,
        uzytkownik_anulowania: header?.uzytkownik_anulowania?.login || null,
        numer_zlecenia: firstRuch?.zlecenie?.numer_zlecenia || null,
        numer_zewnetrzny: (header as any)?.numer_zewnetrzny || null,
        data_dostawy: (header as any)?.data_dostawy || null,
        kontrahent: header?.kontrahent ? { id: header.kontrahent.id, kod: header.kontrahent.kod, nazwa: header.kontrahent.nazwa } : null,
        pozycje,
        wartosc_calkowita
      });
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania dokumentu" });
    }
  });

router.post("/api/pdf/generate", async (req, res) => {
    try {
      const { html, filename = 'wydruk' } = req.body;
      if (!html) {
        return res.status(400).json({ error: "Brak kodu HTML" });
      }

      const pdfBuffer = await generatePDF(html);
      res.contentType('application/pdf');
      const safeFilename = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeFilename}.pdf`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Ogólny błąd generowania PDF:', error);
      res.status(500).json({ error: "Błąd generowania PDF" });
    }
  });

router.get("/api/dokumenty/*/pdf", async (req, res) => {
    try {
      // Wyciągnij referencję z pełnej ścieżki: /api/dokumenty/WZ-4/05/26/pdf -> WZ-4/05/26
      const referencja = decodeURIComponent(req.path.replace(/^\/api\/dokumenty\//, '').replace(/\/pdf$/, ''));

      // Pobierz nagłówek (jeśli istnieje) — zwłaszcza dla PZ/WZ
      const header = await prisma.dokumenty_Magazynowe.findUnique({
        where: { referencja },
        include: { uzytkownik_utworzenia: true, uzytkownik_zatwierdzenia: true, uzytkownik_anulowania: true, kontrahent: true }
      });

      // Pobierz wszystkie ruchy (włącznie z nieaktywnymi dla BUFOR)
      const ruchy = await prisma.ruchy_Magazynowe.findMany({
        where: { referencja_dokumentu: referencja },
        include: {
          partia: { include: { asortyment: true } },
          zlecenie: true,
          uzytkownik: true
        },
        orderBy: { utworzono_dnia: 'asc' }
      });

      if (ruchy.length === 0 && !header) {
        return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      }

      const firstRuch = ruchy[0];
      const status = header?.status || "Zatwierdzony";

      // Parse sztuki + ceny z pozycje_json
      let sztukiByPartia: Record<string, Record<string, number>> = {};
      let cenyByPartia: Record<string, { cena_brutto: number | null; cena_netto: number | null; stawka_vat: number | null }> = {};
      if (header?.pozycje_json) {
        try {
          const parsed = JSON.parse(header.pozycje_json) as { id_partii: string; sztuki?: Record<string, number>; cena_brutto?: number | null; cena_netto?: number | null; stawka_vat?: number | null }[];
          parsed.forEach(p => {
            sztukiByPartia[p.id_partii] = p.sztuki || {};
            cenyByPartia[p.id_partii] = { cena_brutto: p.cena_brutto ?? null, cena_netto: p.cena_netto ?? null, stawka_vat: p.stawka_vat ?? null };
          });
        } catch {}
      }

      const allOpIds = new Set<string>();
      for (const r of ruchy) {
        if (r.typ_ruchu === "Przyjecie_Z_Produkcji" && r.partia.opakowania_json) {
          try {
            const ops = JSON.parse(r.partia.opakowania_json) as { id_asortymentu: string; waga_kg: number }[];
            ops.forEach(o => { if (o.id_asortymentu) allOpIds.add(o.id_asortymentu); });
          } catch {}
        }
      }
      const opNazwy = await prisma.asortyment.findMany({ where: { id: { in: [...allOpIds] } }, select: { id: true, nazwa: true } });
      const opNazwyMap: Record<string, string> = {};
      opNazwy.forEach(a => opNazwyMap[a.id] = a.nazwa);

      // Dla PW: przelicz koszt/kg z bieżących cena_zakupu składników (tak jak zakładka Koszty)
      const kosztyPerKgByZlecenie: Record<string, number> = {};
      const pwRuchyIds = [...new Set(ruchy.filter(r => r.typ_ruchu === 'Przyjecie_Z_Produkcji' && r.id_zlecenia).map(r => r.id_zlecenia as string))];
      if (pwRuchyIds.length > 0) {
        const zuzycieRuchy = await prisma.ruchy_Magazynowe.findMany({
          where: { id_zlecenia: { in: pwRuchyIds }, typ_ruchu: 'Zuzycie', czy_aktywne: true },
          include: { partia: { include: { asortyment: true } } },
        });
        for (const zlId of pwRuchyIds) {
          const zuzycie = zuzycieRuchy.filter(r => r.id_zlecenia === zlId);
          const totalKoszt = zuzycie.reduce((sum, r) => {
            const cenaZakupu = (r.partia.asortyment as any).cena_zakupu ?? 0;
            return sum + Math.abs(r.ilosc) * cenaZakupu;
          }, 0);
          const pwRuch = ruchy.find(r => r.id_zlecenia === zlId && r.typ_ruchu === 'Przyjecie_Z_Produkcji');
          const iloscWyrobu = pwRuch ? pwRuch.ilosc : 0;
          kosztyPerKgByZlecenie[zlId] = iloscWyrobu > 0 ? totalKoszt / iloscWyrobu : 0;
        }
      }

      const pozycje: any[] = [];
      for (const r of ruchy) {
        const ilosc = Math.abs(r.ilosc);
        const cena = r.typ_ruchu === 'Przyjecie_Z_Produkcji'
          ? (r.id_zlecenia ? (kosztyPerKgByZlecenie[r.id_zlecenia] ?? r.cena_jednostkowa ?? 0) : (r.cena_jednostkowa ?? 0))
          : r.typ_ruchu === 'PZ'
          ? (r.cena_jednostkowa ?? (r.partia.asortyment as any).cena_zakupu ?? 0)
          : ((r.partia.asortyment as any).cena_zakupu ?? 0);
        let sztuki = sztukiByPartia[r.id_partii] || {};

        if (r.typ_ruchu === "Przyjecie_Z_Produkcji" && r.partia.opakowania_json) {
          try {
            const parsedOp = JSON.parse(r.partia.opakowania_json) as { id_asortymentu: string; waga_kg: number }[];
            sztuki = {};
            parsedOp.forEach(op => {
               const nazwa = opNazwyMap[op.id_asortymentu] || "Opakowanie";
               const k = `${nazwa} (${op.waga_kg} kg)`;
               sztuki[k] = (sztuki[k] || 0) + 1;
            });
          } catch {}
        }

        const hasOp = Object.keys(sztuki).length > 0;

        // Fallback do kartoteki gdy pozycje_json nie ma cen (stare dokumenty)
        const katCenaNetto: number | null = (r.partia.asortyment as any).cena_sprzedazy ?? null;
        const katVat: number | null = (r.partia.asortyment as any).stawka_vat ?? null;

        if (hasOp) {
          // Rozwiń każde opakowanie jako osobną pozycję
          for (const [label, szt] of Object.entries(sztuki) as [string, number][]) {
            if (szt <= 0) continue;
            const match = label.match(/^(.*)\s+\((\d+(?:\.\d+)?)\s*kg\)$/);
            const nazwaOp = match ? match[1] : label;
            const wagaKg = match ? parseFloat(match[2]) : 0;
            const iloscKg = Math.round(szt * wagaKg * 1000) / 1000;
            const wartosc = iloscKg * cena;
            const ceny = cenyByPartia[r.id_partii];
            const cenaNetto = ceny?.cena_netto ?? katCenaNetto;
            const stawkaVat = ceny?.stawka_vat ?? katVat;
            const cenaBrutto = ceny?.cena_brutto ?? (cenaNetto != null && stawkaVat != null ? Math.round(cenaNetto * (1 + stawkaVat / 100) * 10000) / 10000 : null);
            const wartosc_netto = cenaNetto != null && iloscKg > 0 ? Math.round(cenaNetto * iloscKg * 100) / 100 : null;
            const wartosc_brutto = cenaBrutto != null && iloscKg > 0 ? Math.round(cenaBrutto * iloscKg * 100) / 100 : null;
            pozycje.push({
              asortyment: nazwaOp,
              wyrob: r.partia.asortyment.nazwa,
              kod_towaru: r.partia.asortyment.kod_towaru,
              numer_partii: r.partia.numer_partii,
              ilosc: szt,
              jednostka: "szt.",
              ilosc_kg: iloscKg,
              cena_jednostkowa: cena > 0 ? cena : null,
              wartosc,
              cena_netto: cenaNetto,
              cena_brutto: cenaBrutto,
              stawka_vat: stawkaVat,
              wartosc_netto,
              wartosc_brutto,
            });
          }
        } else {
          const wartosc = ilosc * cena;
          const ceny2 = cenyByPartia[r.id_partii];
          const cenaNetto2 = ceny2?.cena_netto ?? katCenaNetto;
          const stawkaVat2 = ceny2?.stawka_vat ?? katVat;
          const cenaBrutto2 = ceny2?.cena_brutto ?? (cenaNetto2 != null && stawkaVat2 != null ? Math.round(cenaNetto2 * (1 + stawkaVat2 / 100) * 10000) / 10000 : null);
          const wartosc_netto2 = cenaNetto2 != null ? Math.round(cenaNetto2 * ilosc * 100) / 100 : null;
          const wartosc_brutto2 = cenaBrutto2 != null ? Math.round(cenaBrutto2 * ilosc * 100) / 100 : null;
          pozycje.push({
            asortyment: r.partia.asortyment.nazwa,
            wyrob: null,
            kod_towaru: r.partia.asortyment.kod_towaru,
            numer_partii: r.partia.numer_partii,
            ilosc,
            jednostka: r.partia.asortyment.jednostka_miary,
            ilosc_kg: r.partia.asortyment.jednostka_miary === 'szt.' && (r.partia.asortyment as any).waga_jednostkowa_kg
              ? Math.round(ilosc * ((r.partia.asortyment as any).waga_jednostkowa_kg) * 1000) / 1000
              : null,
            cena_jednostkowa: cena > 0 ? cena : null,
            wartosc,
            cena_netto: cenaNetto2,
            cena_brutto: cenaBrutto2,
            stawka_vat: stawkaVat2,
            wartosc_netto: wartosc_netto2,
            wartosc_brutto: wartosc_brutto2,
          });
        }
      }

      const typDok = firstRuch
        ? (firstRuch.typ_ruchu === "Zuzycie" || firstRuch.typ_ruchu === "Strata" ? "RW" : firstRuch.typ_ruchu === "Przyjecie_Z_Produkcji" ? "PW" : firstRuch.typ_ruchu)
        : header!.typ;

      const docData = {
        referencja,
        typ: typDok,
        status,
        data: header?.utworzono_dnia || firstRuch?.utworzono_dnia,
        uzytkownik: header?.uzytkownik_utworzenia?.login || firstRuch?.uzytkownik?.login || "system",
        data_zatwierdzenia: header?.data_zatwierdzenia || null,
        numer_zlecenia: firstRuch?.zlecenie?.numer_zlecenia || null,
        data_dostawy: (header as any)?.data_dostawy || null,
        kontrahent: header?.kontrahent ? { kod: header.kontrahent.kod, nazwa: header.kontrahent.nazwa } : null,
        pozycje,
      };

      // Generuj HTML i PDF
      const html = generateDocumentHTML(docData);
      const pdfBuffer = await generatePDF(html);

      res.contentType('application/pdf');
      const safeRef = encodeURIComponent(referencja).replace(/['()]/g, escape).replace(/\*/g, '%2A');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeRef}.pdf`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('PDF generation error:', error);
      res.status(500).json({ error: "Błąd generowania PDF" });
    }
  });

router.get("/api/dokumenty/:typ", async (req, res) => {
    try {
      const { typ } = req.params;

      if (typ === "ZP") {
        const zlecenia = await prisma.zlecenia_Produkcyjne.findMany({
          include: {
            receptura: {
              include: {
                asortyment_docelowy: true,
                skladniki: {
                  include: {
                    asortyment_skladnika: true
                  }
                }
              }
            },
            ruchy_magazynowe: true
          },
          orderBy: { utworzono_dnia: 'desc' }
        });

        // Proaktywna inicjatywa: Dodajemy sugestie partii (FIFO) dla każdego składnika
        const zleceniaWithSuggestions = await Promise.all(zlecenia.map(async (z) => {
          const skladnikiWithBatches = await Promise.all(z.receptura.skladniki.map(async (s) => {
            const wymaganaIlosc = s.ilosc_wymagana * z.planowana_ilosc_wyrobu;

            // Szukamy partii dla tego asortymentu, które mają dodatni stan
            const partie = await prisma.partie_Magazynowe.findMany({
              where: {
                id_asortymentu: s.id_asortymentu_skladnika,
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

            // Obliczamy realny stan każdej partii pomniejszony o aktywne rezerwacje + bufor WZ
            const partieIds1 = partie.map(p => p.id);
            const buforWz1 = await getBuforWzByPartia(partieIds1);
            const sugestie = partie.map(p => {
              const stan = p.ruchy_magazynowe.reduce((sum, r) => sum + r.ilosc, 0)
                         - p.rezerwacje.reduce((sum, r) => sum + r.ilosc_zarezerwowana, 0)
                         - (buforWz1.get(p.id) || 0);
              return {
                id: p.id,
                numer_partii: p.numer_partii,
                termin_waznosci: p.termin_waznosci,
                stan: stan
              };
            }).filter(p => p.stan > 0);

            return {
              ...s,
              sugerowane_partie: sugestie
            };
          }));

          return {
            ...z,
            receptura: {
              ...z.receptura,
              skladniki: skladnikiWithBatches
            }
          };
        }));

        return res.json(zleceniaWithSuggestions);
      }

      let dbTypRuchu = "";
      if (typ === "PZ") dbTypRuchu = "PZ";
      else if (typ === "PW") dbTypRuchu = "Przyjecie_Z_Produkcji";
      else if (typ === "RW") dbTypRuchu = "Zuzycie";
      else return res.status(400).json({ error: "Nieznany typ dokumentu" });

      const ruchy = await prisma.ruchy_Magazynowe.findMany({
        where: { typ_ruchu: dbTypRuchu },
        include: {
          partia: {
            include: {
              asortyment: true
            }
          },
          zlecenie: true,
          uzytkownik: true
        },
        orderBy: { utworzono_dnia: 'desc' }
      });

      // Group by referencja_dokumentu
      const grouped = ruchy.reduce((acc: any, ruch) => {
        const ref = ruch.referencja_dokumentu || `Brak referencji (${ruch.id})`;
        if (!acc[ref]) {
          acc[ref] = {
            referencja: ref,
            data: ruch.utworzono_dnia,
            typ: typ,
            uzytkownik: ruch.uzytkownik?.login || "System",
            zlecenie: ruch.zlecenie?.numer_zlecenia || null,
            pozycje: []
          };
        }
        acc[ref].pozycje.push({
          id: ruch.id,
          asortyment: ruch.partia.asortyment.nazwa,
          kod_towaru: ruch.partia.asortyment.kod_towaru,
          numer_partii: ruch.partia.numer_partii,
          ilosc: Math.abs(ruch.ilosc),
          jednostka: ruch.partia.asortyment.jednostka_miary
        });
        return acc;
      }, {});

      res.json(Object.values(grouped).sort((a: any, b: any) => new Date(b.data).getTime() - new Date(a.data).getTime()));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Błąd pobierania dokumentów" });
    }
  });

export default router;
