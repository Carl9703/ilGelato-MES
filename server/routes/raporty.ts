import { Router } from "express";
import { prisma } from "../db";
import { generateDocNumber, generateSesjaNumber, generateZlecenieNumber } from "../utils/docNumbers";
import { generateDocumentHTML, generatePDF } from "../../server-pdf";

const router = Router();

router.get("/api/dashboard", async (req, res) => {
    try {
      const now = new Date();
      const za7Dni = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const [zleceniaPlanowane, zleceniaWToku, zleceniaZrealizowane, stanyRaw] = await Promise.all([
        prisma.zlecenia_Produkcyjne.count({ where: { status: "Planowane", czy_aktywne: true } }),
        prisma.zlecenia_Produkcyjne.count({ where: { status: "W_toku", czy_aktywne: true } }),
        prisma.zlecenia_Produkcyjne.count({ where: { status: "Zrealizowane", czy_aktywne: true } }),
        prisma.ruchy_Magazynowe.groupBy({
          by: ['id_partii'],
          _sum: { ilosc: true },
          where: { czy_aktywne: true }
        })
      ]);

      const stanyMap = new Map<string, number>();
      stanyRaw.forEach(g => {
        if (g._sum.ilosc && g._sum.ilosc > 0) {
          stanyMap.set(g.id_partii, g._sum.ilosc);
        }
      });

      const partieAll = await prisma.partie_Magazynowe.findMany({
        where: { id: { in: Array.from(stanyMap.keys()) }, czy_aktywne: true },
        include: { asortyment: true }
      });

      const partieZeStanem = partieAll.map(p => ({
        ...p,
        stan: stanyMap.get(p.id) || 0
      }));

      const alertyWaznosc = partieZeStanem
        .filter(p => p.termin_waznosci && new Date(p.termin_waznosci) <= za7Dni)
        .map(p => ({
          typ: new Date(p.termin_waznosci!) <= now ? "PRZETERMINOWANE" : "BLISKIE_WYGASNIECIA",
          asortyment: p.asortyment.nazwa,
          numer_partii: p.numer_partii,
          termin_waznosci: p.termin_waznosci,
          stan: p.stan,
          jednostka: p.asortyment.jednostka_miary
        }));

      res.json({
        zlecenia: { planowane: zleceniaPlanowane, w_toku: zleceniaWToku, zrealizowane: zleceniaZrealizowane },
        alerty_waznosc: alertyWaznosc,
        ilosc_partii_na_magazynie: partieZeStanem.length
      });
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania danych dashboardu" });
    }
});

