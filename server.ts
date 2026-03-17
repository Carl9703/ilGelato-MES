import express from "express";
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

  const ruchy = await tx.ruchy_Magazynowe.findMany({
    where: {
      czy_aktywne: true,
      referencja_dokumentu: {
        endsWith: suffix
      }
    }
  });

  let maxNum = 0;
  for (const r of ruchy) {
    if (r.referencja_dokumentu && r.referencja_dokumentu.startsWith(`${prefix}-`)) {
      const match = r.referencja_dokumentu.match(new RegExp(`^${prefix}-(\\d+)/${month}/${year}$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }
  return `${prefix}-${maxNum + 1}${suffix}`;
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
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API ROUTES ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/reset", async (req, res) => {
    try {
      await prisma.$transaction([
        prisma.wyniki_Kontroli.deleteMany(),
        prisma.punkty_Kontrolne.deleteMany(),
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

  // Ensure a dummy user exists for foreign keys
  app.post("/api/init", async (req, res) => {
    try {
      let user = await prisma.uzytkownicy.findFirst();
      if (!user) {
        user = await prisma.uzytkownicy.create({
          data: {
            login: "admin",
            haslo: "admin", // Dummy password
          },
        });
      }

      // Sprawdzenie czy baza jest pusta (brak asortymentu)
      const count = await prisma.asortyment.count();
      if (count === 0) {
        console.log("Inicjalizacja danych testowych...");

        // 1. Asortyment (Surowce, Półprodukty, Wyroby Gotowe)
        const mleko = await prisma.asortyment.create({ data: { kod_towaru: "SUR-MLE-01", nazwa: "Mleko 3.2%", typ_asortymentu: "Surowiec", jednostka_miary: "L", czy_wymaga_daty_waznosci: true } });
        const smietanka = await prisma.asortyment.create({ data: { kod_towaru: "SUR-SMI-36", nazwa: "Śmietanka 36%", typ_asortymentu: "Surowiec", jednostka_miary: "L", czy_wymaga_daty_waznosci: true } });
        const cukier = await prisma.asortyment.create({ data: { kod_towaru: "SUR-CUK-01", nazwa: "Cukier biały", typ_asortymentu: "Surowiec", jednostka_miary: "kg", czy_wymaga_daty_waznosci: false } });
        const pastaPistacjowa = await prisma.asortyment.create({ data: { kod_towaru: "SUR-PIST-01", nazwa: "Pasta pistacjowa 100%", typ_asortymentu: "Surowiec", jednostka_miary: "kg", czy_wymaga_daty_waznosci: true } });
        const bazaMleczna = await prisma.asortyment.create({ data: { kod_towaru: "POL-BAZA-01", nazwa: "Baza mleczna jasna", typ_asortymentu: "Polprodukt", jednostka_miary: "L", czy_wymaga_daty_waznosci: true } });
        const lodyPistacjowe = await prisma.asortyment.create({ data: { kod_towaru: "WG-PIST-5L", nazwa: "Lody Pistacjowe (Kuweta 5L)", typ_asortymentu: "Wyrob_Gotowy", jednostka_miary: "szt", czy_wymaga_daty_waznosci: true } });

        // 2. Dokumenty Magazynowe - Przyjęcia (PZ) wg logiki Grupowej (kilka surowców z różnymi cenami)
        // Utworzymy jeden PZ na nabiał, drugi na cukier i pastę

        const dataDzis = new Date();
        const refPZ1 = `PZ-1/${(dataDzis.getMonth() + 1).toString().padStart(2, '0')}/${dataDzis.getFullYear().toString().slice(-2)}`;

        // PZ 1: Mleko i śmietanka
        const partiaMleko = await prisma.partie_Magazynowe.create({ data: { id_asortymentu: mleko.id, numer_partii: "DOST-MLE-001", status_partii: "Dostepna", termin_waznosci: new Date(dataDzis.getTime() + 14 * 24 * 60 * 60 * 1000) } });
        const partiaSmietanka = await prisma.partie_Magazynowe.create({ data: { id_asortymentu: smietanka.id, numer_partii: "DOST-SMI-001", status_partii: "Dostepna", termin_waznosci: new Date(dataDzis.getTime() + 7 * 24 * 60 * 60 * 1000) } });

        await prisma.ruchy_Magazynowe.createMany({
          data: [
            { id_partii: partiaMleko.id, typ_ruchu: "PZ", ilosc: 500, cena_jednostkowa: 3.20, referencja_dokumentu: refPZ1, id_uzytkownika: user.id },
            { id_partii: partiaSmietanka.id, typ_ruchu: "PZ", ilosc: 100, cena_jednostkowa: 14.50, referencja_dokumentu: refPZ1, id_uzytkownika: user.id }
          ]
        });

        const refPZ2 = `PZ-2/${(dataDzis.getMonth() + 1).toString().padStart(2, '0')}/${dataDzis.getFullYear().toString().slice(-2)}`;

        // PZ 2: Cukier i Pasta
        const partiaCukier = await prisma.partie_Magazynowe.create({ data: { id_asortymentu: cukier.id, numer_partii: "DOST-CUK-001", status_partii: "Dostepna" } });
        const partiaPasta = await prisma.partie_Magazynowe.create({ data: { id_asortymentu: pastaPistacjowa.id, numer_partii: "DOST-PIST-001", status_partii: "Dostepna", termin_waznosci: new Date(dataDzis.getTime() + 180 * 24 * 60 * 60 * 1000) } });

        await prisma.ruchy_Magazynowe.createMany({
          data: [
            { id_partii: partiaCukier.id, typ_ruchu: "PZ", ilosc: 200, cena_jednostkowa: 4.10, referencja_dokumentu: refPZ2, id_uzytkownika: user.id },
            { id_partii: partiaPasta.id, typ_ruchu: "PZ", ilosc: 20, cena_jednostkowa: 120.00, referencja_dokumentu: refPZ2, id_uzytkownika: user.id }
          ]
        });

        // 3. Receptury
        const recBaza = await prisma.receptury.create({
          data: {
            id_asortymentu_docelowego: bazaMleczna.id, numer_wersji: 1, dni_trwalosci: 14,
            skladniki: { create: [{ id_asortymentu_skladnika: mleko.id, ilosc_wymagana: 0.65, procent_strat: 2 }, { id_asortymentu_skladnika: smietanka.id, ilosc_wymagana: 0.20 }, { id_asortymentu_skladnika: cukier.id, ilosc_wymagana: 0.15 }] }
          }
        });

        const recLodyPistacjowe = await prisma.receptury.create({
          data: {
            id_asortymentu_docelowego: lodyPistacjowe.id, numer_wersji: 1, dni_trwalosci: 360,
            skladniki: { create: [{ id_asortymentu_skladnika: bazaMleczna.id, ilosc_wymagana: 4.5 }, { id_asortymentu_skladnika: pastaPistacjowa.id, ilosc_wymagana: 0.5 }] }
          }
        });

        console.log("Baza wyczyszczona i zainicjalizowana nowymi dokumentami grupowymi (PZ). Zapasy surowców dostępne. Brak zleceń.");
      }

      // Check for old Zlecenia numbering and update them
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

      res.json({ user, seeded: count === 0 });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to initialize dummy user and seed data" });
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
      const { typ: filterTyp, showAll } = req.query;
      const where: any = showAll === 'true' ? {} : { czy_aktywne: true };
      
      if (filterTyp && filterTyp !== "all") {
        if (filterTyp === "PZ") where.typ_ruchu = "PZ";
        else if (filterTyp === "WZ") where.typ_ruchu = "WZ";
        else if (filterTyp === "RW") where.typ_ruchu = "Zuzycie";
        else if (filterTyp === "PW") where.typ_ruchu = "Przyjecie_Z_Produkcji";
      }

      const ruchy = await prisma.ruchy_Magazynowe.findMany({
        where,
        include: {
          partia: { include: { asortyment: true } },
          zlecenie: true,
          uzytkownik: true
        },
        orderBy: { utworzono_dnia: 'desc' }
      });

      const dokumentyMap = new Map();

      ruchy.forEach(ruch => {
        const ref = ruch.referencja_dokumentu || ruch.id;
        if (!dokumentyMap.has(ref)) {
          let typ = ruch.typ_ruchu;
          if (typ === "Przyjecie_Z_Produkcji") typ = "PW";
          if (typ === "Zuzycie") typ = "RW";

          dokumentyMap.set(ref, {
            referencja: ref,
            typ: typ,
            anulowany: !ruch.czy_aktywne,
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

      // Zlecenia Produkcyjne (tylko gdy filtr to 'all' lub 'ZP' - chociaż w UI nie ma filtra ZP w dokumentach)
      if (!filterTyp || filterTyp === "all") {
        const zlecenia = await prisma.zlecenia_Produkcyjne.findMany({
          where: { czy_aktywne: true },
          include: { receptura: { include: { asortyment_docelowy: true } } },
          orderBy: { utworzono_dnia: 'desc' }
        });

        zlecenia.forEach(zl => {
          const ref = zl.numer_zlecenia || `ZP-${zl.id.substring(0,8)}`;
          dokumentyMap.set(ref, {
            referencja: ref,
            typ: "ZP",
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
        .sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Błąd pobierania dokumentów" });
    }
  });

  app.post("/api/dokumenty/:ref/anuluj", async (req, res) => {
    try {
      const ref = decodeURIComponent(req.params.ref);
      const updated = await prisma.ruchy_Magazynowe.updateMany({
        where: { referencja_dokumentu: ref, czy_aktywne: true },
        data: { czy_aktywne: false },
      });
      if (updated.count === 0) return res.status(404).json({ error: "Nie znaleziono aktywnych pozycji dokumentu" });
      res.json({ success: true, count: updated.count });
    } catch (error) {
      res.status(500).json({ error: "Błąd anulowania dokumentu" });
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
      const items = pozycje || []; // Obsługa obu nazw dla kompatybilności

      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const result = await prisma.$transaction(async (tx) => {
        let finalReferencja = referencja_zewnetrzna;
        if (!finalReferencja) {
          finalReferencja = await generateDocNumber(tx, "PZ");
        }

        const ruchy = [];
        for (const item of items) {
          const { id_asortymentu, numer_partii, ilosc, cena_jednostkowa, data_produkcji, termin_waznosci } = item;

          let partia = await tx.partie_Magazynowe.findUnique({
            where: { numer_partii },
          });

          if (!partia) {
            console.log(`Tworzenie nowej partii: ${numer_partii} dla asortymentu ID: [${id_asortymentu}]`);
            if (!id_asortymentu) {
              throw new Error(`Brak ID asortymentu dla nowej partii ${numer_partii}`);
            }
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

          const ruch = await tx.ruchy_Magazynowe.create({
            data: {
              id_partii: partia.id,
              typ_ruchu: "PZ",
              ilosc: parseFloat(ilosc),
              cena_jednostkowa: cena_jednostkowa ? parseFloat(cena_jednostkowa) : null,
              referencja_dokumentu: finalReferencja,
              id_uzytkownika: user.id,
            },
          });
          ruchy.push(ruch);
        }
        return ruchy;
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd rejestracji dokumentu PZ" });
    }
  });

  // --- MAGAZYN: WZ ---
  app.post("/api/magazyn/wz", async (req, res) => {
    try {
      const { items, referencja_zewnetrzna } = req.body;
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

        const ruchy = [];
        for (const item of items) {
          const { id_partii, ilosc } = item;
          const parsedIlosc = parseFloat(ilosc);
          if (!id_partii || isNaN(parsedIlosc) || parsedIlosc <= 0) {
            throw new Error("Nieprawidłowe dane pozycji WZ");
          }

          // Sprawdź dostępność
          const partia = await tx.partie_Magazynowe.findUnique({
            where: { id: id_partii },
            include: { ruchy_magazynowe: { where: { czy_aktywne: true } } },
          });
          if (!partia) throw new Error(`Partia ${id_partii} nie istnieje`);

          const dostepne = partia.ruchy_magazynowe.reduce((s, r) => s + r.ilosc, 0);
          if (dostepne < parsedIlosc) {
            throw new Error(`Niewystarczający stan partii ${partia.numer_partii}: dostępne ${dostepne.toFixed(3)}, żądane ${parsedIlosc.toFixed(3)}`);
          }

          const ruch = await tx.ruchy_Magazynowe.create({
            data: {
              id_partii,
              typ_ruchu: "WZ",
              ilosc: -parsedIlosc,
              referencja_dokumentu: finalReferencja,
              id_uzytkownika: user.id,
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
      const ruchy = await prisma.ruchy_Magazynowe.findMany({
        where: { referencja_dokumentu: referencja, czy_aktywne: true },
        include: {
          partia: { include: { asortyment: true } },
          zlecenie: true,
          uzytkownik: true
        },
        orderBy: { utworzono_dnia: 'desc' }
      });

      if (ruchy.length === 0) {
        return res.status(404).json({ error: "Nie znaleziono dokumentu" });
      }

      let wartosc_calkowita = 0;
      const pozycje = ruchy.map(r => {
        const ilosc = Math.abs(r.ilosc);
        const cena = r.cena_jednostkowa || 0;
        const wartosc = ilosc * cena;
        wartosc_calkowita += wartosc;
        return {
          id_asortymentu: r.partia.id_asortymentu,
          asortyment: r.partia.asortyment.nazwa,
          kod_towaru: r.partia.asortyment.kod_towaru,
          numer_partii: r.partia.numer_partii,
          ilosc,
          jednostka: r.partia.asortyment.jednostka_miary,
          cena_jednostkowa: r.cena_jednostkowa,
          data_produkcji: r.partia.data_produkcji,
          termin_waznosci: r.partia.termin_waznosci,
          wartosc
        };
      });

      res.json({
        referencja,
        typ: ruchy[0].typ_ruchu === "Zuzycie" ? "RW" : ruchy[0].typ_ruchu === "Przyjecie_Z_Produkcji" ? "PW" : ruchy[0].typ_ruchu,
        data: ruchy[0].utworzono_dnia,
        uzytkownik: ruchy[0].uzytkownik?.login || "system",
        numer_zlecenia: ruchy[0].zlecenie?.numer_zlecenia || null,
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
                ruchy_magazynowe: true
              },
              orderBy: [
                { termin_waznosci: 'asc' }, // FIFO: najpierw te, które się kończą
                { utworzono_dnia: 'asc' }
              ]
            });

            // Obliczamy realny stan każdej partii i wybieramy te, które pokryją zapotrzebowanie
            const sugestie = partie.map(p => {
              const stan = p.ruchy_magazynowe.reduce((sum, r) => sum + r.ilosc, 0);
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
      const { id_asortymentu_docelowego, numer_wersji, skladniki } = req.body;

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
      const { id_asortymentu_docelowego, numer_wersji, dni_trwalosci, skladniki } = req.body;

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
        if (z.status === "Zrealizowane" || z.status === "Anulowane") return z;

        const skladnikiWithBatches = await Promise.all(z.receptura.skladniki.map(async (s) => {
          const partie = await prisma.partie_Magazynowe.findMany({
            where: {
              id_asortymentu: s.id_asortymentu_skladnika,
              status_partii: "Dostepna"
            },
            include: { ruchy_magazynowe: true },
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
          })).filter(p => p.stan > 0);

          return { ...s, sugerowane_partie: sugestie };
        }));

        return {
          ...z,
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

  app.post("/api/produkcja/:id/realizuj", async (req, res) => {
    try {
      const { id } = req.params;
      const { rzeczywista_ilosc, zuzyte_partie } = req.body; // zuzyte_partie: { id_partii: string, ilosc: number }[]

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
            const pobieranaIlosc = Math.abs(p.ilosc);
            totalCost += pobieranaIlosc * cenaKosztowaPartii; // sumujemy koszt RW

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
            let iloscWymagana = skladnik.ilosc_wymagana * zlecenie.planowana_ilosc_wyrobu;

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
              throw new Error(`Brak wystarczającej ilości składnika [${nazwaSkladnika}] w magazynie. Brakuje: ${pozostaloDoPobrania.toFixed(3)} ${asort?.jednostka_miary || ""}`);
            }
          }
        }

        // 1.5. Walidacja QC — sprawdzenie czy wymagane punkty kontrolne zostały wypełnione
        const punktyKontrolne = await tx.punkty_Kontrolne.findMany({
          where: { id_receptury: zlecenie.id_receptury, czy_wymagany: true, czy_aktywne: true }
        });
        if (punktyKontrolne.length > 0) {
          const wynikiKontroli = await tx.wyniki_Kontroli.findMany({
            where: { id_zlecenia: zlecenie.id, czy_aktywne: true }
          });
          const wypelnionePunkty = new Set(wynikiKontroli.map(w => w.id_punktu_kontrolnego));
          const brakujace = punktyKontrolne.filter(p => !wypelnionePunkty.has(p.id));
          if (brakujace.length > 0) {
            throw new Error(`Brakuje wyników kontroli jakości: ${brakujace.map(p => p.nazwa_parametru).join(", ")}`);
          }
          const nieWNormie = wynikiKontroli.filter(w => !w.czy_w_normie);
          if (nieWNormie.length > 0) {
            throw new Error(`Wyniki kontroli poza normą! Sprawdź wyniki QC przed zamknięciem zlecenia.`);
          }
        }

        // 1.6. Zwolnienie rezerwacji
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
            rzeczywista_ilosc_wyrobu: rzeczywistaIloscNum
          },
        });

        return zaktualizowaneZlecenie;
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd realizacji zlecenia" });
    }
  });



  // --- KONTROLA JAKOŚCI (QC / HACCP) ---
  app.get("/api/punkty-kontrolne/:id_receptury", async (req, res) => {
    try {
      const { id_receptury } = req.params;
      const punkty = await prisma.punkty_Kontrolne.findMany({
        where: { id_receptury, czy_aktywne: true },
        orderBy: { kolejnosc: 'asc' }
      });
      res.json(punkty);
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania punktów kontrolnych" });
    }
  });

  app.post("/api/punkty-kontrolne", async (req, res) => {
    try {
      const { id_receptury, nazwa_parametru, jednostka, wartosc_min, wartosc_max, czy_wymagany, kolejnosc } = req.body;
      const punkt = await prisma.punkty_Kontrolne.create({
        data: {
          id_receptury,
          nazwa_parametru,
          jednostka,
          wartosc_min: wartosc_min != null ? parseFloat(wartosc_min) : null,
          wartosc_max: wartosc_max != null ? parseFloat(wartosc_max) : null,
          czy_wymagany: czy_wymagany !== false,
          kolejnosc: kolejnosc || 0
        }
      });
      res.json(punkt);
    } catch (error) {
      res.status(500).json({ error: "Błąd tworzenia punktu kontrolnego" });
    }
  });

  app.delete("/api/punkty-kontrolne/:id", async (req, res) => {
    try {
      await prisma.punkty_Kontrolne.update({ where: { id: req.params.id }, data: { czy_aktywne: false } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Błąd usuwania punktu kontrolnego" });
    }
  });

  app.post("/api/wyniki-kontroli", async (req, res) => {
    try {
      const { id_zlecenia, wyniki } = req.body;
      const created = [];
      for (const w of wyniki) {
        const punkt = await prisma.punkty_Kontrolne.findUnique({ where: { id: w.id_punktu_kontrolnego } });
        const val = parseFloat(w.wartosc_zmierzona);
        const wNormie = (punkt?.wartosc_min == null || val >= punkt.wartosc_min) && (punkt?.wartosc_max == null || val <= punkt.wartosc_max);
        const wynik = await prisma.wyniki_Kontroli.create({
          data: {
            id_zlecenia,
            id_punktu_kontrolnego: w.id_punktu_kontrolnego,
            wartosc_zmierzona: val,
            czy_w_normie: wNormie,
            uwagi: w.uwagi || null
          }
        });
        created.push(wynik);
      }
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Błąd zapisywania wyników kontroli" });
    }
  });

  app.get("/api/wyniki-kontroli/:id_zlecenia", async (req, res) => {
    try {
      const wyniki = await prisma.wyniki_Kontroli.findMany({
        where: { id_zlecenia: req.params.id_zlecenia, czy_aktywne: true },
        include: { punkt_kontrolny: true }
      });
      res.json(wyniki);
    } catch (error) {
      res.status(500).json({ error: "Błąd pobierania wyników kontroli" });
    }
  });

  // --- WZ (Wydanie Zewnętrzne) ---
  app.post("/api/magazyn/wz", async (req, res) => {
    try {
      const { items } = req.body;
      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const result = await prisma.$transaction(async (tx) => {
        const referencja = await generateDocNumber(tx, "WZ");
        const ruchy = [];
        for (const item of items) {
          const { id_partii, ilosc } = item;
          const partia = await tx.partie_Magazynowe.findUnique({
            where: { id: id_partii },
            include: { ruchy_magazynowe: { where: { czy_aktywne: true } } }
          });
          if (!partia) throw new Error("Nie znaleziono partii");
          const stan = partia.ruchy_magazynowe.reduce((s, r) => s + r.ilosc, 0);
          if (stan < parseFloat(ilosc)) throw new Error(`Niewystarczający stan partii ${partia.numer_partii}. Dostępne: ${stan.toFixed(3)}`);
          const ruch = await tx.ruchy_Magazynowe.create({
            data: { id_partii, typ_ruchu: "WZ", ilosc: -Math.abs(parseFloat(ilosc)), referencja_dokumentu: referencja, id_uzytkownika: user.id }
          });
          ruchy.push(ruch);
        }
        return { referencja, ruchy };
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd rejestracji WZ" });
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
            throw new Error(`Brak wystarczającej ilości: ${skladnik.asortyment_skladnika.nazwa}. Całkowita dostępna ilość: ${dostepne.toFixed(3)} ${skladnik.asortyment_skladnika.jednostka_miary}. Potrzeba: ${wymaganaIlosc.toFixed(3)}`);
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

        // Jeśli są rezerwacje (stan W_toku), usuwamy je
        await tx.rezerwacje_Magazynowe.deleteMany({
          where: { id_zlecenia: id }
        });

        // Soft delete zlecenia i zwolnienie numeru (przez dodanie suffixu)
        return tx.zlecenia_Produkcyjne.update({
          where: { id },
          data: { status: "Anulowane" }
        });
      });

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Błąd usuwania zlecenia" });
    }
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

      res.json({
        partia: {
          id: partia.id,
          numer_partii: partia.numer_partii,
          asortyment: partia.asortyment.nazwa,
          status: partia.status_partii
        },
        skladniki: genealogia_w_tyl,
        wyroby_pochodne: genealogia_w_przod
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Błąd traceingu" });
    }
  });

  app.post("/api/magazyn/partia/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
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
          typ: new Date(p.termin_waznosci!) < now ? "PRZETERMINOWANE" : "BLISKIE_WYGASNIECIA",
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

      // ZASOBY (per partia)
      const zasoby = partie.map(p => {
        const stan = p.ruchy_magazynowe.reduce((s, r) => s + r.ilosc, 0);
        const zarezerwowane = p.rezerwacje.reduce((s, r) => s + r.ilosc_zarezerwowana, 0);

        // Cena z pierwszego przyjęcia (PZ) lub PW
        const pzDoc = p.ruchy_magazynowe.find(r => (r.typ_ruchu === "PZ" || r.typ_ruchu === "Przyjecie_Z_Produkcji") && r.ilosc > 0);
        const cena_jednostkowa = pzDoc?.cena_jednostkowa || 0;
        const dokument_przyjecia = pzDoc?.referencja_dokumentu || null;

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

          dokument_przyjecia
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
      res.status(500).json({ error: error.message, stack: error.stack });
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
