import { Router } from "express";
import { prisma } from "../db";
import { generateDocNumber, generateSesjaNumber, generateZlecenieNumber } from "../utils/docNumbers";
import { generateDocumentHTML, generatePDF } from "../../server-pdf";

const router = Router();

router.get("/api/receptury", async (req, res) => {
    try {
      const includeArchived = req.query.includeArchived === 'true';
      const receptury = await prisma.receptury.findMany({
        where: includeArchived ? {} : { czy_aktywne: true },
        include: {
          asortyment_docelowy: {
            include: { grupa: { select: { kod: true } } }
          },
          skladniki: {
            where: { czy_aktywne: true },
            include: {
              asortyment_skladnika: true,
            },
          },
        },
        orderBy: {
          utworzono_dnia: "desc",
        },
      });
      res.json(receptury);
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania receptur" });
    }
  });

router.post("/api/receptury", async (req, res) => {
    try {
      const { id_asortymentu_docelowego, numer_wersji, dni_trwalosci, wielkosc_produkcji, skladniki } = req.body;

      // Sprawdzenie czy wersja już istnieje
      const existing = await prisma.receptury.findUnique({
        where: {
          id_asortymentu_docelowego_numer_wersji: {
            id_asortymentu_docelowego,
            numer_wersji: Number(numer_wersji),
          },
        },
      });

      if (existing) {
        return res.status(400).json({ error: "Ta wersja receptury dla wybranego produktu już istnieje." });
      }

      const receptura = await prisma.receptury.create({
        data: {
          id_asortymentu_docelowego,
          numer_wersji: Number(numer_wersji),
          dni_trwalosci: dni_trwalosci != null ? Number(dni_trwalosci) || null : null,
          wielkosc_produkcji: wielkosc_produkcji ? parseFloat(wielkosc_produkcji) : 1,
          skladniki: {
            create: skladniki.map((s: any) => ({
              id_asortymentu_skladnika: s.id_asortymentu_skladnika,
              ilosc_wymagana: parseFloat(s.ilosc_wymagana),
              czy_pomocnicza: s.czy_pomocnicza === true
            })),
          },
        },
        include: {
          asortyment_docelowy: true,
          skladniki: {
            include: {
              asortyment_skladnika: true,
            },
          },
        },
      });

      res.json(receptura);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Błąd tworzenia receptury" });
    }
  });

router.put("/api/receptury/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { id_asortymentu_docelowego, numer_wersji, dni_trwalosci, wielkosc_produkcji, skladniki } = req.body;

      // Sprawdzenie czy inna receptura o tej samej wersji już istnieje
      const existing = await prisma.receptury.findFirst({
        where: {
          id_asortymentu_docelowego,
          numer_wersji: Number(numer_wersji),
          id: { not: id },
        },
      });

      if (existing) {
        return res.status(400).json({ error: "Ta wersja receptury dla wybranego produktu już istnieje." });
      }

      const receptura = await prisma.receptury.update({
        where: { id },
        data: {
          id_asortymentu_docelowego,
          numer_wersji: Number(numer_wersji),
          dni_trwalosci: dni_trwalosci != null ? Number(dni_trwalosci) || null : null,
          wielkosc_produkcji: wielkosc_produkcji ? parseFloat(wielkosc_produkcji) : 1,
          skladniki: {
            deleteMany: {}, // Usuń stare składniki
            create: skladniki.map((s: any) => ({
              id_asortymentu_skladnika: s.id_asortymentu_skladnika,
              ilosc_wymagana: parseFloat(s.ilosc_wymagana),
              czy_pomocnicza: s.czy_pomocnicza === true
            })),
          },
        },
        include: {
          asortyment_docelowy: true,
          skladniki: {
            include: {
              asortyment_skladnika: true,
            },
          },
        },
      });

      res.json(receptura);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Błąd aktualizacji receptury" });
    }
  });

router.delete("/api/receptury/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.receptury.update({
        where: { id },
        data: { czy_aktywne: false },
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Błąd usuwania receptury" });
    }
  });

