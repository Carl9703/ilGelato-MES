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
import { generateDocumentHTML, generatePDF } from "./server-pdf";

import authRouter from "./server/routes/auth";
import asortymentRouter from "./server/routes/asortyment";
import { requireAuth } from "./server/middleware/auth";
import grupyTowaroweRouter from "./server/routes/grupyTowarowe";
import kontrahenciRouter from "./server/routes/kontrahenci";
import setupRouter from "./server/routes/setup";

import dokumentyRouter from "./server/routes/dokumenty";
import magazynRouter from "./server/routes/magazyn";
import recepturyRouter from "./server/routes/receptury";
import produkcjaRouter from "./server/routes/produkcja";
import etykietyRouter from "./server/routes/etykiety";
import raportyRouter from "./server/routes/raporty";
import opakowaniaRouter from "./server/routes/opakowania";

import { JWT_SECRET, JWT_EXPIRES } from "./server/config";

const prismaProdukcja = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || "file:./prod.db" } },
});
const prismaTest = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST || "file:./test.db" } },
});
export const dbStorage = new AsyncLocalStorage<PrismaClient>();

class AsyncMutex {
  private mutex = Promise.resolve();
  acquire() {
    let release: () => void = () => {};
    const next = new Promise<void>(resolve => { release = resolve; });
    const current = this.mutex;
    this.mutex = current.then(() => next);
    return current.then(() => release);
  }
}
const globalTransactionMutex = new AsyncMutex();
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
  const PUBLIC_PATHS = ["/auth/login", "/health", "/setup", "/reset"];

  app.use("/api", (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (PUBLIC_PATHS.includes(req.path)) return next();
    requireAuth(req, res, next);
  });

  // --- API ROUTES ---

// Register routes
app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

app.use("/api/auth", authRouter);
app.use("/api/asortyment", asortymentRouter);
app.use("/api/grupy-towarowe", grupyTowaroweRouter);
app.use("/api/kontrahenci", kontrahenciRouter);
app.use("/api", setupRouter);

app.use("/", dokumentyRouter);
app.use("/", magazynRouter);
app.use("/", recepturyRouter);
app.use("/", produkcjaRouter);
app.use("/", etykietyRouter);
app.use("/", raportyRouter);
app.use("/", opakowaniaRouter);

  

  // --- AUTH ENDPOINTS ---
  

  

  

  // Jednorazowy setup — tworzy admina tylko jeśli brak użytkowników w systemie
  

  

  // Tworzy użytkownika systemowego (wymagany jako FK dla ruchów magazynowych)
  // Dane demo ładuj przez: npx tsx prisma/seed.ts
  

  // --- KONTRAHENCI ---
  

  

  

  

  // --- GRUPY TOWAROWE ---
  

  

  

  

  // Oblicza ilości zarezerwowane przez dokumenty WZ w buforze per id_partii
  async function getBuforWzByPartia(partieIds?: string[]): Promise<Map<string, number>> {
    const buforRefs = (await prisma.dokumenty_Magazynowe.findMany({
      where: { status: "Bufor", typ: "WZ" },
      select: { referencja: true }
    })).map(d => d.referencja);
    if (buforRefs.length === 0) return new Map();
    const where: any = { referencja_dokumentu: { in: buforRefs }, czy_aktywne: false, typ_ruchu: "WZ" };
    if (partieIds) where.id_partii = { in: partieIds };
    const ruchy = await prisma.ruchy_Magazynowe.findMany({ where, select: { id_partii: true, ilosc: true } });
    const map = new Map<string, number>();
    for (const r of ruchy) map.set(r.id_partii, (map.get(r.id_partii) || 0) + Math.abs(r.ilosc));
    return map;
  }

  // --- KARTOTEKI (Asortyment) ---
  

  // ─── Import masowy z Excel ─────────────────────────────────────────────────
  

  

  

  

  

  // --- WARTOŚCI ODŻYWCZE ---
  

  

  // --- ALERGENY ---
  

  

  // --- DODATKOWE POLA KARTOTEKI (producent, zrodlo_danych, skladniki_opis, moze_zawierac) ---
  

  // --- CENY (zakupu / sprzedaży) ---
  

  

  // --- DOKUMENTY ---
  

  

  

  

  

  // --- MAGAZYN ---
  

  // Stan magazynowy wyrobów gotowych — per partia z info o opakowaniu
  

  

  

  // --- MAGAZYN: WZ ---
  

  // --- MAGAZYN: RW (standalone) ---
  

  // --- DOKUMENTY ---
  // WAŻNE: szczegóły dokumentu MUSZĄ być przed /:typ

  // Dane do edycji — surowe pozycje z pozycje_json (nie przetworzone jak w podglądzie)
  

  

  // Ogólny endpoint PDF (dla wszystkich innych wydruków i raportów przesyłanych jako HTML)
  

  // PDF endpoint - referencja może zawierać slashe (np. WZ-4/05/26), używamy wildcard
  

  

  // --- RECEPTURY ---
  

  

  

  

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
  

  // --- RECEPTURY: KALKULACJA KOSZTÓW ---
  

  // --- PRODUKCJA: ROZLICZENIE ---
  

  // --- KOSZTY SESJI PRODUKCYJNEJ ---
  

  // --- PRODUKCJA ---
  

  

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
  

  // POST /api/produkcja/sesja-robocza — utwórz nowy szkic
  

  // PUT /api/produkcja/sesja-robocza/:id — aktualizuj konkretny szkic
  

  // Backwards-compat: PUT /api/produkcja/sesja-robocza (stary endpoint — aktualizuje pierwszą lub tworzy)
  

  // DELETE /api/produkcja/sesja-robocza/:id — usuń konkretny szkic
  

  // DELETE /api/produkcja/sesja-robocza — usuń wszystkie (stary endpoint)
  app.delete("/api/produkcja/sesja-robocza", async (_req, res) => {
    try {
      await (prisma as any).sesja_Robocza_Log.deleteMany();
      await (prisma as any).sesja_Robocza.deleteMany();
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });


  // --- SESJA PRODUKCYJNA (wieloetapowa) ---
  

  



  // --- REZERWACJE (rozpoczęcie zlecenia) ---
  

  

  


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

  


  // --- DASHBOARD ---
  


  // --- ASORTYMENT SZCZEGÓŁY (zintegrowane Kartoteki+Magazyn) ---
  

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
  

  // --- RAPORTY ---
  

  // ─────────────────────────────────────────────────────────────────────────
  // CYRKULACJA OPAKOWAŃ ZWROTNYCH
  // ─────────────────────────────────────────────────────────────────────────

  // Pobierz kartoteki asortymentowe typu 'Opakowanie'
  

  // Oznacz kartotekę asortymentową jako zwrotną / niezwrotną
  

  // Stan aktualny opakowań zwrotnych (oparty na kartotekach Asortyment)
  

  // Historia ruchów (oparta na kartotekach Asortyment)
  

  // Rejestruj ruch opakowania zwrotnego
  

  // Usuń ruch (korekta) — tylko ostatni ruch można cofnąć
  

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
