import express from "express";
import helmet from "helmet";
import { createServer as createViteServer } from "vite";
import { PrismaClient } from "@prisma/client";
import path from "path";
import QRCode from "qrcode";

const prisma = new PrismaClient();

async function generateDocNumber(tx: any, prefix: string) {
  const date = new Date();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  const suffix = `/${month}/${year}`;

  // For PZ/WZ, also check Dokumenty_Magazynowe headers (includes BUFOR docs)
  let maxNum = 0;
  if (prefix === "PZ" || prefix === "WZ") {
    const headers = await tx.dokumenty_Magazynowe.findMany({
      where: { referencja: { endsWith: suffix }, typ: prefix }
    });
    for (const h of headers) {
      const match = h.referencja.match(new RegExp(`^${prefix}-(\\d+)/${month}/${year}$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  } else {
    const ruchy = await tx.ruchy_Magazynowe.findMany({
      where: { referencja_dokumentu: { endsWith: suffix } }
    });
    for (const r of ruchy) {
      if (r.referencja_dokumentu && r.referencja_dokumentu.startsWith(`${prefix}-`)) {
        const match = r.referencja_dokumentu.match(new RegExp(`^${prefix}-(\\d+)/${month}/${year}$`));
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
  }
  return `${prefix}-${maxNum + 1}${suffix}`;
}

// Migracja jednorazowa: tworzy nagłówki Dokumenty_Magazynowe dla istniejących PZ/WZ
async function migrateExistingDocuments() {
  try {
    const user = await prisma.uzytkownicy.findFirst();
    if (!user) return;

    const existingRuchy = await prisma.ruchy_Magazynowe.findMany({
      where: { typ_ruchu: { in: ["PZ", "WZ"] }, referencja_dokumentu: { not: null } },
      select: { referencja_dokumentu: true, typ_ruchu: true, id_uzytkownika: true, utworzono_dnia: true }
    });

    const refMap = new Map<string, { typ: string; userId: string; data: Date }>();
    for (const r of existingRuchy) {
      if (r.referencja_dokumentu && !refMap.has(r.referencja_dokumentu)) {
        refMap.set(r.referencja_dokumentu, {
          typ: r.typ_ruchu,
          userId: r.id_uzytkownika,
          data: r.utworzono_dnia
        });
      }
    }

    for (const [ref, info] of refMap) {
      const existing = await prisma.dokumenty_Magazynowe.findUnique({ where: { referencja: ref } });
      if (!existing) {
        await prisma.dokumenty_Magazynowe.create({
          data: {
            referencja: ref,
            typ: info.typ,
            status: "Zatwierdzony",
            id_uzytkownika_utworzenia: info.userId,
            id_uzytkownika_zatwierdzenia: info.userId,
            data_zatwierdzenia: info.data,
            utworzono_dnia: info.data,
          }
        });
      }
    }
    console.log(`Migracja dokumentów: ${refMap.size} dokumentów PZ/WZ zmigrowanych.`);
  } catch (e) {
    console.warn("Błąd migracji dokumentów:", e);
  }
}

async function generateSesjaNumber(tx: any) {
  const date = new Date();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  const suffix = `/${month}/${year}`;
  const sesje = await tx.sesje_Produkcji.findMany({ where: { numer_sesji: { endsWith: suffix } } });
  let maxNum = 0;
  for (const s of sesje) {
    const match = s.numer_sesji.match(new RegExp(`^SP-(\\d+)/${month}/${year}$`));
    if (match) { const num = parseInt(match[1], 10); if (num > maxNum) maxNum = num; }
  }
  return `SP-${(maxNum + 1).toString().padStart(3, '0')}${suffix}`;
}

async function generateZlecenieNumber(tx: any) {
  const date = new Date();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  const prefix = 'ZP';
  const suffix = `/${month}/${year}`;

  const zlecenia = await tx.zlecenia_Produkcyjne.findMany({
    where: {
      czy_aktywne: true,
      numer_zlecenia: {
        endsWith: suffix
      }
    }
  });

  let maxNum = 0;
  for (const z of zlecenia) {
    if (z.numer_zlecenia && z.numer_zlecenia.startsWith(`${prefix}-`)) {
      const match = z.numer_zlecenia.match(new RegExp(`^${prefix}-(\\d+)/${month}/${year}$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }

  return `${prefix}-${(maxNum + 1).toString().padStart(4, '0')}${suffix}`;
}

async function startServer() {
  await migrateExistingDocuments();

  const app = express();
  const PORT = parseInt(process.env.PORT || "3001", 10);

  app.use(helmet({ contentSecurityPolicy: false })); // CSP wyłączone bo Vite dev serwuje inline scripts
  app.use(express.json());

  // --- API ROUTES ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Jednorazowy setup — tworzy admina tylko jeśli brak użytkowników w systemie
  app.get("/api/setup", async (req, res) => {
    const count = await prisma.uzytkownicy.count();
    if (count > 0) {
      return res.send("✅ System już skonfigurowany — użytkownik istnieje.");
    }
    await prisma.uzytkownicy.create({ data: { login: "admin", haslo: "admin" } });
    res.send("✅ Utworzono użytkownika admin / admin. Możesz teraz korzystać z systemu.");
  });

  app.post("/api/reset", async (req, res) => {
    const { confirm } = req.body;
    if (confirm !== "RESET_CONFIRMED") {
      return res.status(400).json({ error: "Wymagane potwierdzenie: { confirm: 'RESET_CONFIRMED' }" });
    }
    try {
      await prisma.$transaction([
        prisma.rezerwacje_Magazynowe.deleteMany(),
        prisma.ruchy_Magazynowe.deleteMany(),
        prisma.skladniki_Receptury.deleteMany(),
        prisma.zlecenia_Produkcyjne.deleteMany(),
        prisma.receptury.deleteMany(),
        prisma.partie_Magazynowe.deleteMany(),

        prisma.asortyment.deleteMany(),
        prisma.uzytkownicy.deleteMany(),
      ]);
      res.json({ success: true, message: "Baza wyczyszczona. Odśwież stronę." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Tworzy użytkownika systemowego (wymagany jako FK dla ruchów magazynowych)
  // Dane demo ładuj przez: npx tsx prisma/seed.ts
  app.post("/api/init", async (req, res) => {
    try {
      let user = await prisma.uzytkownicy.findFirst();
      if (!user) {
        user = await prisma.uzytkownicy.create({
          data: { login: "admin", haslo: "admin" },
        });
      }

      // Migracja starych numerów zleceń (ZLE/ → ZP-)
      const oldZlecenia = await prisma.zlecenia_Produkcyjne.findMany({
        where: {
          OR: [
            { numer_zlecenia: { startsWith: "ZLE/" } },
            { numer_zlecenia: { startsWith: "ZLE-" } }
          ]
        }
      });

      if (oldZlecenia.length > 0) {
        for (const z of oldZlecenia) {
          const newNumber = await generateZlecenieNumber(prisma);
          await prisma.zlecenia_Produkcyjne.update({
            where: { id: z.id },
            data: { numer_zlecenia: newNumber }
          });
        }
        console.log(`Zaktualizowano numerację dla ${oldZlecenia.length} starych zleceń.`);
      }

      res.json({ user, migratedZlecenia: oldZlecenia.length });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Błąd inicjalizacji użytkownika" });
    }
  });

  // --- KONTRAHENCI ---
  app.get("/api/kontrahenci", async (req, res) => {
    try {
      const kontrahenci = await prisma.kontrahenci.findMany({
        where: { czy_aktywne: true },
        orderBy: { nazwa: "asc" },
      });
      res.json(kontrahenci);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/kontrahenci", async (req, res) => {
    try {
      const { kod, nazwa, adres } = req.body;
      if (!kod?.trim() || !nazwa?.trim()) return res.status(400).json({ error: "Kod i nazwa są wymagane" });
      const k = await prisma.kontrahenci.create({ data: { kod: kod.trim(), nazwa: nazwa.trim(), adres: adres?.trim() || null } });
      res.json(k);
    } catch (e: any) {
      if (e.code === "P2002") return res.status(400).json({ error: "Kontrahent z tym kodem już istnieje" });
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/kontrahenci/:id", async (req, res) => {
    try {
      const { kod, nazwa, adres } = req.body;
      if (!kod?.trim() || !nazwa?.trim()) return res.status(400).json({ error: "Kod i nazwa są wymagane" });
      const k = await prisma.kontrahenci.update({
        where: { id: req.params.id },
        data: { kod: kod.trim(), nazwa: nazwa.trim(), adres: adres?.trim() || null },
      });
      res.json(k);
    } catch (e: any) {
      if (e.code === "P2002") return res.status(400).json({ error: "Kontrahent z tym kodem już istnieje" });
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/kontrahenci/:id", async (req, res) => {
    try {
      await prisma.kontrahenci.update({ where: { id: req.params.id }, data: { czy_aktywne: false } });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- KARTOTEKI (Asortyment) ---
  app.get("/api/asortyment", async (req, res) => {
    try {
      const { pokazArchiwalne } = req.query;
      const whereClause = pokazArchiwalne === 'true' ? {} : { czy_aktywne: true };

      const dbItems = await prisma.asortyment.findMany({
        where: whereClause,
        include: {
          rezerwacje: {
            where: { czy_aktywne: true, status: "Aktywna", id_partii: null }
          },
          partie_magazynowe: {
            where: { czy_aktywne: true },
            include: {
              ruchy_magazynowe: { where: { czy_aktywne: true } },
              rezerwacje: { where: { czy_aktywne: true, status: "Aktywna" } },
            }
          }
        },
        orderBy: { nazwa: "asc" },
      });

      const items = dbItems.map(item => {
        let ilosc = 0;
        let batchReservations = 0;
        const globalReservations = item.rezerwacje.reduce((sum, rez) => sum + rez.ilosc_zarezerwowana, 0);
        let totalWartosc = 0;

        item.partie_magazynowe.forEach(partia => {
          const stanPartii = partia.ruchy_magazynowe.reduce((sum, ruch) => sum + ruch.ilosc, 0);
          if (stanPartii > 0) {
            ilosc += stanPartii;
            const pzDoc = partia.ruchy_magazynowe.find(r => (r.typ_ruchu === "PZ" || r.typ_ruchu === "Przyjecie_Z_Produkcji") && r.ilosc > 0);
            const cena = pzDoc?.cena_jednostkowa || 0;
            totalWartosc += stanPartii * cena;
          }

          batchReservations += partia.rezerwacje.reduce((sum, rez) => sum + rez.ilosc_zarezerwowana, 0);
        });

        const rezerwacje = batchReservations + globalReservations;
        const cena_srednia = ilosc > 0 ? (totalWartosc / ilosc) : 0;
        const { partie_magazynowe, rezerwacje: _r, ...rest } = item;
        return {
          ...rest,
          ilosc,
          rezerwacje,
          cena_srednia
        };
      });

      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania asortymentu" });
    }
  });

  app.post("/api/asortyment", async (req, res) => {
    try {
      const { kod_towaru, nazwa, typ_asortymentu, jednostka_miary, jednostka_pomocnicza, przelicznik_jednostki, czy_wymaga_daty_waznosci } = req.body;

      const parsedPrzelicznik = przelicznik_jednostki !== null && przelicznik_jednostki !== undefined && przelicznik_jednostki !== ""
        ? parseFloat(przelicznik_jednostki.toString().replace(",", "."))
        : null;

      const newItem = await prisma.asortyment.create({
        data: {
          kod_towaru,
          nazwa,
          typ_asortymentu,
          jednostka_miary,
          jednostka_pomocnicza: jednostka_pomocnicza || null,
          przelicznik_jednostki: isNaN(Number(parsedPrzelicznik)) ? null : parsedPrzelicznik,
          czy_wymaga_daty_waznosci: Boolean(czy_wymaga_daty_waznosci),
        },
      });
      res.json(newItem);
    } catch (error) {
      res.status(500).json({ error: "Błąd tworzenia asortymentu" });
    }
  });

  app.put("/api/asortyment/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { kod_towaru, nazwa, typ_asortymentu, jednostka_miary, jednostka_pomocnicza, przelicznik_jednostki, czy_wymaga_daty_waznosci } = req.body;

      const parsedPrzelicznik = przelicznik_jednostki !== null && przelicznik_jednostki !== undefined && przelicznik_jednostki !== ""
        ? parseFloat(przelicznik_jednostki.toString().replace(",", "."))
        : null;

      const updatedItem = await prisma.asortyment.update({
        where: { id },
        data: {
          kod_towaru,
          nazwa,
          typ_asortymentu,
          jednostka_miary,
          jednostka_pomocnicza: jednostka_pomocnicza || null,
          przelicznik_jednostki: isNaN(Number(parsedPrzelicznik)) ? null : parsedPrzelicznik,
          czy_wymaga_daty_waznosci: Boolean(czy_wymaga_daty_waznosci),
        },
      });
      res.json(updatedItem);
    } catch (error) {
      res.status(500).json({ error: "Błąd aktualizacji asortymentu" });
    }
  });

  app.delete("/api/asortyment/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { archive } = req.query;

      // Sprawdzenie czy asortyment jest używany
      const partieCount = await prisma.partie_Magazynowe.count({ where: { id_asortymentu: id } });
      const recepturyCount = await prisma.receptury.count({ where: { id_asortymentu_docelowego: id } });
      const skladnikiCount = await prisma.skladniki_Receptury.count({ where: { id_asortymentu_skladnika: id } });

      const hasHistory = partieCount > 0 || recepturyCount > 0 || skladnikiCount > 0;

      if (hasHistory) {
        if (archive === 'true') {
          await prisma.asortyment.update({
            where: { id },
            data: { czy_aktywne: false },
          });
          return res.json({ success: true, archived: true });
        } else {
          return res.status(409).json({
            error: "Element posiada historię",
            requiresArchiving: true
          });
        }
      } else {
        await prisma.asortyment.delete({
          where: { id }
        });
        return res.json({ success: true, deleted: true });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Błąd usuwania asortymentu" });
    }
  });

  app.put("/api/asortyment/:id/restore", async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.asortyment.update({
        where: { id },
        data: { czy_aktywne: true },
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Błąd przywracania asortymentu" });
    }
  });

  // --- WARTOŚCI ODŻYWCZE ---
  app.get("/api/asortyment/:id/odzywcze", async (req, res) => {
    try {
      const data = await (prisma as any).wartosci_Odzywcze.findUnique({
        where: { id_asortymentu: req.params.id },
      });
      res.json(data || null);
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania wartości odżywczych" });
    }
  });

  app.put("/api/asortyment/:id/odzywcze", async (req, res) => {
    try {
      const { id } = req.params;
      const fields = ["porcja_g","energia_kj","energia_kcal","tluszcz","kwasy_nasycone","weglowodany","cukry","blonnik","bialko","sol"];
      const data: any = {};
      for (const f of fields) {
        if (req.body[f] !== undefined) data[f] = req.body[f] === "" || req.body[f] === null ? null : parseFloat(req.body[f]);
      }
      const result = await (prisma as any).wartosci_Odzywcze.upsert({
        where: { id_asortymentu: id },
        update: data,
        create: { id_asortymentu: id, ...data },
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Błąd zapisu wartości odżywczych" });
    }
  });

  // --- ALERGENY ---
  app.get("/api/asortyment/:id/alergeny", async (req, res) => {
    try {
      const data = await (prisma as any).alergeny_Asortymentu.findUnique({
        where: { id_asortymentu: req.params.id },
      });
      res.json(data || null);
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania alergenów" });
    }
  });

  app.put("/api/asortyment/:id/alergeny", async (req, res) => {
    try {
      const { id } = req.params;
      const boolFields = ["gluten","skorupiaki","jaja","ryby","orzeszki_ziemne","soja","mleko","orzechy","seler","gorczyca","sezam","dwutlenek_siarki","lubin","mieczaki"];
      const data: any = {};
      for (const f of boolFields) {
        if (req.body[f] !== undefined) data[f] = Boolean(req.body[f]);
      }
      const result = await (prisma as any).alergeny_Asortymentu.upsert({
        where: { id_asortymentu: id },
        update: data,
        create: { id_asortymentu: id, ...data },
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Błąd zapisu alergenów" });
    }
  });

  // --- DODATKOWE POLA KARTOTEKI (producent, zrodlo_danych, skladniki_opis, moze_zawierac) ---
  app.put("/api/asortyment/:id/kartoteka", async (req, res) => {
    try {
      const { id } = req.params;
      const { producent, zrodlo_danych, skladniki_opis, moze_zawierac } = req.body;
      const result = await prisma.asortyment.update({
        where: { id },
        data: { producent, zrodlo_danych, skladniki_opis, moze_zawierac },
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Błąd zapisu kartoteki" });
    }
  });

  // --- DOKUMENTY ---
  app.get("/api/dokumenty", async (req, res) => {
    try {
      const { typ: filterTyp } = req.query;
      const dokumentyMap = new Map();

      // PZ/WZ — pobieramy z Dokumenty_Magazynowe (żródło prawdy)
      const showPZ = !filterTyp || filterTyp === "all" || filterTyp === "PZ";
      const showWZ = !filterTyp || filterTyp === "all" || filterTyp === "WZ";

      if (showPZ || showWZ) {
        const headerWhere: any = {};
        if (filterTyp === "PZ") headerWhere.typ = "PZ";
        else if (filterTyp === "WZ") headerWhere.typ = "WZ";
        else headerWhere.typ = { in: ["PZ", "WZ"] };

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
      }

      // PW/RW — pobieramy z Ruchy_Magazynowe (brak statusów)
      const showPW = !filterTyp || filterTyp === "all" || filterTyp === "PW";
      const showRW = !filterTyp || filterTyp === "all" || filterTyp === "RW";

      if (showPW || showRW) {
        const ruchTypy: string[] = [];
        if (showPW) ruchTypy.push("Przyjecie_Z_Produkcji");
        if (showRW) ruchTypy.push("Zuzycie");

        const ruchy = await prisma.ruchy_Magazynowe.findMany({
          where: { typ_ruchu: { in: ruchTypy }, czy_aktywne: true },
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

  app.post("/api/dokumenty/:ref/zatwierdz", async (req, res) => {
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

        if (header.typ === "WZ") {
          // Sprawdź dostępność dla WZ przed aktywacją
          const niedobory: string[] = [];
          for (const ruch of ruchy) {
            const stanAktywny = ruch.partia.ruchy_magazynowe.reduce((s, r) => s + r.ilosc, 0);
            const wymagana = Math.abs(ruch.ilosc);
            if (stanAktywny < wymagana) {
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

        await tx.dokumenty_Magazynowe.update({
          where: { referencja: ref },
          data: {
            status: "Zatwierdzony",
            id_uzytkownika_zatwierdzenia: user.id,
            data_zatwierdzenia: new Date()
          }
        });
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd zatwierdzania dokumentu" });
    }
  });

  app.post("/api/dokumenty/:ref/anuluj", async (req, res) => {
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
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd anulowania dokumentu" });
    }
  });

  app.delete("/api/dokumenty/:ref", async (req, res) => {
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

  // --- MAGAZYN ---
  app.get("/api/magazyn/stany", async (req, res) => {
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

  // Stan magazynowy wyrobów gotowych — per partia z info o opakowaniu
  app.get("/api/wyroby-gotowe/stan", async (req, res) => {
    try {
      const partie = await prisma.partie_Magazynowe.findMany({
        where: { czy_aktywne: true, asortyment: { typ_asortymentu: "Wyrob_Gotowy", czy_aktywne: true } },
        include: {
          asortyment: true,
          ruchy_magazynowe: { where: { czy_aktywne: true } },
        },
        orderBy: [{ id_asortymentu: "asc" }, { data_produkcji: "asc" }],
      });

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
            const ops = JSON.parse(p.opakowania_json) as { id_asortymentu: string; waga_kg: number }[];
            // Grupuj po id_asortymentu — nazwa zawsze z kartoteki
            const grupy: Record<string, { nazwa: string; ilosc_szt: number; waga_orig: number }> = {};
            let waga_orig_total = 0;
            for (const o of ops) {
              const nazwaOp = opNazwyMap[o.id_asortymentu] ?? o.id_asortymentu;
              if (!grupy[o.id_asortymentu]) grupy[o.id_asortymentu] = { nazwa: nazwaOp, ilosc_szt: 0, waga_orig: 0 };
              grupy[o.id_asortymentu].ilosc_szt++;
              grupy[o.id_asortymentu].waga_orig += o.waga_kg;
              waga_orig_total += o.waga_kg;
            }
            // ilosc_kg per typ = proporcja z aktualnego stanu partii (Ruchy_Magazynowe)
            for (const g of Object.values(grupy)) {
              const udzial = waga_orig_total > 0 ? g.waga_orig / waga_orig_total : 1 / Object.keys(grupy).length;
              const ilosc_kg = Math.round(stan * udzial * 1000) / 1000;
              rows.push({ ...base, opakowanie: g.nazwa, ilosc_szt: g.ilosc_szt, ilosc_kg });
            }
            continue;
          } catch {}
        }

        // Brak danych o opakowaniach — jeden wiersz z łącznym kg
        rows.push({ ...base, opakowanie: null, ilosc_szt: null, ilosc_kg: Math.round(stan * 1000) / 1000 });
      }

      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/next-doc-number/:prefix", async (req, res) => {
    try {
      const prefix = req.params.prefix.toUpperCase();
      const number = await generateDocNumber(prisma, prefix);
      res.json({ number });
    } catch (error) {
      res.status(500).json({ error: "Błąd generowania numeru" });
    }
  });

  app.post("/api/magazyn/pz", async (req, res) => {
    try {
      const { referencja_zewnetrzna, pozycje } = req.body;
      const items = pozycje || [];

      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const result = await prisma.$transaction(async (tx) => {
        let finalReferencja = referencja_zewnetrzna;
        if (!finalReferencja) {
          finalReferencja = await generateDocNumber(tx, "PZ");
        }

        // Utwórz nagłówek dokumentu w stanie Bufor
        await tx.dokumenty_Magazynowe.create({
          data: {
            referencja: finalReferencja,
            typ: "PZ",
            status: "Bufor",
            id_uzytkownika_utworzenia: user.id,
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

          // Ruch nieaktywny — nie wpływa na stan do czasu zatwierdzenia
          const ruch = await tx.ruchy_Magazynowe.create({
            data: {
              id_partii: partia.id,
              typ_ruchu: "PZ",
              ilosc: parseFloat(ilosc),
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

  // --- MAGAZYN: WZ ---
  app.post("/api/magazyn/wz", async (req, res) => {
    try {
      const { items, referencja_zewnetrzna, id_kontrahenta } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Brak pozycji do wydania" });
      }

      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const result = await prisma.$transaction(async (tx) => {
        let finalReferencja = referencja_zewnetrzna;
        if (!finalReferencja) {
          finalReferencja = await generateDocNumber(tx, "WZ");
        }

        // Utwórz nagłówek dokumentu w stanie Bufor
        await tx.dokumenty_Magazynowe.create({
          data: {
            referencja: finalReferencja,
            typ: "WZ",
            status: "Bufor",
            id_uzytkownika_utworzenia: user.id,
            id_kontrahenta: id_kontrahenta || null,
            pozycje_json: JSON.stringify(items.map((it: any) => ({ id_partii: it.id_partii, ilosc: it.ilosc, sztuki: it.sztuki || {} }))),
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

  // --- DOKUMENTY ---
  // WAŻNE: szczegóły dokumentu MUSZĄ być przed /:typ
  app.get("/api/dokumenty/podglad/:referencja", async (req, res) => {
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

      // Parse sztuki breakdown from header if available
      let sztukiByPartia: Record<string, Record<string, number>> = {};
      if (header?.pozycje_json) {
        try {
          const parsed = JSON.parse(header.pozycje_json) as { id_partii: string; sztuki: Record<string, number> }[];
          parsed.forEach(p => { sztukiByPartia[p.id_partii] = p.sztuki || {}; });
        } catch {}
      }

      let wartosc_calkowita = 0;
      const pozycje: any[] = [];
      for (const r of ruchy) {
        const ilosc = Math.abs(r.ilosc);
        const cena = r.cena_jednostkowa || 0;
        const sztuki = sztukiByPartia[r.id_partii] || {};
        const hasOp = Object.keys(sztuki).length > 0;

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
            pozycje.push({
              asortyment: nazwaOp,
              wyrob: r.partia.asortyment.nazwa,
              kod_towaru: r.partia.asortyment.kod_towaru,
              numer_partii: r.partia.numer_partii,
              ilosc: szt,
              jednostka: "szt.",
              ilosc_kg: iloscKg,
              cena_jednostkowa: wagaKg > 0 ? cena * wagaKg : null,
              wartosc,
            });
          }
        } else {
          const wartosc = ilosc * cena;
          wartosc_calkowita += wartosc;
          pozycje.push({
            asortyment: r.partia.asortyment.nazwa,
            wyrob: null,
            kod_towaru: r.partia.asortyment.kod_towaru,
            numer_partii: r.partia.numer_partii,
            ilosc,
            jednostka: r.partia.asortyment.jednostka_miary,
            ilosc_kg: null,
            cena_jednostkowa: r.cena_jednostkowa,
            wartosc,
          });
        }
      }

      const typDok = firstRuch
        ? (firstRuch.typ_ruchu === "Zuzycie" ? "RW" : firstRuch.typ_ruchu === "Przyjecie_Z_Produkcji" ? "PW" : firstRuch.typ_ruchu)
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
        kontrahent: header?.kontrahent ? { id: header.kontrahent.id, kod: header.kontrahent.kod, nazwa: header.kontrahent.nazwa } : null,
        pozycje,
        wartosc_calkowita
      });
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania dokumentu" });
    }
  });

  app.get("/api/dokumenty/:typ", async (req, res) => {
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

            // Obliczamy realny stan każdej partii pomniejszony o aktywne rezerwacje
            const sugestie = partie.map(p => {
              const stan = p.ruchy_magazynowe.reduce((sum, r) => sum + r.ilosc, 0)
                         - p.rezerwacje.reduce((sum, r) => sum + r.ilosc_zarezerwowana, 0);
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

  // --- RECEPTURY ---
  app.get("/api/receptury", async (req, res) => {
    try {
      const includeArchived = req.query.includeArchived === 'true';
      const receptury = await prisma.receptury.findMany({
        where: includeArchived ? {} : { czy_aktywne: true },
        include: {
          asortyment_docelowy: true,
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

  app.post("/api/receptury", async (req, res) => {
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

  app.put("/api/receptury/:id", async (req, res) => {
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

  app.delete("/api/receptury/:id", async (req, res) => {
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

  app.patch("/api/receptury/:id/aktywne", async (req, res) => {
    try {
      const { czy_aktywne } = req.body;
      await prisma.receptury.update({
        where: { id: req.params.id },
        data: { czy_aktywne: Boolean(czy_aktywne) },
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Błąd aktualizacji statusu receptury" });
    }
  });

  // --- RECEPTURY: PARAMETRY KALKULACYJNE ---
  app.put("/api/receptury/:id/parametry", async (req, res) => {
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

  // --- RECEPTURY: KALKULACJA KOSZTÓW ---
  app.get("/api/receptury/:id/kalkulacja", async (req, res) => {
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

      // Dla każdego składnika: znajdź średnią cenę ważoną z ruchów PZ
      const wiersze = await Promise.all(
        receptura.skladniki.map(async (s) => {
          // Znajdź partie tego asortymentu z cenami
          const ruchy = await prisma.ruchy_Magazynowe.findMany({
            where: {
              partia: { id_asortymentu: s.id_asortymentu_skladnika },
              typ_ruchu: { in: ["PZ", "Przyjecie_Z_Produkcji"] },
              cena_jednostkowa: { not: null },
              czy_aktywne: true,
            },
            select: { ilosc: true, cena_jednostkowa: true },
          });

          // Średnia ważona cena
          const totalIlosc = ruchy.reduce((acc, r) => acc + r.ilosc, 0);
          const totalWart = ruchy.reduce((acc, r) => acc + r.ilosc * (r.cena_jednostkowa || 0), 0);
          const cena_srednia = totalIlosc > 0 ? totalWart / totalIlosc : 0;

          // Przelicz masę: jeśli pomocnicza, użyj przelicznika
          const przelicznik = s.czy_pomocnicza && s.asortyment_skladnika.przelicznik_jednostki
            ? s.asortyment_skladnika.przelicznik_jednostki
            : 1;
          const ilosc_na_jm = s.ilosc_wymagana * przelicznik; // w JM bazowej
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

  // --- PRODUKCJA: ROZLICZENIE ---
  app.post("/api/produkcja/rozliczenie", async (req, res) => {
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

      // Pobierz średnie ceny dla wszystkich asortymentów składników
      const allIngredientIds = [...new Set(receptury.flatMap(r => r.skladniki.map(s => s.id_asortymentu_skladnika)))];
      const cenySrednie: Record<string, number> = {};
      await Promise.all(allIngredientIds.map(async (id) => {
        const ruchy = await prisma.ruchy_Magazynowe.findMany({
          where: { partia: { id_asortymentu: id }, typ_ruchu: { in: ["PZ", "Przyjecie_Z_Produkcji"] }, cena_jednostkowa: { not: null }, czy_aktywne: true },
          select: { ilosc: true, cena_jednostkowa: true },
        });
        const totalIlosc = ruchy.reduce((s, r) => s + r.ilosc, 0);
        const totalWart = ruchy.reduce((s, r) => s + r.ilosc * (r.cena_jednostkowa || 0), 0);
        cenySrednie[id] = totalIlosc > 0 ? totalWart / totalIlosc : 0;
      }));

      // Kalkulacja na produkt
      const produkty: any[] = [];
      const skladnikiMap: Record<string, any> = {};

      for (const poz of pozycje) {
        const rec = receptury.find(r => r.id === poz.id_receptury);
        if (!rec || poz.ilosc_produkcji <= 0) continue;

        let koszt_jm = 0;
        for (const s of rec.skladniki) {
          const przelicznik = s.czy_pomocnicza && s.asortyment_skladnika.przelicznik_jednostki ? s.asortyment_skladnika.przelicznik_jednostki : 1;
          const ilosc_na_jm = s.ilosc_wymagana * przelicznik;
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

  // --- PRODUKCJA ---
  app.get("/api/produkcja", async (req, res) => {
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
      // Proaktywna inicjatywa: Dodajemy sugestie partii FIFO do każdego zlecenia w widoku produkcji
      const zleceniaWithSuggestions = await Promise.all(zlecenia.map(async (z) => {
        if (z.status === "Zrealizowane" || z.status === "Anulowane") return {
          ...z,
          opakowania: z.opakowania_json ? JSON.parse(z.opakowania_json) : [],
        };

        const skladnikiWithBatches = await Promise.all(z.receptura.skladniki.map(async (s) => {
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

          const sugestie = partie.map(p => ({
            id: p.id,
            numer_partii: p.numer_partii,
            termin_waznosci: p.termin_waznosci,
            stan: p.ruchy_magazynowe.reduce((sum, r) => sum + r.ilosc, 0)
                - p.rezerwacje.reduce((sum, r) => sum + r.ilosc_zarezerwowana, 0)
          })).filter(p => p.stan > 0);

          return { ...s, sugerowane_partie: sugestie };
        }));

        return {
          ...z,
          opakowania: [],
          receptura: { ...z.receptura, skladniki: skladnikiWithBatches }
        };
      }));

      res.json(zleceniaWithSuggestions);
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania zleceń produkcyjnych" });
    }
  });

  app.post("/api/produkcja", async (req, res) => {
    try {
      const { id_receptury, planowana_ilosc_wyrobu } = req.body;

      const zlecenie = await prisma.$transaction(async (tx) => {
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

      res.json(zlecenie);
    } catch (error) {
      res.status(500).json({ error: "Błąd tworzenia zlecenia produkcyjnego" });
    }
  });

  // --- SESJA ROBOCZA (draft wizarda) ---
  app.get("/api/produkcja/sesja-robocza", async (_req, res) => {
    try {
      const row = await (prisma as any).sesja_Robocza.findFirst({ orderBy: { zaktualizowano_dnia: "desc" } });
      res.json(row ?? null);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/produkcja/sesja-robocza", async (req, res) => {
    try {
      const { krok, dane_json, zdarzenie = "auto" } = req.body;
      const existing = await (prisma as any).sesja_Robocza.findFirst();
      const row = existing
        ? await (prisma as any).sesja_Robocza.update({ where: { id: existing.id }, data: { krok, dane_json } })
        : await (prisma as any).sesja_Robocza.create({ data: { krok, dane_json } });
      await (prisma as any).sesja_Robocza_Log.create({
        data: { id_sesji_roboczej: row.id, krok, zdarzenie, dane_json },
      });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/produkcja/sesja-robocza/log", async (_req, res) => {
    try {
      const row = await (prisma as any).sesja_Robocza.findFirst({ orderBy: { zaktualizowano_dnia: "desc" } });
      if (!row) return res.json([]);
      const log = await (prisma as any).sesja_Robocza_Log.findMany({
        where: { id_sesji_roboczej: row.id },
        orderBy: { utworzono_dnia: "asc" },
      });
      res.json(log);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/produkcja/sesja-robocza", async (_req, res) => {
    try {
      await (prisma as any).sesja_Robocza_Log.deleteMany();
      await (prisma as any).sesja_Robocza.deleteMany();
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- SESJA PRODUKCYJNA (wieloetapowa) ---
  app.post("/api/produkcja/sesja", async (req, res) => {
    try {
      const { id_receptury_bazy, ilosc_bazy, rzeczywista_ilosc_bazy, surowce_bazy, wyroby } = req.body;
      // wyroby: [{ id_receptury, ilosc, surowce: [{ id_partii, ilosc }] }]
      if (!id_receptury_bazy || !(parseFloat(ilosc_bazy) > 0)) throw new Error("Podaj recepturę i ilość bazy");
      if (!wyroby || wyroby.length === 0) throw new Error("Dodaj co najmniej jeden wyrób gotowy");

      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const result = await prisma.$transaction(async (tx) => {
        const numer_sesji = await generateSesjaNumber(tx);
        const sesja = await tx.sesje_Produkcji.create({ data: { numer_sesji } });

        // ── Etap 1: Polprodukt (baza) ──────────────────────────────────────
        const recepturaBazy = await tx.receptury.findUnique({
          where: { id: id_receptury_bazy },
          include: { asortyment_docelowy: true },
        });
        if (!recepturaBazy) throw new Error("Nie znaleziono receptury bazy");

        const numer_zp_bazy = await generateZlecenieNumber(tx);
        const zlecenieBazy = await tx.zlecenia_Produkcyjne.create({
          data: { numer_zlecenia: numer_zp_bazy, id_receptury: id_receptury_bazy, id_sesji: sesja.id, etap: 1, planowana_ilosc_wyrobu: parseFloat(ilosc_bazy), status: "Planowane" },
        });

        const rwBazyNr = await generateDocNumber(tx, "RW");
        const pwBazyNr = await generateDocNumber(tx, "PW");
        let kosztBazy = 0;

        for (const s of surowce_bazy || []) {
          if (!s.id_partii || !(parseFloat(s.ilosc) > 0)) continue;
          const ilosc = parseFloat(s.ilosc);
          const partia = await tx.partie_Magazynowe.findUnique({
            where: { id: s.id_partii },
            include: { ruchy_magazynowe: { where: { czy_aktywne: true } } },
          });
          if (!partia) throw new Error(`Partia ${s.id_partii} nie istnieje`);
          const stanPartii = partia.ruchy_magazynowe.reduce((sum: number, r: any) => sum + r.ilosc, 0);
          if (stanPartii < ilosc - 0.001) throw new Error(`Niewystarczający stan partii ${partia.numer_partii}`);
          const cenaDoc = await tx.ruchy_Magazynowe.findFirst({
            where: { id_partii: s.id_partii, ilosc: { gt: 0 }, czy_aktywne: true },
            orderBy: { utworzono_dnia: "asc" },
          });
          kosztBazy += ilosc * (cenaDoc?.cena_jednostkowa ?? 0);
          await tx.ruchy_Magazynowe.create({
            data: { id_partii: s.id_partii, id_zlecenia: zlecenieBazy.id, typ_ruchu: "Zuzycie", ilosc: -ilosc, cena_jednostkowa: cenaDoc?.cena_jednostkowa ?? 0, referencja_dokumentu: rwBazyNr, id_uzytkownika: user.id },
          });
        }

        const iloscBazy = rzeczywista_ilosc_bazy != null && parseFloat(rzeczywista_ilosc_bazy) > 0
          ? parseFloat(rzeczywista_ilosc_bazy)
          : parseFloat(ilosc_bazy);
        const terminWaznosci_baza = recepturaBazy.dni_trwalosci ? new Date(Date.now() + recepturaBazy.dni_trwalosci * 86400000) : null;
        const partiaBazy = await tx.partie_Magazynowe.create({
          data: { id_asortymentu: recepturaBazy.id_asortymentu_docelowego, numer_partii: pwBazyNr, data_produkcji: new Date(), termin_waznosci: terminWaznosci_baza, status_partii: "Dostepna" },
        });
        const cenaBazy = iloscBazy > 0 ? kosztBazy / iloscBazy : 0;
        await tx.ruchy_Magazynowe.create({
          data: { id_partii: partiaBazy.id, id_zlecenia: zlecenieBazy.id, typ_ruchu: "Przyjecie_Z_Produkcji", ilosc: iloscBazy, cena_jednostkowa: cenaBazy, referencja_dokumentu: pwBazyNr, id_uzytkownika: user.id },
        });
        await tx.zlecenia_Produkcyjne.update({ where: { id: zlecenieBazy.id }, data: { status: "Zrealizowane", rzeczywista_ilosc_wyrobu: iloscBazy } });

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

          // Zużycie bazy (Polprodukt) z partii z Etapu 1
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

          // Zużycie pozostałych surowców
          for (const s of wyrob.surowce || []) {
            if (!s.id_partii || !(parseFloat(s.ilosc) > 0)) continue;
            const ilosc = parseFloat(s.ilosc);
            const partia = await tx.partie_Magazynowe.findUnique({
              where: { id: s.id_partii },
              include: { ruchy_magazynowe: { where: { czy_aktywne: true } } },
            });
            if (!partia) throw new Error(`Partia ${s.id_partii} nie istnieje`);
            const stanPartii = partia.ruchy_magazynowe.reduce((sum: number, r: any) => sum + r.ilosc, 0);
            if (stanPartii < ilosc - 0.001) throw new Error(`Niewystarczający stan partii ${partia.numer_partii}`);
            const cenaDoc = await tx.ruchy_Magazynowe.findFirst({
              where: { id_partii: s.id_partii, ilosc: { gt: 0 }, czy_aktywne: true },
              orderBy: { utworzono_dnia: "asc" },
            });
            kosztWyrobu += ilosc * (cenaDoc?.cena_jednostkowa ?? 0);
            await tx.ruchy_Magazynowe.create({
              data: { id_partii: s.id_partii, id_zlecenia: zlecenieWyrobu.id, typ_ruchu: "Zuzycie", ilosc: -ilosc, cena_jednostkowa: cenaDoc?.cena_jednostkowa ?? 0, referencja_dokumentu: rwNr, id_uzytkownika: user.id },
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

        return { sesja: { id: sesja.id, numer_sesji }, baza: { numer_zp: numer_zp_bazy, pw: pwBazyNr, ilosc: iloscBazy }, wyroby: zleceniaWyrobow };
      }, { timeout: 30000 });

      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Błąd sesji produkcyjnej" });
    }
  });

  app.post("/api/produkcja/:id/realizuj", async (req, res) => {
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
              skladniki: true,
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
          for (const p of zuzyte_partie) {
            // Walidacja partii: status i dostępny stan
            const partia = await tx.partie_Magazynowe.findUnique({
              where: { id: p.id_partii },
              include: { ruchy_magazynowe: { where: { czy_aktywne: true } } }
            });
            if (!partia) throw new Error(`Partia ${p.id_partii} nie istnieje`);
            if (partia.status_partii !== "Dostepna") throw new Error(`Partia ${partia.numer_partii} nie jest dostępna (status: ${partia.status_partii})`);
            const stanPartii = partia.ruchy_magazynowe.reduce((sum, r) => sum + r.ilosc, 0);
            const pobieranaIlosc = Math.abs(p.ilosc);
            if (stanPartii < pobieranaIlosc - 0.001) throw new Error(`Niewystarczający stan partii ${partia.numer_partii}: dostępne ${stanPartii.toFixed(3).replace('.', ',')}, żądane ${pobieranaIlosc.toFixed(3).replace('.', ',')}`);

            // Pobranie ceny jednostkowej zarejestrowanej partii (z momentu przyjęcia - PZ lub PW)
            const docWejscia = await tx.ruchy_Magazynowe.findFirst({
              where: {
                id_partii: p.id_partii,
                typ_ruchu: { in: ["PZ", "Przyjecie_Z_Produkcji"] },
                ilosc: { gt: 0 }
              },
              orderBy: { utworzono_dnia: 'asc' }
            });
            const cenaKosztowaPartii = docWejscia?.cena_jednostkowa || 0;
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
              include: { ruchy_magazynowe: true },
              orderBy: { termin_waznosci: "asc" },
            });

            let pozostaloDoPobrania = iloscWymagana;
            for (const partia of dostepnePartie) {
              if (pozostaloDoPobrania <= 0) break;
              const stanPartii = partia.ruchy_magazynowe.reduce((sum, r) => sum + r.ilosc, 0);
              if (stanPartii <= 0) continue;

              const iloscDoPobrania = Math.min(stanPartii, pozostaloDoPobrania);
              
              const docWejscia = await tx.ruchy_Magazynowe.findFirst({
                where: { 
                  id_partii: partia.id, 
                  typ_ruchu: { in: ["PZ", "Przyjecie_Z_Produkcji"] }, 
                  ilosc: { gt: 0 } 
                },
                orderBy: { utworzono_dnia: 'asc' }
              });
              const cenaKosztowaPartii = docWejscia?.cena_jednostkowa || 0;
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



  // --- REZERWACJE (rozpoczęcie zlecenia) ---
  app.post("/api/produkcja/:id/rozpocznij", async (req, res) => {
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

  app.put("/api/produkcja/:id", async (req, res) => {
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

  app.delete("/api/produkcja/:id", async (req, res) => {
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


  // --- PARTIE wg asortymentu (wielokrotnego użytku) ---
  app.get("/api/partie/:id_asortymentu", async (req, res) => {
    try {
      const partie = await prisma.partie_Magazynowe.findMany({
        where: { id_asortymentu: req.params.id_asortymentu, status_partii: "Dostepna", czy_aktywne: true },
        include: {
          ruchy_magazynowe: { where: { czy_aktywne: true } },
          rezerwacje: { where: { czy_aktywne: true, status: "Aktywna" } },
        },
        orderBy: [{ termin_waznosci: "asc" }, { utworzono_dnia: "asc" }],
      });
      const result = partie.map(p => ({
        id: p.id,
        numer_partii: p.numer_partii,
        termin_waznosci: p.termin_waznosci,
        stan: p.ruchy_magazynowe.reduce((s: number, r: any) => s + r.ilosc, 0)
             - p.rezerwacje.reduce((s: number, r: any) => s + r.ilosc_zarezerwowana, 0),
      })).filter(p => p.stan > 0.001);
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- TRACEABILITY (Genealogia) ---
  app.get("/api/trace/partia/:numer_partii/genealogia", async (req, res) => {
    try {
      const { numer_partii } = req.params;
      const partia = await prisma.partie_Magazynowe.findUnique({
        where: { numer_partii },
        include: { asortyment: true }
      });
      if (!partia) return res.status(404).json({ error: "Nie znaleziono partii" });

      // 1. BACKWARD (Z czego powstała?)
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

      // 2. FORWARD (Gdzie została zużyta?)
      const zuzycia = await prisma.ruchy_Magazynowe.findMany({
        where: { id_partii: partia.id, typ_ruchu: "Zuzycie", czy_aktywne: true },
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

      // 3. WZ — wydania zewnętrzne powiązane z tą partią
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
      res.status(500).json({ error: error.message || "Błąd traceingu" });
    }
  });

  app.post("/api/magazyn/partia/:id/status", async (req, res) => {
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


  // --- DASHBOARD ---
  app.get("/api/dashboard", async (req, res) => {
    try {
      const now = new Date();
      const za7Dni = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const [zleceniaPlanowane, zleceniaWToku, zleceniaZrealizowane, partieAll] = await Promise.all([
        prisma.zlecenia_Produkcyjne.count({ where: { status: "Planowane", czy_aktywne: true } }),
        prisma.zlecenia_Produkcyjne.count({ where: { status: "W_toku", czy_aktywne: true } }),
        prisma.zlecenia_Produkcyjne.count({ where: { status: "Zrealizowane", czy_aktywne: true } }),
        prisma.partie_Magazynowe.findMany({
          where: { czy_aktywne: true },
          include: { asortyment: true, ruchy_magazynowe: { where: { czy_aktywne: true } } }
        })
      ]);

      const partieZeStanem = partieAll.map(p => ({
        ...p,
        stan: p.ruchy_magazynowe.reduce((s, r) => s + r.ilosc, 0)
      })).filter(p => p.stan > 0);

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


  // --- ASORTYMENT SZCZEGÓŁY (zintegrowane Kartoteki+Magazyn) ---
  app.get("/api/asortyment/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const asortyment = await prisma.asortyment.findUnique({
        where: { id },
      });
      if (!asortyment) return res.status(404).json({ error: "Nie znaleziono" });

      const partie = await prisma.partie_Magazynowe.findMany({
        where: { id_asortymentu: id, czy_aktywne: true },
        include: {
          ruchy_magazynowe: { where: { czy_aktywne: true }, orderBy: { utworzono_dnia: 'asc' } },
          rezerwacje: { where: { status: "Aktywna", czy_aktywne: true } }
        },
        orderBy: { utworzono_dnia: 'asc' }
      });

      // Zbierz wszystkie id_asortymentu z opakowania_json by pobrać nazwy jednym zapytaniem
      const allOpIds = new Set<string>();
      partie.forEach(p => {
        if (p.opakowania_json) {
          try { (JSON.parse(p.opakowania_json) as { id_asortymentu: string }[]).forEach(o => allOpIds.add(o.id_asortymentu)); } catch {}
        }
      });
      const opAsortyment = allOpIds.size > 0
        ? await prisma.asortyment.findMany({ where: { id: { in: [...allOpIds] } }, select: { id: true, nazwa: true } })
        : [];
      const opNazwyMap = Object.fromEntries(opAsortyment.map(a => [a.id, a.nazwa]));

      // ZASOBY (per partia)
      const zasoby = partie.map(p => {
        const stan = p.ruchy_magazynowe.reduce((s, r) => s + r.ilosc, 0);
        const zarezerwowane = p.rezerwacje.reduce((s, r) => s + r.ilosc_zarezerwowana, 0);

        // Cena z pierwszego przyjęcia (PZ) lub PW
        const pzDoc = p.ruchy_magazynowe.find(r => (r.typ_ruchu === "PZ" || r.typ_ruchu === "Przyjecie_Z_Produkcji") && r.ilosc > 0);
        const cena_jednostkowa = pzDoc?.cena_jednostkowa || 0;
        const dokument_przyjecia = pzDoc?.referencja_dokumentu || null;

        let opakowania = null;
        if (p.opakowania_json) {
          try {
            opakowania = (JSON.parse(p.opakowania_json) as { id_asortymentu: string; nazwa: string; waga_kg: number }[])
              .map(o => ({ id_asortymentu: o.id_asortymentu, nazwa: opNazwyMap[o.id_asortymentu] || o.nazwa, waga_kg: o.waga_kg }));
          } catch {}
        }

        return {
          id_partii: p.id,
          numer_partii: p.numer_partii,
          stan,
          zarezerwowane,
          dostepne: stan - zarezerwowane,
          cena_jednostkowa,
          wartosc: stan * cena_jednostkowa,
          data_produkcji: p.data_produkcji,
          termin_waznosci: p.termin_waznosci,
          status_partii: p.status_partii,
          dokument_przyjecia,
          opakowania,
        };
      }).filter(z => z.stan > 0.001 || z.zarezerwowane > 0);

      const globalneRezerwacje = await prisma.rezerwacje_Magazynowe.findMany({
        where: { id_asortymentu: id, id_partii: null, czy_aktywne: true, status: "Aktywna" }
      });

      // PODSUMOWANIE
      const totalStan = zasoby.reduce((s, z) => s + z.stan, 0);
      const batchZarezerwowane = zasoby.reduce((s, z) => s + z.zarezerwowane, 0);
      const sumGlobalneRezerwacje = globalneRezerwacje.reduce((s, r) => s + r.ilosc_zarezerwowana, 0);
      const totalZarezerwowane = batchZarezerwowane + sumGlobalneRezerwacje;

      const totalWartosc = zasoby.reduce((s, z) => s + z.wartosc, 0);
      const cenaSredniaWazona = totalStan > 0.001 ? (totalWartosc / totalStan) : 0;

      // HISTORIA RUCHÓW (timeline)
      let saldo = 0;
      const allRuchy = partie.flatMap(p => p.ruchy_magazynowe.map(r => {
        const typDok = r.typ_ruchu === "Zuzycie" ? "RW" : r.typ_ruchu === "Przyjecie_Z_Produkcji" ? "PW" : r.typ_ruchu;
        return {
          id: r.id,
          data: r.utworzono_dnia,
          typ: typDok,
          referencja: r.referencja_dokumentu || "—",
          partia: p.numer_partii,
          ilosc: r.ilosc,
          cena_jednostkowa: r.cena_jednostkowa,
          id_uzytkownika: r.id_uzytkownika
        };
      })).sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

      // Odtworzenie salda po operacji
      const historia = allRuchy.map(r => {
        saldo += r.ilosc;
        return { ...r, saldo_po_operacji: saldo };
      }).reverse(); // Od najnowszych

      res.json({
        ogolne: asortyment,
        podsumowanie: {
          stan_calkowity: totalStan,
          zarezerwowane: totalZarezerwowane,
          dostepne: totalStan - totalZarezerwowane,
          cena_srednia_wazona: cenaSredniaWazona,
          wartosc_magazynowa: totalWartosc
        },
        zasoby,
        historia
      });
    } catch (error: any) {
      console.error("Błąd API asortyment/:id:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- ETYKIETA (QR + dane) ---
  app.get("/api/etykieta/:numer_partii", async (req, res) => {
    try {
      const partia = await prisma.partie_Magazynowe.findUnique({
        where: { numer_partii: req.params.numer_partii },
        include: { asortyment: true }
      });
      if (!partia) return res.status(404).json({ error: "Nie znaleziono partii" });

      const qrDataUrl = await QRCode.toDataURL(partia.numer_partii, {
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
      });

      res.json({
        numer_partii: partia.numer_partii,
        nazwa_produktu: partia.asortyment.nazwa,
        kod_towaru: partia.asortyment.kod_towaru,
        data_produkcji: partia.data_produkcji,
        termin_waznosci: partia.termin_waznosci,
        jednostka: partia.asortyment.jednostka_miary,
        qr_code: qrDataUrl
      });
    } catch (error) {
      res.status(500).json({ error: "Błąd generowania etykiety" });
    }
  });

  // --- ETYKIETY ZBIORCZE dla dokumentu ---
  app.get("/api/etykiety-dokumentu/:referencja", async (req, res) => {
    try {
      const referencja = decodeURIComponent(req.params.referencja);
      const ruchy = await prisma.ruchy_Magazynowe.findMany({
        where: { referencja_dokumentu: referencja, czy_aktywne: true },
        include: { partia: { include: { asortyment: true } } },
        orderBy: { utworzono_dnia: 'asc' }
      });
      const etykiety = ruchy.map((r, i) => ({
        lp: i + 1,
        kod_towaru: r.partia.asortyment.kod_towaru,
        nazwa: r.partia.asortyment.nazwa,
        numer_partii: r.partia.numer_partii,
        ilosc: Math.abs(r.ilosc),
        jednostka: r.partia.asortyment.jednostka_miary,
        data_produkcji: r.partia.data_produkcji,
        termin_waznosci: r.partia.termin_waznosci,
      }));
      res.json(etykiety);
    } catch (error) {
      res.status(500).json({ error: "Błąd generowania etykiet" });
    }
  });

  // --- RAPORTY ---
  app.get("/api/raporty/sprzedaz-per-kontrahent", async (req, res) => {
    try {
      const { od, do: doData } = req.query as { od?: string; do?: string };

      const whereHeader: any = { typ: "WZ", status: "Zatwierdzony" };
      if (od || doData) {
        whereHeader.data_zatwierdzenia = {};
        if (od) whereHeader.data_zatwierdzenia.gte = new Date(od);
        if (doData) {
          const doDate = new Date(doData);
          doDate.setHours(23, 59, 59, 999);
          whereHeader.data_zatwierdzenia.lte = doDate;
        }
      }

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
        const pozycje = docRuchy.map((r) => ({
          kod_towaru: r.partia.asortyment.kod_towaru,
          nazwa: r.partia.asortyment.nazwa,
          jednostka: r.partia.asortyment.jednostka_miary,
          ilosc: Math.abs(r.ilosc),
          cena_jednostkowa: r.cena_jednostkowa ?? 0,
          wartosc: (r.cena_jednostkowa ?? 0) * Math.abs(r.ilosc),
        }));
        const wartoscDok = pozycje.reduce((s, p) => s + p.wartosc, 0);
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
      const suma_total = wynik.reduce((s, k) => s + k.wartosc_total, 0);
      res.json({ kontrahenci: wynik, suma_total, liczba_dokumentow: headers.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Błąd generowania raportu" });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // MODUŁ GELATO
  // ═══════════════════════════════════════════════════════════

  async function generateSesjaGelato(tx: any): Promise<string> {
    const date = new Date();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    const suffix = `/${month}/${year}`;
    const existing = await tx.sesje_Produkcji_Gelato.findMany({ where: { numer_sesji: { endsWith: suffix } } });
    let maxNum = 0;
    for (const s of existing) {
      const m = s.numer_sesji.match(/^SPG-(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
    }
    return `SPG-${(maxNum + 1).toString().padStart(3, '0')}${suffix}`;
  }

  async function generateOwaNumber(tx: any): Promise<string> {
    const date = new Date();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    const suffix = `/${month}/${year}`;
    const existing = await tx.opakowania_Wyrobowe.findMany({ where: { numer_serii: { endsWith: suffix } } });
    let maxNum = 0;
    for (const o of existing) {
      const m = o.numer_serii.match(/^OW-(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
    }
    return `OW-${(maxNum + 1).toString().padStart(4, '0')}${suffix}`;
  }

  // --- Typy opakowań ---
  app.get("/api/gelato/typy-opakowan", async (req, res) => {
    try {
      const typy = await prisma.typy_Opakowan.findMany({ where: { czy_aktywne: true }, orderBy: { nazwa: "asc" } });
      res.json(typy);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/gelato/typy-opakowan", async (req, res) => {
    try {
      const { nazwa, pojemnosc_min_kg, pojemnosc_max_kg } = req.body;
      if (!nazwa?.trim()) return res.status(400).json({ error: "Nazwa wymagana" });
      const typ = await prisma.typy_Opakowan.create({
        data: { nazwa: nazwa.trim(), pojemnosc_min_kg: parseFloat(pojemnosc_min_kg) || 0, pojemnosc_max_kg: parseFloat(pojemnosc_max_kg) || 10 }
      });
      res.json(typ);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/gelato/typy-opakowan/:id", async (req, res) => {
    try {
      await prisma.typy_Opakowan.update({ where: { id: req.params.id }, data: { czy_aktywne: false } });
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // --- Partie dostępne dla danego asortymentu (do wyboru bazy/surowców) ---
  app.get("/api/gelato/partie/:id_asortymentu", async (req, res) => {
    try {
      const partie = await prisma.partie_Magazynowe.findMany({
        where: { id_asortymentu: req.params.id_asortymentu, status_partii: "Dostepna", czy_aktywne: true },
        include: { ruchy_magazynowe: { where: { czy_aktywne: true }, select: { ilosc: true } } },
        orderBy: { termin_waznosci: "asc" },
      });
      const result = partie
        .map(p => ({ id: p.id, numer_partii: p.numer_partii, termin_waznosci: p.termin_waznosci, stan: p.ruchy_magazynowe.reduce((s, r) => s + r.ilosc, 0) }))
        .filter(p => p.stan > 0.001);
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- Sesje produkcyjne ---
  app.get("/api/gelato/sesje", async (req, res) => {
    try {
      const sesje = await prisma.sesje_Produkcji_Gelato.findMany({
        where: { czy_aktywne: true },
        include: { _count: { select: { pozycje: true, opakowania: true } } },
        orderBy: { data_sesji: "desc" },
      });
      res.json(sesje);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/gelato/sesje", async (req, res) => {
    try {
      const { data_sesji, notatki } = req.body;
      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");
      const sesja = await prisma.$transaction(async (tx) => {
        const numer_sesji = await generateSesjaGelato(tx);
        return tx.sesje_Produkcji_Gelato.create({
          data: { numer_sesji, data_sesji: data_sesji ? new Date(data_sesji) : new Date(), notatki: notatki || null, id_uzytkownika: user.id },
        });
      });
      res.json(sesja);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/gelato/sesje/:id", async (req, res) => {
    try {
      const sesja = await prisma.sesje_Produkcji_Gelato.findUnique({
        where: { id: req.params.id },
        include: {
          pozycje: {
            where: { czy_aktywne: true },
            include: {
              receptura: { include: { asortyment_docelowy: true, skladniki: { where: { czy_aktywne: true }, include: { asortyment_skladnika: true } } } },
              partia_bazy: true,
            },
            orderBy: { utworzono_dnia: "asc" },
          },
          opakowania: {
            where: { czy_aktywne: true },
            include: { asortyment: true, typ_opakowania: true },
            orderBy: { numer_serii: "asc" },
          },
        },
      });
      if (!sesja) return res.status(404).json({ error: "Nie znaleziono sesji" });
      res.json(sesja);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Dodaj smak (pozycję) do sesji
  app.post("/api/gelato/sesje/:id/pozycje", async (req, res) => {
    try {
      const sesja = await prisma.sesje_Produkcji_Gelato.findUnique({ where: { id: req.params.id } });
      if (!sesja) return res.status(404).json({ error: "Brak sesji" });
      if (sesja.status !== "Otwarta") return res.status(400).json({ error: "Sesja jest zamknięta" });
      const { id_receptury, id_partii_bazy, ilosc_bazy_kg, liczba_wsadow, surowce_json } = req.body;
      if (!id_receptury) return res.status(400).json({ error: "id_receptury wymagane" });
      const pozycja = await prisma.pozycje_Sesji_Gelato.create({
        data: {
          id_sesji: req.params.id,
          id_receptury,
          id_partii_bazy: id_partii_bazy || null,
          ilosc_bazy_kg: ilosc_bazy_kg ? parseFloat(ilosc_bazy_kg) : null,
          liczba_wsadow: parseInt(liczba_wsadow) || 1,
          surowce_json: surowce_json ? JSON.stringify(surowce_json) : null,
        },
        include: { receptura: { include: { asortyment_docelowy: true } }, partia_bazy: true },
      });
      res.json(pozycja);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.put("/api/gelato/sesje/:id/pozycje/:pid", async (req, res) => {
    try {
      const sesja = await prisma.sesje_Produkcji_Gelato.findUnique({ where: { id: req.params.id } });
      if (sesja?.status !== "Otwarta") return res.status(400).json({ error: "Sesja jest zamknięta" });
      const { id_partii_bazy, ilosc_bazy_kg, liczba_wsadow, surowce_json, uwagi } = req.body;
      const updated = await prisma.pozycje_Sesji_Gelato.update({
        where: { id: req.params.pid },
        data: {
          id_partii_bazy: id_partii_bazy || null,
          ilosc_bazy_kg: ilosc_bazy_kg ? parseFloat(ilosc_bazy_kg) : null,
          liczba_wsadow: parseInt(liczba_wsadow) || 1,
          surowce_json: surowce_json ? JSON.stringify(surowce_json) : null,
          uwagi: uwagi || null,
        },
        include: { receptura: { include: { asortyment_docelowy: true } }, partia_bazy: true },
      });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/gelato/sesje/:id/pozycje/:pid", async (req, res) => {
    try {
      const sesja = await prisma.sesje_Produkcji_Gelato.findUnique({ where: { id: req.params.id } });
      if (sesja?.status !== "Otwarta") return res.status(400).json({ error: "Sesja jest zamknięta" });
      await prisma.pozycje_Sesji_Gelato.update({ where: { id: req.params.pid }, data: { czy_aktywne: false } });
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Dodaj opakowanie (sztukę) do sesji
  app.post("/api/gelato/sesje/:id/opakowania", async (req, res) => {
    try {
      const sesja = await prisma.sesje_Produkcji_Gelato.findUnique({ where: { id: req.params.id } });
      if (!sesja) return res.status(404).json({ error: "Brak sesji" });
      if (sesja.status !== "Otwarta") return res.status(400).json({ error: "Sesja jest zamknięta" });
      const { id_asortymentu, id_typu_opakowania, id_pozycji_sesji, id_partii_bazy, waga_kg, termin_waznosci } = req.body;
      if (!id_asortymentu || !id_typu_opakowania || !waga_kg) {
        return res.status(400).json({ error: "id_asortymentu, id_typu_opakowania i waga_kg są wymagane" });
      }
      const opakowanie = await prisma.$transaction(async (tx) => {
        const numer_serii = await generateOwaNumber(tx);
        return tx.opakowania_Wyrobowe.create({
          data: {
            numer_serii,
            id_sesji: req.params.id,
            id_asortymentu,
            id_typu_opakowania,
            id_pozycji_sesji: id_pozycji_sesji || null,
            id_partii_bazy: id_partii_bazy || null,
            waga_kg: parseFloat(waga_kg),
            data_produkcji: sesja.data_sesji,
            termin_waznosci: termin_waznosci ? new Date(termin_waznosci) : null,
          },
          include: { asortyment: true, typ_opakowania: true },
        });
      });
      res.json(opakowanie);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/gelato/sesje/:id/opakowania/:oid", async (req, res) => {
    try {
      const sesja = await prisma.sesje_Produkcji_Gelato.findUnique({ where: { id: req.params.id } });
      if (sesja?.status !== "Otwarta") return res.status(400).json({ error: "Sesja jest zamknięta" });
      const op = await prisma.opakowania_Wyrobowe.findUnique({ where: { id: req.params.oid } });
      if (op?.status !== "Dostepne") return res.status(400).json({ error: "Opakowanie jest już wydane" });
      await prisma.opakowania_Wyrobowe.update({ where: { id: req.params.oid }, data: { czy_aktywne: false } });
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Zamknięcie sesji — rejestruje rozchody bazy i surowców
  app.put("/api/gelato/sesje/:id/zamknij", async (req, res) => {
    try {
      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");
      const sesja = await prisma.sesje_Produkcji_Gelato.findUnique({
        where: { id: req.params.id },
        include: { pozycje: { where: { czy_aktywne: true } } },
      });
      if (!sesja) return res.status(404).json({ error: "Nie znaleziono sesji" });
      if (sesja.status !== "Otwarta") return res.status(400).json({ error: "Sesja jest już zamknięta" });

      await prisma.$transaction(async (tx) => {
        const rwNumber = await generateDocNumber(tx, "RW");

        for (const poz of sesja.pozycje) {
          // Rozchód bazy
          if (poz.id_partii_bazy && poz.ilosc_bazy_kg && poz.ilosc_bazy_kg > 0) {
            const stanAgg = await tx.ruchy_Magazynowe.aggregate({
              where: { id_partii: poz.id_partii_bazy, czy_aktywne: true },
              _sum: { ilosc: true },
            });
            const stan = stanAgg._sum.ilosc ?? 0;
            if (stan < poz.ilosc_bazy_kg) {
              const partia = await tx.partie_Magazynowe.findUnique({ where: { id: poz.id_partii_bazy } });
              throw new Error(`Niewystarczający stan bazy (${partia?.numer_partii}): jest ${stan.toFixed(2)} kg, potrzeba ${poz.ilosc_bazy_kg} kg`);
            }
            const docBazy = await tx.ruchy_Magazynowe.findFirst({
              where: { id_partii: poz.id_partii_bazy, ilosc: { gt: 0 }, czy_aktywne: true },
              orderBy: { utworzono_dnia: "asc" },
            });
            await tx.ruchy_Magazynowe.create({
              data: {
                id_partii: poz.id_partii_bazy,
                typ_ruchu: "Zuzycie",
                ilosc: -poz.ilosc_bazy_kg,
                cena_jednostkowa: docBazy?.cena_jednostkowa ?? 0,
                referencja_dokumentu: rwNumber,
                id_uzytkownika: user.id,
              },
            });
          }

          // Rozchód dodatkowych surowców z surowce_json
          if (poz.surowce_json) {
            let surowce: Array<{ id_partii: string; ilosc: number }> = [];
            try { surowce = JSON.parse(poz.surowce_json); } catch { /* ignore */ }
            for (const s of surowce) {
              if (!s.id_partii || !(s.ilosc > 0)) continue;
              const docS = await tx.ruchy_Magazynowe.findFirst({
                where: { id_partii: s.id_partii, ilosc: { gt: 0 }, czy_aktywne: true },
                orderBy: { utworzono_dnia: "asc" },
              });
              await tx.ruchy_Magazynowe.create({
                data: {
                  id_partii: s.id_partii,
                  typ_ruchu: "Zuzycie",
                  ilosc: -s.ilosc,
                  cena_jednostkowa: docS?.cena_jednostkowa ?? 0,
                  referencja_dokumentu: rwNumber,
                  id_uzytkownika: user.id,
                },
              });
            }
          }
        }

        await tx.sesje_Produkcji_Gelato.update({ where: { id: req.params.id }, data: { status: "Zamknieta" } });
      });

      const updated = await prisma.sesje_Produkcji_Gelato.findUnique({ where: { id: req.params.id } });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // --- Stan magazynu wyrobów gotowych (opakowania) ---
  app.get("/api/gelato/stan", async (req, res) => {
    try {
      const opakowania = await prisma.opakowania_Wyrobowe.findMany({
        where: { status: "Dostepne", czy_aktywne: true },
        include: { asortyment: true, typ_opakowania: true },
        orderBy: [{ id_asortymentu: "asc" }, { numer_serii: "asc" }],
      });
      const grouped: Record<string, { id_asortymentu: string; nazwa: string; kod_towaru: string; typy: Record<string, any> }> = {};
      for (const op of opakowania) {
        if (!grouped[op.id_asortymentu]) {
          grouped[op.id_asortymentu] = { id_asortymentu: op.id_asortymentu, nazwa: op.asortyment.nazwa, kod_towaru: op.asortyment.kod_towaru, typy: {} };
        }
        const g = grouped[op.id_asortymentu];
        if (!g.typy[op.id_typu_opakowania]) {
          g.typy[op.id_typu_opakowania] = { id_typu: op.id_typu_opakowania, nazwa_typu: op.typ_opakowania.nazwa, opakowania: [], ilosc_szt: 0, waga_total_kg: 0 };
        }
        const t = g.typy[op.id_typu_opakowania];
        t.opakowania.push({ id: op.id, numer_serii: op.numer_serii, waga_kg: op.waga_kg, data_produkcji: op.data_produkcji, termin_waznosci: op.termin_waznosci });
        t.ilosc_szt++;
        t.waga_total_kg = Math.round((t.waga_total_kg + op.waga_kg) * 1000) / 1000;
      }
      const result = Object.values(grouped).map(g => ({
        ...g,
        typy: Object.values(g.typy),
        ilosc_szt_total: Object.values(g.typy).reduce((s: number, t: any) => s + t.ilosc_szt, 0),
        waga_total_kg: Math.round(Object.values(g.typy).reduce((s: number, t: any) => s + t.waga_total_kg, 0) * 1000) / 1000,
      })).sort((a, b) => a.nazwa.localeCompare(b.nazwa));
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Lista dostępnych opakowań do wyboru w WZ
  app.get("/api/gelato/opakowania", async (req, res) => {
    try {
      const opakowania = await prisma.opakowania_Wyrobowe.findMany({
        where: { status: "Dostepne", czy_aktywne: true },
        include: { asortyment: true, typ_opakowania: true },
        orderBy: [{ id_asortymentu: "asc" }, { data_produkcji: "asc" }],
      });
      res.json(opakowania);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- WZ Gelato ---
  app.get("/api/gelato/wz", async (req, res) => {
    try {
      const docs = await prisma.dokumenty_Magazynowe.findMany({
        where: { typ: "WZ", czy_aktywne: true, opakowania_wz: { some: {} } },
        include: { kontrahent: true, opakowania_wz: { include: { asortyment: true, typ_opakowania: true } } },
        orderBy: { utworzono_dnia: "desc" },
      });
      res.json(docs);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/gelato/wz/:id", async (req, res) => {
    try {
      const doc = await prisma.dokumenty_Magazynowe.findUnique({
        where: { id: req.params.id },
        include: {
          kontrahent: true,
          uzytkownik_utworzenia: true,
          uzytkownik_zatwierdzenia: true,
          opakowania_wz: { include: { asortyment: true, typ_opakowania: true } },
        },
      });
      if (!doc) return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      res.json(doc);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Tworzenie WZ gelato — w stanie Bufor
  app.post("/api/gelato/wz", async (req, res) => {
    try {
      const { id_kontrahenta, ids_opakowan } = req.body;
      if (!Array.isArray(ids_opakowan) || ids_opakowan.length === 0) {
        return res.status(400).json({ error: "Brak wybranych opakowań" });
      }
      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const result = await prisma.$transaction(async (tx) => {
        const opakowania = await tx.opakowania_Wyrobowe.findMany({ where: { id: { in: ids_opakowan }, czy_aktywne: true } });
        if (opakowania.length !== ids_opakowan.length) throw new Error("Niektóre opakowania nie istnieją");
        const niedostepne = opakowania.filter(o => o.status !== "Dostepne");
        if (niedostepne.length > 0) throw new Error(`Opakowania ${niedostepne.map(o => o.numer_serii).join(", ")} nie są dostępne`);

        const referencja = await generateDocNumber(tx, "WZ");
        const doc = await tx.dokumenty_Magazynowe.create({
          data: { referencja, typ: "WZ", status: "Bufor", id_uzytkownika_utworzenia: user.id, id_kontrahenta: id_kontrahenta || null },
        });
        await tx.opakowania_Wyrobowe.updateMany({ where: { id: { in: ids_opakowan } }, data: { id_dokumentu_wz: doc.id } });
        return doc;
      });
      res.json(result);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Zatwierdzenie WZ gelato
  app.put("/api/gelato/wz/:id/zatwierdz", async (req, res) => {
    try {
      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika");
      const doc = await prisma.dokumenty_Magazynowe.findUnique({ where: { id: req.params.id } });
      if (!doc) return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      if (doc.status !== "Bufor") return res.status(400).json({ error: "Dokument nie jest w stanie Bufor" });
      await prisma.$transaction(async (tx) => {
        await tx.dokumenty_Magazynowe.update({
          where: { id: req.params.id },
          data: { status: "Zatwierdzony", id_uzytkownika_zatwierdzenia: user.id, data_zatwierdzenia: new Date() },
        });
        await tx.opakowania_Wyrobowe.updateMany({ where: { id_dokumentu_wz: req.params.id }, data: { status: "Wydane" } });
      });
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Kompletna produkcja gelato — jeden request tworzy sesję, rejestruje rozchody i opakowania
  app.post("/api/gelato/produkcja-kompletna", async (req, res) => {
    try {
      const { data_sesji, notatki, id_receptury_bazy, ilosc_bazy_kg, surowce_bazy, pozycje, opakowania } = req.body;
      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const result = await prisma.$transaction(async (tx) => {
        const numer_sesji = await generateSesjaGelato(tx);
        const rwNumber = await generateDocNumber(tx, "RW");
        const pwNumber = await generateDocNumber(tx, "PW");

        const dataSesji = data_sesji ? new Date(data_sesji) : new Date();

        const sesja = await tx.sesje_Produkcji_Gelato.create({
          data: {
            numer_sesji,
            data_sesji: dataSesji,
            notatki: notatki || null,
            id_uzytkownika: user.id,
            status: "Zamknieta",
          },
        });

        // Rozchód składników bazy (RW)
        for (const s of surowce_bazy || []) {
          if (!s.id_partii || !(parseFloat(s.ilosc) > 0)) continue;
          const ilosc = parseFloat(s.ilosc);
          const cenaDoc = await tx.ruchy_Magazynowe.findFirst({
            where: { id_partii: s.id_partii, ilosc: { gt: 0 }, czy_aktywne: true },
            orderBy: { utworzono_dnia: "asc" },
          });
          await tx.ruchy_Magazynowe.create({
            data: { id_partii: s.id_partii, typ_ruchu: "Zuzycie", ilosc: -ilosc, cena_jednostkowa: cenaDoc?.cena_jednostkowa ?? 0, referencja_dokumentu: rwNumber, id_uzytkownika: user.id },
          });
        }

        // PW — przyjęcie bazy do magazynu (Przyjecie_Z_Produkcji)
        let partiaBazyId: string | null = null;
        if (id_receptury_bazy && ilosc_bazy_kg && parseFloat(ilosc_bazy_kg) > 0) {
          const recepturaBazy = await tx.receptury.findUnique({
            where: { id: id_receptury_bazy },
            include: { asortyment_docelowy: true },
          });
          if (recepturaBazy) {
            const dniBazy = recepturaBazy.dni_trwalosci ?? null;
            const terminWaznosci = dniBazy ? new Date(dataSesji.getTime() + dniBazy * 86400000) : null;
            const numerPartii = `${numer_sesji}/BAZA`;

            const partiaBazy = await tx.partie_Magazynowe.create({
              data: {
                id_asortymentu: recepturaBazy.id_asortymentu_docelowego,
                numer_partii: numerPartii,
                data_produkcji: dataSesji,
                termin_waznosci: terminWaznosci,
                status_partii: "Dostepna",
              },
            });
            partiaBazyId = partiaBazy.id;

            await tx.ruchy_Magazynowe.create({
              data: {
                id_partii: partiaBazy.id,
                typ_ruchu: "Przyjecie_Z_Produkcji",
                ilosc: parseFloat(ilosc_bazy_kg),
                referencja_dokumentu: pwNumber,
                id_uzytkownika: user.id,
              },
            });
          }
        }

        // Pozycje (smaki) + rozchód bazy per smak + rozchód surowców smakowych
        const pozycjeDb: { idx: number; id: string }[] = [];
        for (const poz of pozycje || []) {
          const nowaPos = await tx.pozycje_Sesji_Gelato.create({
            data: {
              id_sesji: sesja.id,
              id_receptury: poz.id_receptury,
              id_partii_bazy: partiaBazyId,
              liczba_wsadow: parseInt(poz.liczba_wsadow) || 1,
              ilosc_bazy_kg: poz.ilosc_bazy_kg ? parseFloat(poz.ilosc_bazy_kg) : null,
            },
          });
          pozycjeDb.push({ idx: poz._idx ?? pozycjeDb.length, id: nowaPos.id });

          // Rozchód bazy dla tego smaku
          if (partiaBazyId && poz.ilosc_bazy_kg && parseFloat(poz.ilosc_bazy_kg) > 0) {
            await tx.ruchy_Magazynowe.create({
              data: { id_partii: partiaBazyId, typ_ruchu: "Zuzycie", ilosc: -parseFloat(poz.ilosc_bazy_kg), referencja_dokumentu: rwNumber, id_uzytkownika: user.id },
            });
          }

          // Rozchód pozostałych surowców smakowych
          for (const s of poz.surowce || []) {
            if (!s.id_partii || !(parseFloat(s.ilosc) > 0)) continue;
            const ilosc = parseFloat(s.ilosc);
            const cenaDoc = await tx.ruchy_Magazynowe.findFirst({
              where: { id_partii: s.id_partii, ilosc: { gt: 0 }, czy_aktywne: true },
              orderBy: { utworzono_dnia: "asc" },
            });
            await tx.ruchy_Magazynowe.create({
              data: { id_partii: s.id_partii, typ_ruchu: "Zuzycie", ilosc: -ilosc, cena_jednostkowa: cenaDoc?.cena_jednostkowa ?? 0, referencja_dokumentu: rwNumber, id_uzytkownika: user.id },
            });
          }
        }

        // Opakowania
        const opakowaniaCt = [];
        for (const op of opakowania || []) {
          if (!op.id_asortymentu || !op.id_typu_opakowania || !(parseFloat(op.waga_kg) > 0)) continue;
          const numer_serii = await generateOwaNumber(tx);
          const pozId = op._pozIdx != null ? pozycjeDb.find(p => p.idx === op._pozIdx)?.id ?? null : null;
          const o = await tx.opakowania_Wyrobowe.create({
            data: {
              numer_serii,
              id_sesji: sesja.id,
              id_pozycji_sesji: pozId,
              id_asortymentu: op.id_asortymentu,
              id_typu_opakowania: op.id_typu_opakowania,
              id_partii_bazy: partiaBazyId,
              waga_kg: parseFloat(op.waga_kg),
              data_produkcji: dataSesji,
              termin_waznosci: op.termin_waznosci ? new Date(op.termin_waznosci) : null,
            },
          });
          opakowaniaCt.push(o);
        }

        return { sesja, opakowania: opakowaniaCt, rwNumber, pwNumber, partiaBazyNumer: partiaBazyId ? `${numer_sesji}/BAZA` : null };
      });

      res.json(result);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Anulowanie WZ gelato
  app.put("/api/gelato/wz/:id/anuluj", async (req, res) => {
    try {
      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika");
      const doc = await prisma.dokumenty_Magazynowe.findUnique({ where: { id: req.params.id } });
      if (!doc) return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      if (doc.status === "Zatwierdzony") return res.status(400).json({ error: "Zatwierdzony dokument nie może być anulowany" });
      await prisma.$transaction(async (tx) => {
        await tx.dokumenty_Magazynowe.update({
          where: { id: req.params.id },
          data: { status: "Anulowany", id_uzytkownika_anulowania: user.id, data_anulowania: new Date() },
        });
        await tx.opakowania_Wyrobowe.updateMany({ where: { id_dokumentu_wz: req.params.id }, data: { id_dokumentu_wz: null } });
      });
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