router.get("/api/raporty/sprzedaz-per-kontrahent", async (req, res) => {
    try {
      const { od, do: doData } = req.query as { od?: string; do?: string };
      if (!od || !doData) {
        return res.status(400).json({ error: "Wymagane podanie dat 'od' i 'do' dla raportu" });
      }

      const whereHeader: any = { typ: "WZ", status: "Zatwierdzony" };
      whereHeader.data_zatwierdzenia = {};
      whereHeader.data_zatwierdzenia.gte = new Date(od);
      const doDate = new Date(doData);
      doDate.setHours(23, 59, 59, 999);
      whereHeader.data_zatwierdzenia.lte = doDate;

      const headers = await prisma.dokumenty_Magazynowe.findMany({
        where: whereHeader,
        include: { kontrahent: true },
        orderBy: { data_zatwierdzenia: "desc" },
      });

      const refs = headers.map((h) => h.referencja);
      const ruchy = refs.length > 0 ? await prisma.ruchy_Magazynowe.findMany({
        where: { referencja_dokumentu: { in: refs }, czy_aktywne: true },
        include: { partia: { include: { asortyment: true } } },
      }) : [];

      // Zbierz id opakowań dla fallbacku (stare dokumenty bez pozycje_json)
      const allOpIds = new Set<string>();
      for (const r of ruchy) {
        if (r.partia.opakowania_json) {
          try {
            const ops = JSON.parse(r.partia.opakowania_json) as { id_asortymentu: string }[];
            ops.forEach(o => { if (o.id_asortymentu) allOpIds.add(o.id_asortymentu); });
          } catch {}
        }
      }
      const opNazwy = allOpIds.size > 0 ? await prisma.asortyment.findMany({ where: { id: { in: [...allOpIds] } }, select: { id: true, nazwa: true } }) : [];
      const opNazwyMap: Record<string, string> = {};
      opNazwy.forEach(a => opNazwyMap[a.id] = a.nazwa);

      // Wyparsuj faktycznie wydane opakowania i ceny sprzedaży z pozycje_json nagłówka WZ
      // Format: [{id_partii, ilosc, sztuki: {"Nazwa (Xkg)": liczba_szt}, cena_netto, cena_brutto, stawka_vat}]
      const sztukiPerDoc = new Map<string, Record<string, Record<string, number>>>();
      const cenaNettoPerDoc = new Map<string, Record<string, number | null>>();
      for (const h of headers) {
        const mapSztuki: Record<string, Record<string, number>> = {};
        const mapCena: Record<string, number | null> = {};
        if (h.pozycje_json) {
          try {
            const poz = JSON.parse(h.pozycje_json) as { id_partii: string; sztuki?: Record<string, number>; cena_netto?: number | null }[];
            for (const p of poz) {
              mapSztuki[p.id_partii] = p.sztuki || {};
              mapCena[p.id_partii] = p.cena_netto ?? null;
            }
          } catch {}
        }
        sztukiPerDoc.set(h.referencja, mapSztuki);
        cenaNettoPerDoc.set(h.referencja, mapCena);
      }

      const ruchyByRef = new Map<string, typeof ruchy>();
      ruchy.forEach((r) => {
        const ref = r.referencja_dokumentu!;
        if (!ruchyByRef.has(ref)) ruchyByRef.set(ref, []);
        ruchyByRef.get(ref)!.push(r);
      });

      // Grupuj per kontrahent
      const kontrahentMap = new Map<string, {
        id: string | null; kod: string; nazwa: string;
        liczba_dokumentow: number; wartosc_total: number;
        dokumenty: { referencja: string; data: Date | null; wartosc: number; pozycje: any[] }[];
      }>();

      for (const header of headers) {
        const klucz = header.id_kontrahenta || "__brak__";
        if (!kontrahentMap.has(klucz)) {
          kontrahentMap.set(klucz, {
            id: header.id_kontrahenta,
            kod: header.kontrahent?.kod ?? "—",
            nazwa: header.kontrahent?.nazwa ?? "Bez kontrahenta",
            liczba_dokumentow: 0,
            wartosc_total: 0,
            dokumenty: [],
          });
        }
        const entry = kontrahentMap.get(klucz)!;
        const docRuchy = ruchyByRef.get(header.referencja) || [];
        const sztukiByPartia = sztukiPerDoc.get(header.referencja) || {};
        const cenaByPartia = cenaNettoPerDoc.get(header.referencja) || {};
        const pozycje: any[] = [];
        for (const r of docRuchy) {
          // Cena sprzedaży netto z pozycje_json; fallback na cena_sprzedazy z kartoteki; ostatecznie koszt własny
          const cenaNetto = cenaByPartia[r.id_partii];
          const cenaKatalogowa = (r.partia.asortyment as any).cena_sprzedazy ?? null;
          const cena = cenaNetto != null ? cenaNetto : (cenaKatalogowa != null ? cenaKatalogowa : (r.cena_jednostkowa ?? 0));
          // Pobierz faktycznie wydane opakowania z pozycje_json nagłówka WZ
          const sztuki = sztukiByPartia[r.id_partii] || {};
          const hasStored = Object.keys(sztuki).length > 0;

          if (hasStored) {
            // Użyj sztuki z pozycje_json — identyczne z podglądem dokumentu WZ
            for (const [label, szt] of Object.entries(sztuki) as [string, number][]) {
              if (szt <= 0) continue;
              const match = label.match(/^(.*)\s+\((\d+(?:\.\d+)?)\s*kg\)$/);
              const nazwaOp = match ? match[1] : label;
              const wagaKg = match ? parseFloat(match[2]) : 0;
              const iloscKg = Math.round(szt * wagaKg * 1000) / 1000;
              const wartosc = Math.round(cena * iloscKg * 100) / 100;
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
              });
            }
          } else if (r.partia.opakowania_json) {
            // Fallback: stare dokumenty bez pozycje_json
            try {
              const parsedOp = JSON.parse(r.partia.opakowania_json) as { id_asortymentu: string; waga_kg: number }[];
              const grouped: Record<string, { nazwa: string; waga_kg: number; szt: number }> = {};
              for (const op of parsedOp) {
                const nazwa = opNazwyMap[op.id_asortymentu] || "Opakowanie";
                const k = `${nazwa}__${op.waga_kg}`;
                if (!grouped[k]) grouped[k] = { nazwa, waga_kg: op.waga_kg, szt: 0 };
                grouped[k].szt++;
              }
              for (const g of Object.values(grouped)) {
                const iloscKg = Math.round(g.szt * g.waga_kg * 1000) / 1000;
                pozycje.push({
                  asortyment: g.nazwa, wyrob: r.partia.asortyment.nazwa,
                  kod_towaru: r.partia.asortyment.kod_towaru, numer_partii: r.partia.numer_partii,
                  ilosc: g.szt, jednostka: "szt.", ilosc_kg: iloscKg,
                  cena_jednostkowa: cena > 0 ? cena : null, wartosc: Math.round(cena * iloscKg * 100) / 100,
                });
              }
            } catch {
              const ilosc = Math.abs(r.ilosc);
              pozycje.push({
                asortyment: r.partia.asortyment.nazwa, wyrob: null,
                kod_towaru: r.partia.asortyment.kod_towaru, numer_partii: r.partia.numer_partii,
                ilosc, jednostka: r.partia.asortyment.jednostka_miary, ilosc_kg: null,
                cena_jednostkowa: cena > 0 ? cena : null, wartosc: Math.round(cena * ilosc * 100) / 100,
              });
            }
          } else {
            const ilosc = Math.abs(r.ilosc);
            pozycje.push({
              asortyment: r.partia.asortyment.nazwa, wyrob: null,
              kod_towaru: r.partia.asortyment.kod_towaru, numer_partii: r.partia.numer_partii,
              ilosc, jednostka: r.partia.asortyment.jednostka_miary, ilosc_kg: null,
              cena_jednostkowa: cena > 0 ? cena : null, wartosc: Math.round(cena * ilosc * 100) / 100,
            });
          }
        }
        const wartoscDok = Math.round(pozycje.reduce((s, p) => s + p.wartosc, 0) * 100) / 100;
        entry.liczba_dokumentow++;
        entry.wartosc_total += wartoscDok;
        entry.dokumenty.push({
          referencja: header.referencja,
          data: header.data_zatwierdzenia,
          wartosc: wartoscDok,
          pozycje,
        });
      }

      const wynik = Array.from(kontrahentMap.values()).sort((a, b) => b.wartosc_total - a.wartosc_total);
      const suma_total = Math.round(wynik.reduce((s, k) => s + k.wartosc_total, 0) * 100) / 100;
      res.json({ kontrahenci: wynik, suma_total, liczba_dokumentow: headers.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Błąd generowania raportu" });
    }
});

export default router;
