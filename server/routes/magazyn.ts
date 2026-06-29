import { Router } from "express";
import { prisma } from "../db";
import { getBuforWzByPartia } from "../utils/magazyn";
import { generateDocNumber, generateSesjaNumber, generateZlecenieNumber } from "../utils/docNumbers";
import { generateDocumentHTML, generatePDF } from "../../server-pdf";

const router = Router();

router.get("/api/magazyn/stany", async (req, res) => {
    try {
      const partie = await prisma.partie_Magazynowe.findMany({
        where: { czy_aktywne: true },
        include: {
          asortyment: true,
          ruchy_magazynowe: {
            where: { czy_aktywne: true },
          },
        },
      });

      const stany = partie
        .map((p) => {
          const ilosc = p.ruchy_magazynowe.reduce((sum, ruch) => sum + ruch.ilosc, 0);
          return {
            id: p.id,
            asortyment: p.asortyment.nazwa,
            kod_towaru: p.asortyment.kod_towaru,
            jednostka: p.asortyment.jednostka_miary,
            numer_partii: p.numer_partii,
            data_produkcji: p.data_produkcji,
            termin_waznosci: p.termin_waznosci,
            status_partii: p.status_partii,
            ilosc,
          };
        })
        .filter((p) => p.ilosc > 0);

      res.json(stany);
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania stanów magazynowych" });
    }
  });

