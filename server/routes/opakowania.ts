import { Router } from "express";
import { prisma } from "../db";
import { generateDocNumber, generateSesjaNumber, generateZlecenieNumber } from "../utils/docNumbers";
import { generateDocumentHTML, generatePDF } from "../../server-pdf";

const router = Router();

router.get("/api/opakowania-asortyment", async (req, res) => {
    try {
      const opakowania = await prisma.asortyment.findMany({
        where: { typ_asortymentu: "Opakowanie", czy_aktywne: true },
        orderBy: { nazwa: "asc" }
      });
      res.json(opakowania);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.put("/api/asortyment/:id/zwrotne", async (req, res) => {
    try {
      const { czy_zwrotne } = req.body;
      const item = await prisma.asortyment.update({
        where: { id: req.params.id },
        data: { czy_zwrotne: Boolean(czy_zwrotne) }
      });
      res.json(item);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.get("/api/opakowania-zwrotne/stan", async (req, res) => {
    try {
      const opakowania = await prisma.asortyment.findMany({
        where: { czy_aktywne: true, czy_zwrotne: true },
        orderBy: { nazwa: "asc" }
      });

      const ruchy = await prisma.ruchy_Opakowan_Zwrotnych.findMany({
        include: {
          kontrahent: { select: { id: true, kod: true, nazwa: true } }
        }
      });

      const kontrahenci = await prisma.kontrahenci.findMany({
        where: { czy_aktywne: true },
        select: { id: true, kod: true, nazwa: true }
      });

      const result = opakowania.map((asort: any) => {
        const ruchyAsortymentu = ruchy.filter((r: any) => r.id_asortymentu === asort.id);

        // Magazyn = PRZYJECIE + ZWROT - WYDA - STRATA
        let magazyn = 0;
        for (const r of ruchyAsortymentu) {
          if (r.typ_ruchu === "PRZYJECIE" || r.typ_ruchu === "ZWROT") magazyn += r.ilosc;
          else if (r.typ_ruchu === "WYDA" || r.typ_ruchu === "STRATA") magazyn -= r.ilosc;
        }

        // Stan per kontrahent
        const kontrahentMap = new Map<string, number>();
        for (const r of ruchyAsortymentu) {
          if (!r.id_kontrahenta) continue;
          const current = kontrahentMap.get(r.id_kontrahenta) || 0;
          if (r.typ_ruchu === "WYDA") kontrahentMap.set(r.id_kontrahenta, current + r.ilosc);
          else if (r.typ_ruchu === "ZWROT") kontrahentMap.set(r.id_kontrahenta, current - r.ilosc);
        }

        const kontrahenciStan = kontrahenci
          .map((k: any) => ({ ...k, ilosc: kontrahentMap.get(k.id) || 0 }))
          .filter((k: any) => k.ilosc > 0);

        return {
          id_asortymentu: asort.id,
          nazwa_asortymentu: asort.nazwa,
          czy_zwrotne: asort.czy_zwrotne,
          magazyn: Math.max(0, magazyn),
          kontrahenci: kontrahenciStan,
          lacznie: Math.max(0, magazyn) + kontrahenciStan.reduce((s: number, k: any) => s + k.ilosc, 0)
        };
      });

      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.get("/api/opakowania-zwrotne/historia", async (req, res) => {
    try {
      const { id_asortymentu, id_kontrahenta, typ_ruchu, limit = "100" } = req.query as any;
      const where: any = {};
      if (id_asortymentu) where.id_asortymentu = id_asortymentu;
      if (id_kontrahenta) where.id_kontrahenta = id_kontrahenta;
      if (typ_ruchu) where.typ_ruchu = typ_ruchu;

      const historia = await prisma.ruchy_Opakowan_Zwrotnych.findMany({
        where,
        include: {
          asortyment: { select: { id: true, nazwa: true } },
          kontrahent: { select: { id: true, kod: true, nazwa: true } },
          uzytkownik: { select: { login: true } }
        },
        orderBy: { utworzono_dnia: "desc" },
        take: parseInt(limit)
      });

      res.json(historia);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.post("/api/opakowania-zwrotne/ruch", async (req, res) => {
    try {
      const { id_asortymentu, ilosc, typ_ruchu, id_kontrahenta, uwagi } = req.body;
      if (!id_asortymentu) return res.status(400).json({ error: "Wymagany id_asortymentu" });
      if (!ilosc || ilosc <= 0) return res.status(400).json({ error: "Ilość musi być większa od 0" });
      if (!["PRZYJECIE", "WYDA", "ZWROT", "STRATA"].includes(typ_ruchu)) {
        return res.status(400).json({ error: "Nieprawidłowy typ ruchu. Dozwolone: PRZYJECIE, WYDA, ZWROT, STRATA" });
      }
      if ((typ_ruchu === "WYDA" || typ_ruchu === "ZWROT") && !id_kontrahenta) {
        return res.status(400).json({ error: "WYDA i ZWROT wymagają id_kontrahenta" });
      }

      // Sprawdź dostępność dla WYDA
      if (typ_ruchu === "WYDA") {
        const wszystkieRuchy = await prisma.ruchy_Opakowan_Zwrotnych.findMany({
          where: { id_asortymentu }
        });
        let stanMagazyn = 0;
        for (const r of wszystkieRuchy) {
          if (r.typ_ruchu === "PRZYJECIE" || r.typ_ruchu === "ZWROT") stanMagazyn += r.ilosc;
          else if (r.typ_ruchu === "WYDA" || r.typ_ruchu === "STRATA") stanMagazyn -= r.ilosc;
        }
        if (stanMagazyn < ilosc) {
          return res.status(400).json({ error: `Niewystarczający stan magazynowy: dostępne ${stanMagazyn} szt.` });
        }
      }

      // Sprawdź dostępność dla ZWROT
      if (typ_ruchu === "ZWROT") {
        const ruchyKontrahenta = await prisma.ruchy_Opakowan_Zwrotnych.findMany({
          where: { id_asortymentu, id_kontrahenta }
        });
        let stanKontrahenta = 0;
        for (const r of ruchyKontrahenta) {
          if (r.typ_ruchu === "WYDA") stanKontrahenta += r.ilosc;
          else if (r.typ_ruchu === "ZWROT") stanKontrahenta -= r.ilosc;
        }
        if (stanKontrahenta < ilosc) {
          return res.status(400).json({ error: `Kontrahent ma tylko ${stanKontrahenta} szt. tej kartoteki` });
        }
      }

      const user = await prisma.uzytkownicy.findFirst();
      if (!user) return res.status(400).json({ error: "Brak użytkownika w systemie" });

      const ruch = await prisma.ruchy_Opakowan_Zwrotnych.create({
        data: {
          id_asortymentu,
          ilosc: parseInt(ilosc),
          typ_ruchu,
          id_kontrahenta: id_kontrahenta || null,
          uwagi: uwagi || null,
          id_uzytkownika: user.id
        },
        include: {
          asortyment: true,
          kontrahent: true
        }
      });

      res.json(ruch);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

router.delete("/api/opakowania-zwrotne/ruch/:id", async (req, res) => {
    try {
      await prisma.ruchy_Opakowan_Zwrotnych.delete({
        where: { id: req.params.id }
      });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

export default router;