router.put("/api/receptury/:id/parametry", async (req, res) => {
    try {
      const { wielkosc_produkcji, narzut_procent } = req.body;
      const result = await prisma.receptury.update({
        where: { id: req.params.id },
        data: {
          wielkosc_produkcji: parseFloat(wielkosc_produkcji) || 1,
          narzut_procent: parseFloat(narzut_procent) || 0,
        },
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Błąd zapisu parametrów" });
    }
  });

/**
 * Warianty wsadu — typowe mnożniki, w jakich robi się dany smak, wraz z
 * docelowym opakowaniem (np. ×4 → kuweta, ×10 → 2 pozzetti).
 * Służą do jednoklikowego dodawania wsadów na planie turnusu.
 */
router.put("/api/receptury/:id/warianty", async (req, res) => {
    try {
      const { warianty } = req.body;
      const oczyszczone = (warianty || [])
        .map((w: any) => ({
          mnoznik: parseFloat(w.mnoznik),
          id_opakowania: w.id_opakowania || null,
          liczba: parseInt(w.liczba, 10) || 1,
        }))
        .filter((w: any) => w.mnoznik > 0);

      const result = await prisma.receptury.update({
        where: { id: req.params.id },
        data: { warianty_json: oczyszczone.length > 0 ? JSON.stringify(oczyszczone) : null },
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Błąd zapisu wariantów wsadu" });
    }
  });

router.get("/api/receptury/:id/kalkulacja", async (req, res) => {
    try {
      const receptura = await prisma.receptury.findUnique({
        where: { id: req.params.id },
        include: {
          asortyment_docelowy: true,
          skladniki: {
            where: { czy_aktywne: true },
            include: { asortyment_skladnika: true },
          },
        },
      });
      if (!receptura) return res.status(404).json({ error: "Nie znaleziono" });

      const wiersze = await Promise.all(
        receptura.skladniki.map(async (s) => {
          const cena_srednia = s.asortyment_skladnika.cena_zakupu ?? 0;

          // Przelicz masę: jeśli pomocnicza, użyj przelicznika
          const przelicznik = s.czy_pomocnicza && s.asortyment_skladnika.przelicznik_jednostki
            ? s.asortyment_skladnika.przelicznik_jednostki
            : 1;
          const ilosc_na_jm = s.czy_pomocnicza && s.asortyment_skladnika.przelicznik_jednostki
            ? s.ilosc_wymagana / przelicznik  // JM_pomocnicza → JM bazowa: dzielimy (1 JM = X JM_pomocnicza)
            : s.ilosc_wymagana; // już w JM bazowej
          const ilosc_na_batch = ilosc_na_jm * receptura.wielkosc_produkcji;
          const wartosc = ilosc_na_batch * cena_srednia;

          return {
            id_asortymentu: s.id_asortymentu_skladnika,
            nazwa: s.asortyment_skladnika.nazwa,
            kod: s.asortyment_skladnika.kod_towaru,
            jednostka: s.czy_pomocnicza ? (s.asortyment_skladnika.jednostka_pomocnicza || s.asortyment_skladnika.jednostka_miary) : s.asortyment_skladnika.jednostka_miary,
            ilosc_wymagana: s.ilosc_wymagana,        // na 1 JM wyrobu
            ilosc_na_batch,                            // na cały wsad
            procent_strat: s.procent_strat,
            cena_srednia,
            wartosc,
          };
        })
      );

      const koszt_skladnikow = wiersze.reduce((s, w) => s + w.wartosc, 0);
      const koszt_na_jm = receptura.wielkosc_produkcji > 0 ? koszt_skladnikow / receptura.wielkosc_produkcji : 0;
      const narzut_zl = koszt_na_jm * receptura.narzut_procent / 100;
      const koszt_z_narzotem = koszt_na_jm + narzut_zl;

      // Uzupełnij udziały procentowe
      const wierszeFinal = wiersze.map(w => ({
        ...w,
        udzial_procent: koszt_skladnikow > 0 ? (w.wartosc / koszt_skladnikow * 100) : 0,
      }));

      res.json({
        wielkosc_produkcji: receptura.wielkosc_produkcji,
        narzut_procent: receptura.narzut_procent,
        jednostka_miary: receptura.asortyment_docelowy.jednostka_miary,
        wiersze: wierszeFinal,
        koszt_skladnikow,
        koszt_na_jm,
        narzut_zl,
        koszt_z_narzotem,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Błąd kalkulacji" });
    }
  });

router.patch("/:id/aktywne", async (req, res) => {
    try {
      const { czy_aktywne } = req.body;
      await prisma.receptury.update({
        where: { id: req.params.id },
        data: { czy_aktywne: Boolean(czy_aktywne) },
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "B┼é─ůd aktualizacji statusu receptury" });
    }
  });

export default router;
