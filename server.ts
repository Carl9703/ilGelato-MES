import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createServer as createViteServer } from "vite";
import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "async_hooks";
import path from "path";
import QRCode from "qrcode";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "ilgelato-dev-secret-2025-change-in-prod";
const JWT_EXPIRES = "12h";

const prismaProdukcja = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || "file:./prod.db" } },
});
const prismaTest = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST || "file:./test.db" } },
});
const dbStorage = new AsyncLocalStorage<PrismaClient>();
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const db = dbStorage.getStore() ?? prismaProdukcja;
    const val = (db as any)[prop];
    return typeof val === "function" ? val.bind(db) : val;
  },
});

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

async function seedDefaultGroups() {
  try {
    const existing = await (prisma as any).grupy_Towarowe.count();
    if (existing > 0) return;
    const gelato = await (prisma as any).grupy_Towarowe.create({
      data: { kod: "GEL", nazwa: "Gelato", kolejnosc: 1 }
    });
    await (prisma as any).grupy_Towarowe.createMany({
      data: [
        { kod: "GEL-ML",  nazwa: "Smaki mleczne", id_grupy_nadrzednej: gelato.id, kolejnosc: 1 },
        { kod: "GEL-SOR", nazwa: "Sorbety",        id_grupy_nadrzednej: gelato.id, kolejnosc: 2 },
        { kod: "GEL-WEG", nazwa: "Wege",            id_grupy_nadrzednej: gelato.id, kolejnosc: 3 },
        { kod: "GEL-CRE", nazwa: "Cremino",         id_grupy_nadrzednej: gelato.id, kolejnosc: 4 },
        { kod: "OPK",     nazwa: "Opakowania",      kolejnosc: 2 },
        { kod: "SUR",     nazwa: "Surowce",         kolejnosc: 3 },
      ]
    });
    console.log("Grupy towarowe: zainicjalizowane domyślne wartości.");
  } catch (e) {
    console.warn("Błąd inicjalizacji grup towarowych:", e);
  }
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
  await seedDefaultGroups();

  const app = express();
  const PORT = parseInt(process.env.PORT || "3001", 10);

  app.use(helmet({ contentSecurityPolicy: false })); // CSP wyłączone bo Vite dev serwuje inline scripts
  app.use(express.json({ limit: '10mb' }));

  // --- AUTH MIDDLEWARE ---
  const PUBLIC_PATHS = ["/auth/login", "/health", "/setup", "/init", "/reset"];

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const auth = req.headers["authorization"];
    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Wymagane logowanie" });
    }
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { userId: string; login: string; baza: "prod" | "test" };
      (req as any).userId = payload.userId;
      (req as any).userLogin = payload.login;
      (req as any).baza = payload.baza;
      const db = payload.baza === "test" ? prismaTest : prismaProdukcja;
      dbStorage.run(db, next);
    } catch {
      res.status(401).json({ error: "Sesja wygasła — zaloguj się ponownie" });
    }
  }

  app.use("/api", (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (PUBLIC_PATHS.includes(req.path)) return next();
    requireAuth(req, res, next);
  });

  // --- API ROUTES ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- AUTH ENDPOINTS ---
  app.post("/api/auth/login", async (req, res) => {
    const { login, haslo, baza } = req.body;
    if (!login || !haslo) {
      return res.status(400).json({ error: "Podaj login i hasło" });
    }
    const selectedBaza: "prod" | "test" = baza === "test" ? "test" : "prod";
    const db = selectedBaza === "test" ? prismaTest : prismaProdukcja;
    try {
      const user = await db.uzytkownicy.findUnique({ where: { login } });
      if (!user || !user.czy_aktywne) {
        return res.status(401).json({ error: "Nieprawidłowy login lub hasło" });
      }
      let valid = false;
      if (user.haslo.startsWith("$2b$") || user.haslo.startsWith("$2a$")) {
        valid = await bcrypt.compare(haslo, user.haslo);
      } else {
        // Migracja: hasło plaintekstowe → hash przy pierwszym logowaniu
        valid = user.haslo === haslo;
        if (valid) {
          const hashed = await bcrypt.hash(haslo, 10);
          await db.uzytkownicy.update({ where: { id: user.id }, data: { haslo: hashed } });
        }
      }
      if (!valid) {
        return res.status(401).json({ error: "Nieprawidłowy login lub hasło" });
      }
      const token = jwt.sign({ userId: user.id, login: user.login, baza: selectedBaza }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
      res.json({ token, login: user.login, baza: selectedBaza });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    res.json({ userId: (req as any).userId, login: (req as any).userLogin });
  });

  app.post("/api/auth/change-password", async (req, res) => {
    const { stare_haslo, nowe_haslo } = req.body;
    if (!stare_haslo || !nowe_haslo) {
      return res.status(400).json({ error: "Podaj stare i nowe hasło" });
    }
    if (nowe_haslo.length < 4) {
      return res.status(400).json({ error: "Nowe hasło musi mieć co najmniej 4 znaki" });
    }
    try {
      const user = await prisma.uzytkownicy.findUnique({ where: { id: (req as any).userId } });
      if (!user) return res.status(404).json({ error: "Użytkownik nie znaleziony" });
      let valid = false;
      if (user.haslo.startsWith("$2b$") || user.haslo.startsWith("$2a$")) {
        valid = await bcrypt.compare(stare_haslo, user.haslo);
      } else {
        valid = user.haslo === stare_haslo;
      }
      if (!valid) return res.status(401).json({ error: "Stare hasło jest nieprawidłowe" });
      const hashed = await bcrypt.hash(nowe_haslo, 10);
      await prisma.uzytkownicy.update({ where: { id: user.id }, data: { haslo: hashed } });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
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
    // Prosta ochrona: wymagany nagłówek z tokenem środowiskowym
    const resetToken = process.env.RESET_SECRET;
    if (!resetToken) {
      return res.status(503).json({ error: "Endpoint niedostępny — ustaw zmienną środowiskową RESET_SECRET." });
    }
    const authHeader = req.headers["x-reset-token"];
    if (authHeader !== resetToken) {
      return res.status(403).json({ error: "Brak autoryzacji. Wymagany nagłówek X-Reset-Token." });
    }
    try {
      await prisma.$transaction(async (tx) => {
        // Najpierw tabele zależne (FK), potem bazowe
        await (tx as any).sesja_Robocza_Log?.deleteMany();
        await (tx as any).sesja_Robocza?.deleteMany();
        await (tx as any).pozycje_Sesji_Gelato?.deleteMany();
        await (tx as any).sesje_Produkcji_Gelato?.deleteMany();
        await (tx as any).sesje_Produkcji?.deleteMany();
        await (tx as any).opakowania_Wyrobowe?.deleteMany();
        await (tx as any).wartosci_Odzywcze?.deleteMany();
        await (tx as any).alergeny_Asortymentu?.deleteMany();
        await tx.rezerwacje_Magazynowe.deleteMany();
        await tx.ruchy_Magazynowe.deleteMany();
        await tx.skladniki_Receptury.deleteMany();
        await tx.zlecenia_Produkcyjne.deleteMany();
        await tx.receptury.deleteMany();
        await tx.partie_Magazynowe.deleteMany();
        await (tx as any).dokumenty_Magazynowe?.deleteMany();
        await (tx as any).kontrahenci?.deleteMany();
        await tx.asortyment.deleteMany();
        await tx.uzytkownicy.deleteMany();
      });
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

  // --- GRUPY TOWAROWE ---
  app.get("/api/grupy-towarowe", async (req, res) => {
    try {
      const grupy = await (prisma as any).grupy_Towarowe.findMany({
        where: { czy_aktywne: true },
        include: { podgrupy: { where: { czy_aktywne: true }, orderBy: { kolejnosc: "asc" } } },
        orderBy: { kolejnosc: "asc" }
      });
      res.json(grupy.filter((g: any) => !g.id_grupy_nadrzednej));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/grupy-towarowe", async (req, res) => {
    try {
      const { kod, nazwa, id_grupy_nadrzednej, kolejnosc } = req.body;
      if (!kod?.trim() || !nazwa?.trim()) return res.status(400).json({ error: "Kod i nazwa są wymagane" });
      const grp = await (prisma as any).grupy_Towarowe.create({
        data: { kod: kod.trim().toUpperCase(), nazwa: nazwa.trim(), id_grupy_nadrzednej: id_grupy_nadrzednej || null, kolejnosc: kolejnosc || 0 }
      });
      res.json(grp);
    } catch (e: any) {
      if (e.code === "P2002") return res.status(400).json({ error: "Grupa z tym kodem już istnieje" });
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/grupy-towarowe/:id", async (req, res) => {
    try {
      const { kod, nazwa, kolejnosc, id_grupy_nadrzednej } = req.body;
      if (!kod?.trim() || !nazwa?.trim()) return res.status(400).json({ error: "Kod i nazwa są wymagane" });
      const grp = await (prisma as any).grupy_Towarowe.update({
        where: { id: req.params.id },
        data: { kod: kod.trim().toUpperCase(), nazwa: nazwa.trim(), kolejnosc: kolejnosc ?? 0, id_grupy_nadrzednej: id_grupy_nadrzednej || null }
      });
      res.json(grp);
    } catch (e: any) {
      if (e.code === "P2002") return res.status(400).json({ error: "Grupa z tym kodem już istnieje" });
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/grupy-towarowe/:id", async (req, res) => {
    try {
      // Sprawdź czy ma podgrupy lub asortyment
      const podgrupy = await (prisma as any).grupy_Towarowe.count({
        where: { id_grupy_nadrzednej: req.params.id, czy_aktywne: true }
      });
      if (podgrupy > 0) return res.status(409).json({ error: `Nie można usunąć grupy – ma ${podgrupy} aktywnych podgrup. Usuń je najpierw.` });
      const asortyment = await prisma.asortyment.count({ where: { id_grupy: req.params.id, czy_aktywne: true } });
      if (asortyment > 0) return res.status(409).json({ error: `Nie można usunąć grupy – jest przypisana do ${asortyment} pozycji asortymentu.` });
      await (prisma as any).grupy_Towarowe.update({ where: { id: req.params.id }, data: { czy_aktywne: false } });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
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

  // ─── Import masowy z Excel ─────────────────────────────────────────────────
  app.post("/api/asortyment/import-bulk", async (req, res) => {
    try {
      const { rows } = req.body as { rows: Array<{
        kod_towaru: string; nazwa: string; typ_asortymentu: string;
        jednostka_miary: string; jednostka_pomocnicza?: string | null;
        przelicznik_jednostki?: string | null;
        czy_wymaga_daty_waznosci?: boolean; czy_zasob_nieograniczony?: boolean;
        producent?: string | null; zrodlo_danych?: string | null;
      }> };

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "Brak danych do importu" });
      }

      const results = await Promise.all(rows.map(async (row) => {
        try {
          const parsedPrzelicznik = row.przelicznik_jednostki
            ? parseFloat(String(row.przelicznik_jednostki).replace(",", "."))
            : null;

          await prisma.asortyment.create({
            data: {
              kod_towaru:               row.kod_towaru,
              nazwa:                    row.nazwa,
              typ_asortymentu:          row.typ_asortymentu,
              jednostka_miary:          row.jednostka_miary,
              jednostka_pomocnicza:     row.jednostka_pomocnicza   || null,
              przelicznik_jednostki:    (parsedPrzelicznik && !isNaN(parsedPrzelicznik)) ? parsedPrzelicznik : null,
              czy_wymaga_daty_waznosci: Boolean(row.czy_wymaga_daty_waznosci),
              czy_zasob_nieograniczony: Boolean(row.czy_zasob_nieograniczony),
              producent:                row.producent    || null,
              zrodlo_danych:            row.zrodlo_danych || null,
            },
          });
          return { kod_towaru: row.kod_towaru, success: true };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          const friendly = msg.includes("Unique constraint")
            ? "Kod towaru już istnieje w bazie"
            : msg;
          return { kod_towaru: row.kod_towaru, success: false, error: friendly };
        }
      }));

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Błąd importu asortymentu" });
    }
  });

  app.post("/api/asortyment", async (req, res) => {
    try {
      const { kod_towaru, nazwa, typ_asortymentu, jednostka_miary, jednostka_pomocnicza, przelicznik_jednostki, czy_wymaga_daty_waznosci, czy_zasob_nieograniczony, id_grupy } = req.body;

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
          czy_zasob_nieograniczony: Boolean(czy_zasob_nieograniczony),
          id_grupy: id_grupy || null,
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
      const { kod_towaru, nazwa, typ_asortymentu, jednostka_miary, jednostka_pomocnicza, przelicznik_jednostki, czy_wymaga_daty_waznosci, czy_zasob_nieograniczony, id_grupy } = req.body;

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
          czy_zasob_nieograniczony: Boolean(czy_zasob_nieograniczony),
          id_grupy: id_grupy || null,
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

  // --- CENY (zakupu / sprzedaży) ---
  app.get("/api/asortyment/:id/ceny", async (req, res) => {
    try {
      const data = await prisma.asortyment.findUnique({
        where: { id: req.params.id },
        select: { cena_sprzedazy: true, stawka_vat: true, cena_zakupu: true },
      });
      res.json(data || {});
    } catch {
      res.status(500).json({ error: "Błąd pobierania cen" });
    }
  });

  app.put("/api/asortyment/:id/ceny", async (req, res) => {
    try {
      const { id } = req.params;
      const cena = req.body.cena_sprzedazy !== undefined && req.body.cena_sprzedazy !== ""
        ? parseFloat(req.body.cena_sprzedazy) : null;
      const vat = req.body.stawka_vat !== undefined && req.body.stawka_vat !== ""
        ? parseFloat(req.body.stawka_vat) : null;
      const cenaZakupu = req.body.cena_zakupu !== undefined && req.body.cena_zakupu !== ""
        ? parseFloat(req.body.cena_zakupu) : null;
      const result = await prisma.asortyment.update({
        where: { id },
        data: { cena_sprzedazy: cena, stawka_vat: vat, cena_zakupu: cenaZakupu },
      });
      res.json({ cena_sprzedazy: result.cena_sprzedazy, stawka_vat: result.stawka_vat, cena_zakupu: result.cena_zakupu });
    } catch {
      res.status(500).json({ error: "Błąd zapisu cen" });
    }
  });

  // --- DOKUMENTY ---
  app.get("/api/dokumenty", async (req, res) => {
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

        await tx.dokumenty_Magazynowe.update({
          where: { referencja: ref },
          data: {
            status: "Zatwierdzony",
            id_uzytkownika_zatwierdzenia: user.id,
            data_zatwierdzenia: new Date()
          }
        });

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
                  const matched = opMap.find(o => o.nazwa === nazwaNominalna && Math.abs(o.waga_kg - wagaNominalna) < 0.01);
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

      // Pobierz wszystkie zatwierdzone WZ z informacją o opakowaniach
      const docsWZ = await prisma.dokumenty_Magazynowe.findMany({
        where: { typ: "WZ", status: "Zatwierdzony", pozycje_json: { not: null } }
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

  // --- MAGAZYN: WZ ---
  app.post("/api/magazyn/wz", async (req, res) => {
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

  // --- MAGAZYN: RW (standalone) ---
  app.post("/api/magazyn/rw", async (req, res) => {
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
            asortyment: r.partia.asortyment.nazwa,
            wyrob: null,
            kod_towaru: r.partia.asortyment.kod_towaru,
            numer_partii: r.partia.numer_partii,
            ilosc,
            jednostka: r.partia.asortyment.jednostka_miary,
            ilosc_kg: null,
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

  // --- KOSZTY SESJI PRODUKCYJNEJ ---
  app.get("/api/produkcja/sesje/:id/koszty", async (req, res) => {
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

  // --- SESJA ROBOCZA (draft wizarda) — obsługa wielu szkiców ---
  // GET /api/produkcja/sesja-robocza — lista wszystkich szkiców (bez dane_json, tylko metadane)
  app.get("/api/produkcja/sesja-robocza", async (_req, res) => {
    try {
      const rows = await (prisma as any).sesja_Robocza.findMany({
        orderBy: { zaktualizowano_dnia: "desc" },
        select: { id: true, krok: true, nazwa: true, zaktualizowano_dnia: true, dane_json: true },
      });
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/produkcja/sesja-robocza/:id — pobierz konkretny szkic (z danymi)
  app.get("/api/produkcja/sesja-robocza/:id", async (req, res) => {
    try {
      const row = await (prisma as any).sesja_Robocza.findUnique({ where: { id: req.params.id } });
      if (!row) return res.status(404).json({ error: "Nie znaleziono szkicu" });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/produkcja/sesja-robocza — utwórz nowy szkic
  app.post("/api/produkcja/sesja-robocza", async (req, res) => {
    try {
      const { krok, dane_json, nazwa, zdarzenie = "auto" } = req.body;
      const row = await (prisma as any).sesja_Robocza.create({ data: { krok, dane_json, nazwa: nazwa ?? null } });
      await (prisma as any).sesja_Robocza_Log.create({
        data: { id_sesji_roboczej: row.id, krok, zdarzenie, dane_json },
      });
      res.json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PUT /api/produkcja/sesja-robocza/:id — aktualizuj konkretny szkic
  app.put("/api/produkcja/sesja-robocza/:id", async (req, res) => {
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

  // Backwards-compat: PUT /api/produkcja/sesja-robocza (stary endpoint — aktualizuje pierwszą lub tworzy)
  app.put("/api/produkcja/sesja-robocza", async (req, res) => {
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

  // DELETE /api/produkcja/sesja-robocza/:id — usuń konkretny szkic
  app.delete("/api/produkcja/sesja-robocza/:id", async (req, res) => {
    try {
      await (prisma as any).sesja_Robocza_Log.deleteMany({ where: { id_sesji_roboczej: req.params.id } });
      await (prisma as any).sesja_Robocza.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/produkcja/sesja-robocza — usuń wszystkie (stary endpoint)
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
      const isSorbety = !id_receptury_bazy;
      if (!isSorbety && !(parseFloat(ilosc_bazy) > 0)) throw new Error("Podaj recepturę i ilość bazy");
      if (!wyroby || wyroby.length === 0) throw new Error("Dodaj co najmniej jeden wyrób gotowy");

      const user = await prisma.uzytkownicy.findFirst();
      if (!user) throw new Error("Brak użytkownika w systemie");

      const result = await prisma.$transaction(async (tx) => {
        const numer_sesji = await generateSesjaNumber(tx);
        const sesja = await tx.sesje_Produkcji.create({ data: { numer_sesji } });

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

      // Pobierz zatwierdzone WZ dla tych partii — by odjąć już wydane opakowania
      const partieIds = partie.map(p => p.id);
      const issuedByBatch = new Map<string, { nazwa: string; waga_kg: number; count: number }[]>();
      if (partieIds.length > 0) {
        const wzDocs = await prisma.dokumenty_Magazynowe.findMany({
          where: { typ: "WZ", status: "Zatwierdzony", pozycje_json: { not: null } },
          select: { pozycje_json: true },
        });
        for (const doc of wzDocs) {
          try {
            const pozycje = JSON.parse(doc.pozycje_json!) as { id_partii: string; sztuki?: Record<string, number> }[];
            for (const poz of pozycje) {
              if (!partieIds.includes(poz.id_partii) || !poz.sztuki) continue;
              if (!issuedByBatch.has(poz.id_partii)) issuedByBatch.set(poz.id_partii, []);
              for (const [label, count] of Object.entries(poz.sztuki) as [string, number][]) {
                const match = label.match(/^(.*)\s+\((\d+(?:\.\d+)?)\s*kg\)$/);
                if (match) issuedByBatch.get(poz.id_partii)!.push({ nazwa: match[1], waga_kg: parseFloat(match[2]), count });
              }
            }
          } catch {}
        }
      }

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
            let currentOps = (JSON.parse(p.opakowania_json) as { id_asortymentu: string; nazwa: string; waga_kg: number }[])
              .map(o => ({ id_asortymentu: o.id_asortymentu, nazwa: opNazwyMap[o.id_asortymentu] || o.nazwa, waga_kg: o.waga_kg }));
            // Odejmij wydane opakowania z zatwierdzonych WZ
            const issuedList = issuedByBatch.get(p.id) || [];
            for (const issued of issuedList) {
              let toRemove = issued.count;
              for (let i = 0; i < currentOps.length && toRemove > 0; i++) {
                const op = currentOps[i];
                if (Math.abs(op.waga_kg - issued.waga_kg) < 0.01 && (op.nazwa === issued.nazwa || !issued.nazwa)) {
                  currentOps.splice(i, 1);
                  i--;
                  toRemove--;
                }
              }
            }
            opakowania = currentOps.length > 0 ? currentOps : null;
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
        const typDok = (r.typ_ruchu === "Zuzycie" || r.typ_ruchu === "Strata") ? "RW" : r.typ_ruchu === "Przyjecie_Z_Produkcji" ? "PW" : r.typ_ruchu;
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

  // ─────────────────────────────────────────────────────────────────────────
  // CYRKULACJA OPAKOWAŃ ZWROTNYCH
  // ─────────────────────────────────────────────────────────────────────────

  // Pobierz kartoteki asortymentowe typu 'Opakowanie'
  app.get("/api/opakowania-asortyment", async (req, res) => {
    try {
      const opakowania = await prisma.asortyment.findMany({
        where: { typ_asortymentu: "Opakowanie", czy_aktywne: true },
        orderBy: { nazwa: "asc" }
      });
      res.json(opakowania);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Oznacz kartotekę asortymentową jako zwrotną / niezwrotną
  app.put("/api/asortyment/:id/zwrotne", async (req, res) => {
    try {
      const { czy_zwrotne } = req.body;
      const item = await prisma.asortyment.update({
        where: { id: req.params.id },
        data: { czy_zwrotne: Boolean(czy_zwrotne) }
      });
      res.json(item);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Stan aktualny opakowań zwrotnych (oparty na kartotekach Asortyment)
  app.get("/api/opakowania-zwrotne/stan", async (req, res) => {
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

  // Historia ruchów (oparta na kartotekach Asortyment)
  app.get("/api/opakowania-zwrotne/historia", async (req, res) => {
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

  // Rejestruj ruch opakowania zwrotnego
  app.post("/api/opakowania-zwrotne/ruch", async (req, res) => {
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

  // Usuń ruch (korekta) — tylko ostatni ruch można cofnąć
  app.delete("/api/opakowania-zwrotne/ruch/:id", async (req, res) => {
    try {
      await prisma.ruchy_Opakowan_Zwrotnych.delete({
        where: { id: req.params.id }
      });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Zmiana typu opakowania dla partii wyrobu gotowego
  app.patch("/api/partie/:id/zmien-opakowanie", async (req, res) => {
    try {
      const { id_asortymentu_stare, waga_kg_stare, id_asortymentu_nowe, waga_kg_nowe, ilosc_szt } = req.body as {
        id_asortymentu_stare: string;
        waga_kg_stare: number;
        id_asortymentu_nowe: string;
        waga_kg_nowe: number;
        ilosc_szt: number;
      };

      if (!id_asortymentu_stare || !id_asortymentu_nowe || !waga_kg_nowe || !ilosc_szt)
        return res.status(400).json({ error: "Brakujące parametry" });

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

      if (zmieniono === 0) return res.status(400).json({ error: "Nie znaleziono pasujących opakowań do zmiany" });

      await prisma.partie_Magazynowe.update({
        where: { id: req.params.id },
        data: { opakowania_json: JSON.stringify(opList) },
      });

      res.json({ success: true, zmieniono });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
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