router.get("/api/wyroby-gotowe/stan", async (req, res) => {
    try {
      const partie = await prisma.partie_Magazynowe.findMany({
        where: { czy_aktywne: true, asortyment: { typ_asortymentu: "Wyrob_Gotowy", czy_aktywne: true } },
        include: {
          asortyment: true,
          ruchy_magazynowe: { where: { czy_aktywne: true } },
        },
        orderBy: [{ id_asortymentu: "asc" }, { data_produkcji: "asc" }],
      });

      // Pobierz wszystkie zatwierdzone WZ z informacją o opakowaniach
      const docsWZ = await prisma.dokumenty_Magazynowe.findMany({
        where: { typ: "WZ", status: { in: ["Zatwierdzony", "Faktura wystawiona"] }, pozycje_json: { not: null } }
      });

      // Mapa batchId -> List of { name, weight, count } issued
      const issuedByBatch = new Map<string, any[]>();
      for (const d of docsWZ) {
        try {
          const pozycje = JSON.parse(d.pozycje_json!) as any[];
          for (const poz of pozycje) {
            if (!issuedByBatch.has(poz.id_partii)) issuedByBatch.set(poz.id_partii, []);
            if (poz.sztuki) {
              for (const [label, count] of Object.entries(poz.sztuki) as [string, number][]) {
                const match = label.match(/^(.*)\s+\((\d+(?:\.\d+)?)\s*kg\)$/);
                if (match) {
                  issuedByBatch.get(poz.id_partii)!.push({ nazwa: match[1], waga_kg: parseFloat(match[2]), count });
                }
              }
            }
          }
        } catch {}
      }

      // Zbierz wszystkie id_asortymentu z opakowania_json i pobierz nazwy z kartoteki
      const allOpIds = new Set<string>();
      for (const p of partie) {
        if (p.opakowania_json) {
          try {
            (JSON.parse(p.opakowania_json) as { id_asortymentu: string }[]).forEach(o => {
              if (o.id_asortymentu) allOpIds.add(o.id_asortymentu);
            });
          } catch {}
        }
      }
      const opNazwy = await prisma.asortyment.findMany({
        where: { id: { in: [...allOpIds] } },
        select: { id: true, nazwa: true },
      });
      const opNazwyMap: Record<string, string> = {};
      for (const a of opNazwy) opNazwyMap[a.id] = a.nazwa;

      const rows = [];
      for (const p of partie) {
        const stan = p.ruchy_magazynowe.reduce((s, r) => s + r.ilosc, 0);
        if (stan < 0.001) continue;

        const base = {
          id_partii: p.id,
          numer_partii: p.numer_partii,
          kod_towaru: p.asortyment.kod_towaru,
          nazwa: p.asortyment.nazwa,
          jednostka_miary: p.asortyment.jednostka_miary,
          data_produkcji: p.data_produkcji,
          termin_waznosci: p.termin_waznosci,
          status_partii: p.status_partii,
        };

        if (p.opakowania_json) {
          try {
            let currentOps = JSON.parse(p.opakowania_json) as { id_asortymentu: string; waga_kg: number }[];
            const issuedList = issuedByBatch.get(p.id) || [];
            
            // Odejmujemy wydane opakowania
            for (const issued of issuedList) {
              let toRemove = issued.count;
              for (let i = 0; i < currentOps.length && toRemove > 0; i++) {
                const op = currentOps[i];
                const opNazwa = opNazwyMap[op.id_asortymentu] ?? op.id_asortymentu;
                if (Math.abs(op.waga_kg - issued.waga_kg) < 0.01 && (opNazwa === issued.nazwa || !issued.nazwa)) {
                  currentOps.splice(i, 1);
                  i--;
                  toRemove--;
                }
              }
            }

            if (currentOps.length > 0) {
              // Grupujemy pozostałe
              const grupy: Record<string, { id_asortymentu: string; nazwa: string; ilosc_szt: number; waga_orig: number; waga_jednostkowa: number }> = {};
              let waga_orig_total = 0;
              for (const o of currentOps) {
                const nazwaOp = opNazwyMap[o.id_asortymentu] ?? o.id_asortymentu;
                const k = `${o.id_asortymentu}_${o.waga_kg}`;
                if (!grupy[k]) grupy[k] = { id_asortymentu: o.id_asortymentu, nazwa: nazwaOp, ilosc_szt: 0, waga_orig: 0, waga_jednostkowa: o.waga_kg };
                grupy[k].ilosc_szt++;
                grupy[k].waga_orig += o.waga_kg;
                waga_orig_total += o.waga_kg;
              }

              // ilosc_kg per typ = proporcja z aktualnego stanu partii
              // Jeśli stan == waga_orig_total (norma), to wagi będą 1:1 nominalne
              for (const g of Object.values(grupy)) {
                const udzial = waga_orig_total > 0 ? g.waga_orig / waga_orig_total : 1 / Object.keys(grupy).length;
                const ilosc_kg = Math.round(stan * udzial * 1000) / 1000;
                rows.push({ ...base, opakowanie: g.nazwa, id_asortymentu_opakowania: g.id_asortymentu, waga_jednostkowa: g.waga_jednostkowa, ilosc_szt: g.ilosc_szt, ilosc_kg });
              }
              continue;
            }
          } catch {}
        }

        // Brak danych o opakowaniach lub pusta lista po odjęciu — jeden wiersz z łącznym kg
        rows.push({ ...base, opakowanie: null, waga_jednostkowa: null, ilosc_szt: null, ilosc_kg: Math.round(stan * 1000) / 1000 });
      }

      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.post("/api/magazyn/pz", async (req, res) => {
    try {
      const { referencja_zewnetrzna, pozycje } = req.body;
      const items = pozycje || [];

      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const result = await prisma.$transaction(async (tx) => {
        const finalReferencja = await generateDocNumber(tx, "PZ");

        // Utwórz nagłówek dokumentu w stanie Bufor
        await tx.dokumenty_Magazynowe.create({
          data: {
            referencja: finalReferencja,
            typ: "PZ",
            status: "Bufor",
            id_uzytkownika_utworzenia: user.id,
            numer_zewnetrzny: referencja_zewnetrzna || null,
          }
        });

        const ruchy = [];
        for (const item of items) {
          const { id_asortymentu, numer_partii, ilosc, cena_jednostkowa, data_produkcji, termin_waznosci } = item;

          let partia = await tx.partie_Magazynowe.findUnique({ where: { numer_partii } });

          if (!partia) {
            if (!id_asortymentu) throw new Error(`Brak ID asortymentu dla nowej partii ${numer_partii}`);
            partia = await tx.partie_Magazynowe.create({
              data: {
                id_asortymentu,
                numer_partii,
                data_produkcji: data_produkcji ? new Date(data_produkcji) : null,
                termin_waznosci: termin_waznosci ? new Date(termin_waznosci) : null,
                status_partii: "Dostepna",
              },
            });
          } else {
            if (partia.id_asortymentu !== id_asortymentu) {
              throw new Error(`Partia o numerze ${numer_partii} jest już przypisana do innego asortymentu!`);
            }
          }

          const iloscNum = parseFloat(ilosc);
          if (!isFinite(iloscNum) || iloscNum <= 0) {
            throw new Error(`Nieprawidłowa ilość dla partii ${numer_partii}: ilość musi być większa od zera`);
          }

          // Ruch nieaktywny — nie wpływa na stan do czasu zatwierdzenia
          const ruch = await tx.ruchy_Magazynowe.create({
            data: {
              id_partii: partia.id,
              typ_ruchu: "PZ",
              ilosc: iloscNum,
              cena_jednostkowa: cena_jednostkowa ? parseFloat(cena_jednostkowa) : null,
              referencja_dokumentu: finalReferencja,
              id_uzytkownika: user.id,
              czy_aktywne: false,
            },
          });
          ruchy.push(ruch);
        }
        return { referencja: finalReferencja, ruchy };
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd rejestracji dokumentu PZ" });
    }
  });

router.post("/api/magazyn/wz", async (req, res) => {
    try {
      const { items, referencja_zewnetrzna, id_kontrahenta, data_dostawy } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Brak pozycji do wydania" });
      }

      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const result = await prisma.$transaction(async (tx) => {
        const finalReferencja = await generateDocNumber(tx, "WZ");

        // Utwórz nagłówek dokumentu w stanie Bufor
        await tx.dokumenty_Magazynowe.create({
          data: {
            referencja: finalReferencja,
            typ: "WZ",
            status: "Bufor",
            id_uzytkownika_utworzenia: user.id,
            id_kontrahenta: id_kontrahenta || null,
            numer_zewnetrzny: referencja_zewnetrzna || null,
            data_dostawy: data_dostawy ? new Date(data_dostawy) : null,
            pozycje_json: JSON.stringify(items.map((it: any) => ({
              id_partii: it.id_partii,
              ilosc: it.ilosc,
              sztuki: it.sztuki || {},
              cena_brutto: it.cena_brutto ?? null,
              cena_netto: it.cena_netto ?? null,
              stawka_vat: it.stawka_vat ?? null,
            }))),
          }
        });

        const ruchy = [];
        for (const item of items) {
          const { id_partii, ilosc } = item;
          const parsedIlosc = parseFloat(ilosc);
          if (!id_partii || isNaN(parsedIlosc) || parsedIlosc <= 0) {
            throw new Error("Nieprawidłowe dane pozycji WZ");
          }

          const partia = await tx.partie_Magazynowe.findUnique({ where: { id: id_partii } });
          if (!partia) throw new Error(`Partia ${id_partii} nie istnieje`);

          // Oblicz cena ważona (weighted average) z PZ/PW dla tej partii
          const pzRuchy = await tx.ruchy_Magazynowe.findMany({
            where: { id_partii, cena_jednostkowa: { not: null }, ilosc: { gt: 0 }, czy_aktywne: true }
          });
          let cena_jednostkowa: number | null = null;
          if (pzRuchy.length > 0) {
            const totalIlosc = pzRuchy.reduce((s, r) => s + r.ilosc, 0);
            const totalWartosc = pzRuchy.reduce((s, r) => s + r.ilosc * (r.cena_jednostkowa || 0), 0);
            if (totalIlosc > 0) cena_jednostkowa = totalWartosc / totalIlosc;
          }

          // Ruch nieaktywny — weryfikacja stanu nastąpi przy zatwierdzeniu
          const ruch = await tx.ruchy_Magazynowe.create({
            data: {
              id_partii,
              typ_ruchu: "WZ",
              ilosc: -parsedIlosc,
              cena_jednostkowa,
              referencja_dokumentu: finalReferencja,
              id_uzytkownika: user.id,
              czy_aktywne: false,
            },
          });
          ruchy.push(ruch);
        }
        return { referencja: finalReferencja, ruchy };
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd rejestracji dokumentu WZ" });
    }
  });

router.post("/api/magazyn/rw", async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Brak pozycji do rozchodu" });
      }

      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const result = await prisma.$transaction(async (tx) => {
        const finalReferencja = await generateDocNumber(tx, "RW");

        await tx.dokumenty_Magazynowe.create({
          data: {
            referencja: finalReferencja,
            typ: "RW",
            status: "Bufor",
            id_uzytkownika_utworzenia: user.id,
          }
        });

        const ruchy = [];
        for (const item of items) {
          const { id_partii, ilosc } = item;
          const parsedIlosc = parseFloat(ilosc);
          if (!id_partii || isNaN(parsedIlosc) || parsedIlosc <= 0) {
            throw new Error("Nieprawidłowe dane pozycji RW");
          }

          const partia = await tx.partie_Magazynowe.findUnique({ where: { id: id_partii } });
          if (!partia) throw new Error(`Partia ${id_partii} nie istnieje`);

          const pzRuchy = await tx.ruchy_Magazynowe.findMany({
            where: { id_partii, cena_jednostkowa: { not: null }, ilosc: { gt: 0 }, czy_aktywne: true }
          });
          let cena_jednostkowa: number | null = null;
          if (pzRuchy.length > 0) {
            const totalIlosc = pzRuchy.reduce((s, r) => s + r.ilosc, 0);
            const totalWartosc = pzRuchy.reduce((s, r) => s + r.ilosc * (r.cena_jednostkowa || 0), 0);
            if (totalIlosc > 0) cena_jednostkowa = totalWartosc / totalIlosc;
          }

          const ruch = await tx.ruchy_Magazynowe.create({
            data: {
              id_partii,
              typ_ruchu: "Zuzycie",
              ilosc: -parsedIlosc,
              cena_jednostkowa,
              referencja_dokumentu: finalReferencja,
              id_uzytkownika: user.id,
              czy_aktywne: false,
            },
          });
          ruchy.push(ruch);
        }
        return { referencja: finalReferencja, ruchy };
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd rejestracji dokumentu RW" });
    }
  });

router.post("/api/magazyn/partia/:id/status", async (req, res) => {
    const VALID_STATUSES = ["Dostepna", "Kwarantanna", "Zablokowana_Kontrola_Jakosci", "Zutylizowana"];
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Nieprawidłowy status. Dozwolone: ${VALID_STATUSES.join(", ")}` });
      }
      const updated = await prisma.partie_Magazynowe.update({
        where: { id },
        data: { status_partii: status }
      });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

router.get("/partie/:id_asortymentu", async (req, res) => {
    try {
      const partie = await prisma.partie_Magazynowe.findMany({
        where: { id_asortymentu: req.params.id_asortymentu, status_partii: "Dostepna", czy_aktywne: true },
        include: {
          ruchy_magazynowe: { where: { czy_aktywne: true } },
          rezerwacje: { where: { czy_aktywne: true, status: "Aktywna" } },
        },
        orderBy: [{ termin_waznosci: "asc" }, { utworzono_dnia: "asc" }],
      });
      const buforWz3 = await getBuforWzByPartia(partie.map(p => p.id));
      const result = partie.map(p => {
        const stan = p.ruchy_magazynowe.reduce((sum, r) => sum + r.ilosc, 0)
                   - p.rezerwacje.reduce((sum, r) => sum + r.ilosc_zarezerwowana, 0)
                   - (buforWz3.get(p.id) || 0);
        return {
          id: p.id,
          numer_partii: p.numer_partii,
          termin_waznosci: p.termin_waznosci,
          stan: stan
        };
      }).filter(p => p.stan > 0.001);
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.get("/trace/partia/:numer_partii/genealogia", async (req, res) => {
    try {
      const { numer_partii } = req.params;
      const partia = await prisma.partie_Magazynowe.findUnique({
        where: { numer_partii },
        include: { asortyment: true }
      });
      if (!partia) return res.status(404).json({ error: "Nie znaleziono partii" });

      // 1. BACKWARD (Z czego powsta┼éa?)
      const wejscia = await prisma.ruchy_Magazynowe.findMany({
        where: { id_partii: partia.id, typ_ruchu: "Przyjecie_Z_Produkcji", czy_aktywne: true },
        include: {
          zlecenie: {
            include: {
              ruchy_magazynowe: {
                where: { typ_ruchu: "Zuzycie", czy_aktywne: true },
                include: { partia: { include: { asortyment: true } } }
              },
              rezerwacje: { include: { partia: { include: { asortyment: true } } } }
            }
          }
        }
      });

      const genealogia_w_tyl = wejscia.flatMap(w => w.zlecenie?.ruchy_magazynowe.map(r => ({
        id_partii: r.partia.id,
        numer_partii: r.partia.numer_partii,
        asortyment: r.partia.asortyment.nazwa,
        ilosc: Math.abs(r.ilosc),
        jednostka: r.partia.asortyment.jednostka_miary,
        zlecenie_produkcyjne: w.zlecenie?.numer_zlecenia
      })) || []);

      // 2. FORWARD (Gdzie zosta┼éa zu┼╝yta?)
      const zuzycia = await prisma.ruchy_Magazynowe.findMany({
        where: { id_partii: partia.id, typ_ruchu: { in: ["Zuzycie", "Strata"] }, czy_aktywne: true },
        include: {
          zlecenie: {
            include: {
              ruchy_magazynowe: {
                where: { typ_ruchu: "Przyjecie_Z_Produkcji", czy_aktywne: true },
                include: { partia: { include: { asortyment: true } } }
              }
            }
          }
        }
      });

      const genealogia_w_przod = zuzycia.flatMap(z => z.zlecenie?.ruchy_magazynowe.map(r => ({
        id_partii: r.partia.id,
        numer_partii: r.partia.numer_partii,
        asortyment: r.partia.asortyment.nazwa,
        ilosc: r.ilosc,
        jednostka: r.partia.asortyment.jednostka_miary,
        zlecenie_produkcyjne: z.zlecenie?.numer_zlecenia
      })) || []);

      // 3. WZ ÔÇö wydania zewn─Ötrzne powi─ůzane z t─ů parti─ů
      const wydaniaWZ = await prisma.ruchy_Magazynowe.findMany({
        where: { id_partii: partia.id, typ_ruchu: "WZ", czy_aktywne: true },
        orderBy: { utworzono_dnia: "asc" }
      });

      res.json({
        partia: {
          id: partia.id,
          numer_partii: partia.numer_partii,
          asortyment: partia.asortyment.nazwa,
          status: partia.status_partii
        },
        skladniki: genealogia_w_tyl,
        wyroby_pochodne: genealogia_w_przod,
        wydania_wz: wydaniaWZ.map(w => ({
          dokument: w.referencja_dokumentu,
          ilosc: Math.abs(w.ilosc),
          jednostka: partia.asortyment.jednostka_miary,
          data: w.utworzono_dnia
        }))
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "B┼é─ůd traceingu" });
    }
  });

router.patch("/partie/:id/zmien-opakowanie", async (req, res) => {
    try {
      const { id_asortymentu_stare, waga_kg_stare, id_asortymentu_nowe, waga_kg_nowe, ilosc_szt } = req.body as {
        id_asortymentu_stare: string;
        waga_kg_stare: number;
        id_asortymentu_nowe: string;
        waga_kg_nowe: number;
        ilosc_szt: number;
      };

      if (!id_asortymentu_stare || !id_asortymentu_nowe || !waga_kg_nowe || !ilosc_szt)
        return res.status(400).json({ error: "Brakuj─ůce parametry" });

      const partia = await prisma.partie_Magazynowe.findUnique({ where: { id: req.params.id } });
      if (!partia) return res.status(404).json({ error: "Partia nie istnieje" });

      const noweOpak = await prisma.asortyment.findUnique({ where: { id: id_asortymentu_nowe }, select: { id: true, nazwa: true } });
      if (!noweOpak) return res.status(404).json({ error: "Nowe opakowanie nie istnieje" });

      let opList: { id_asortymentu: string; waga_kg: number }[] = [];
      try { if (partia.opakowania_json) opList = JSON.parse(partia.opakowania_json); } catch {}

      let zmieniono = 0;
      for (let i = 0; i < opList.length && zmieniono < ilosc_szt; i++) {
        const op = opList[i];
        if (op.id_asortymentu === id_asortymentu_stare && Math.abs(op.waga_kg - waga_kg_stare) < 0.001) {
          opList[i] = { id_asortymentu: id_asortymentu_nowe, waga_kg: waga_kg_nowe };
          zmieniono++;
        }
      }

      if (zmieniono === 0) return res.status(400).json({ error: "Nie znaleziono pasuj─ůcych opakowa┼ä do zmiany" });

      await prisma.partie_Magazynowe.update({
        where: { id: req.params.id },
        data: { opakowania_json: JSON.stringify(opList) },
      });

      res.json({ success: true, zmieniono });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

export default router;
