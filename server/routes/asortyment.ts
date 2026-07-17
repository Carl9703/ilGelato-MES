import { Router } from "express";
import { prisma } from "../db";

const router = Router();

router.get("/", async (req, res) => {
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

    const buforWzRuchy = await prisma.ruchy_Magazynowe.findMany({
      where: {
        czy_aktywne: false,
        typ_ruchu: "WZ",
        partia: { czy_aktywne: true },
        referencja_dokumentu: {
          in: (await prisma.dokumenty_Magazynowe.findMany({
            where: { status: "Bufor", typ: "WZ" },
            select: { referencja: true }
          })).map(d => d.referencja)
        }
      },
      select: { id_partii: true, ilosc: true }
    });
    
    const buforByPartia = new Map<string, number>();
    for (const r of buforWzRuchy) {
      buforByPartia.set(r.id_partii, (buforByPartia.get(r.id_partii) || 0) + Math.abs(r.ilosc));
    }

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
        batchReservations += buforByPartia.get(partia.id) || 0;
      });

      const rezerwacje = batchReservations + globalReservations;
      const cena_srednia = ilosc > 0 ? (totalWartosc / ilosc) : 0;
      const { partie_magazynowe, rezerwacje: _r, ...rest } = item;
      return { ...rest, ilosc, rezerwacje, cena_srednia };
    });

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "Błąd pobierania asortymentu" });
  }
});

router.post("/import-bulk", async (req, res) => {
  try {
    const { rows } = req.body as { rows: Array<any> };
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "Brak danych do importu" });

    const results = await Promise.all(rows.map(async (row) => {
      try {
        const parsedPrzelicznik = row.przelicznik_jednostki ? parseFloat(String(row.przelicznik_jednostki).replace(",", ".")) : null;
        await prisma.asortyment.create({
          data: {
            kod_towaru: row.kod_towaru,
            nazwa: row.nazwa,
            typ_asortymentu: row.typ_asortymentu,
            jednostka_miary: row.jednostka_miary,
            jednostka_pomocnicza: row.jednostka_pomocnicza || null,
            przelicznik_jednostki: (parsedPrzelicznik && !isNaN(parsedPrzelicznik)) ? parsedPrzelicznik : null,
            czy_wymaga_daty_waznosci: Boolean(row.czy_wymaga_daty_waznosci),
            czy_zasob_nieograniczony: Boolean(row.czy_zasob_nieograniczony),
            producent: row.producent || null,
            zrodlo_danych: row.zrodlo_danych || null,
          },
        });
        return { kod_towaru: row.kod_towaru, success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { kod_towaru: row.kod_towaru, success: false, error: msg.includes("Unique constraint") ? "Kod towaru już istnieje w bazie" : msg };
      }
    }));
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: "Błąd importu asortymentu" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { kod_towaru, nazwa, typ_asortymentu, jednostka_miary, jednostka_pomocnicza, przelicznik_jednostki, czy_wymaga_daty_waznosci, czy_zasob_nieograniczony, id_grupy } = req.body;
    const parsedPrzelicznik = przelicznik_jednostki !== null && przelicznik_jednostki !== undefined && przelicznik_jednostki !== "" ? parseFloat(przelicznik_jednostki.toString().replace(",", ".")) : null;

    const newItem = await prisma.asortyment.create({
      data: {
        kod_towaru, nazwa, typ_asortymentu, jednostka_miary,
        jednostka_pomocnicza: jednostka_pomocnicza || null,
        przelicznik_jednostki: isNaN(Number(parsedPrzelicznik)) ? null : parsedPrzelicznik,
        czy_wymaga_daty_waznosci: Boolean(czy_wymaga_daty_waznosci),
        czy_zasob_nieograniczony: Boolean(czy_zasob_nieograniczony),
        id_grupy: id_grupy || null,
      },
    });
    res.json(newItem);
  } catch (error) { res.status(500).json({ error: "Błąd tworzenia asortymentu" }); }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { kod_towaru, nazwa, typ_asortymentu, jednostka_miary, jednostka_pomocnicza, przelicznik_jednostki, czy_wymaga_daty_waznosci, czy_zasob_nieograniczony, id_grupy } = req.body;
    const parsedPrzelicznik = przelicznik_jednostki !== null && przelicznik_jednostki !== undefined && przelicznik_jednostki !== "" ? parseFloat(przelicznik_jednostki.toString().replace(",", ".")) : null;

    const updatedItem = await prisma.asortyment.update({
      where: { id },
      data: {
        kod_towaru, nazwa, typ_asortymentu, jednostka_miary,
        jednostka_pomocnicza: jednostka_pomocnicza || null,
        przelicznik_jednostki: isNaN(Number(parsedPrzelicznik)) ? null : parsedPrzelicznik,
        czy_wymaga_daty_waznosci: Boolean(czy_wymaga_daty_waznosci),
        czy_zasob_nieograniczony: Boolean(czy_zasob_nieograniczony),
        id_grupy: id_grupy || null,
      },
    });
    res.json(updatedItem);
  } catch (error) { res.status(500).json({ error: "Błąd aktualizacji asortymentu" }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { archive } = req.query;
    const partieCount = await prisma.partie_Magazynowe.count({ where: { id_asortymentu: id } });
    const recepturyCount = await prisma.receptury.count({ where: { id_asortymentu_docelowego: id } });
    const skladnikiCount = await prisma.skladniki_Receptury.count({ where: { id_asortymentu_skladnika: id } });

    if (partieCount > 0 || recepturyCount > 0 || skladnikiCount > 0) {
      if (archive === 'true') {
        await prisma.asortyment.update({ where: { id }, data: { czy_aktywne: false } });
        return res.json({ success: true, archived: true });
      } else {
        return res.status(409).json({ error: "Element posiada historię", requiresArchiving: true });
      }
    } else {
      await prisma.asortyment.delete({ where: { id } });
      return res.json({ success: true, deleted: true });
    }
  } catch (error) { res.status(500).json({ error: "Błąd usuwania asortymentu" }); }
});

router.put("/:id/restore", async (req, res) => {
  try {
    await prisma.asortyment.update({ where: { id: req.params.id }, data: { czy_aktywne: true } });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: "Błąd przywracania asortymentu" }); }
});

router.get("/:id/odzywcze", async (req, res) => {
  try {
    const data = await (prisma as any).wartosci_Odzywcze.findUnique({ where: { id_asortymentu: req.params.id } });
    res.json(data || null);
  } catch (error) { res.status(500).json({ error: "Błąd pobierania wartości odżywczych" }); }
});

router.put("/:id/odzywcze", async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ["porcja_g","energia_kj","energia_kcal","tluszcz","kwasy_nasycone","weglowodany","cukry","blonnik","bialko","sol"];
    const data: any = {};
    for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f] === "" || req.body[f] === null ? null : parseFloat(req.body[f]);
    const result = await (prisma as any).wartosci_Odzywcze.upsert({
      where: { id_asortymentu: id }, update: data, create: { id_asortymentu: id, ...data },
    });
    res.json(result);
  } catch (error) { res.status(500).json({ error: "Błąd zapisu wartości odżywczych" }); }
});

router.get("/:id/alergeny", async (req, res) => {
  try {
    const data = await (prisma as any).alergeny_Asortymentu.findUnique({ where: { id_asortymentu: req.params.id } });
    res.json(data || null);
  } catch (error) { res.status(500).json({ error: "Błąd pobierania alergenów" }); }
});

router.put("/:id/alergeny", async (req, res) => {
  try {
    const { id } = req.params;
    const boolFields = ["gluten","skorupiaki","jaja","ryby","orzeszki_ziemne","soja","mleko","orzechy","seler","gorczyca","sezam","dwutlenek_siarki","lubin","mieczaki"];
    const data: any = {};
    for (const f of boolFields) if (req.body[f] !== undefined) data[f] = Boolean(req.body[f]);
    const result = await (prisma as any).alergeny_Asortymentu.upsert({
      where: { id_asortymentu: id }, update: data, create: { id_asortymentu: id, ...data },
    });
    res.json(result);
  } catch (error) { res.status(500).json({ error: "Błąd zapisu alergenów" }); }
});

router.put("/:id/kartoteka", async (req, res) => {
  try {
    const { producent, zrodlo_danych, skladniki_opis, moze_zawierac } = req.body;
    const result = await prisma.asortyment.update({
      where: { id: req.params.id }, data: { producent, zrodlo_danych, skladniki_opis, moze_zawierac },
    });
    res.json(result);
  } catch (error) { res.status(500).json({ error: "Błąd zapisu kartoteki" }); }
});

router.get("/:id/ceny", async (req, res) => {
  try {
    const data = await prisma.asortyment.findUnique({
      where: { id: req.params.id }, select: { cena_sprzedazy: true, stawka_vat: true, cena_zakupu: true, waga_jednostkowa_kg: true },
    });
    res.json(data || {});
  } catch { res.status(500).json({ error: "Błąd pobierania cen" }); }
});

router.put("/:id/ceny", async (req, res) => {
  try {
    const { id } = req.params;
    const cena = req.body.cena_sprzedazy !== undefined && req.body.cena_sprzedazy !== "" ? parseFloat(req.body.cena_sprzedazy) : null;
    const vat = req.body.stawka_vat !== undefined && req.body.stawka_vat !== "" ? parseFloat(req.body.stawka_vat) : null;
    const cenaZakupu = req.body.cena_zakupu !== undefined && req.body.cena_zakupu !== "" ? parseFloat(req.body.cena_zakupu) : null;
    const wagaJedn = req.body.waga_jednostkowa_kg !== undefined && req.body.waga_jednostkowa_kg !== "" ? parseFloat(req.body.waga_jednostkowa_kg) : null;
    const result = await prisma.asortyment.update({
      where: { id }, data: { cena_sprzedazy: cena, stawka_vat: vat, cena_zakupu: cenaZakupu, waga_jednostkowa_kg: wagaJedn },
    });
    res.json({ cena_sprzedazy: result.cena_sprzedazy, stawka_vat: result.stawka_vat, cena_zakupu: result.cena_zakupu, waga_jednostkowa_kg: result.waga_jednostkowa_kg });
  } catch { res.status(500).json({ error: "Błąd zapisu cen" }); }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const asortyment = await prisma.asortyment.findUnique({
      where: { id },
      include: {
        grupa: { select: { id: true, kod: true, nazwa: true } },
        wartosci_odzywcze: true,
        alergeny: true,
      }
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

    const allOpIds = new Set<string>();
    partie.forEach(p => {
      if (p.opakowania_json) {
        try { (JSON.parse(p.opakowania_json) as any[]).forEach(o => allOpIds.add(o.id_asortymentu)); } catch {}
      }
    });
    const opAsortyment = allOpIds.size > 0
      ? await prisma.asortyment.findMany({ where: { id: { in: [...allOpIds] } }, select: { id: true, nazwa: true } })
      : [];
    const opNazwyMap = Object.fromEntries(opAsortyment.map(a => [a.id, a.nazwa]));

    const partieIds = partie.map(p => p.id);
    const issuedByBatch = new Map<string, any[]>();
    if (partieIds.length > 0) {
      const wzDocs = await prisma.dokumenty_Magazynowe.findMany({
        where: { typ: "WZ", status: { in: ["Zatwierdzony", "Faktura wystawiona"] }, pozycje_json: { not: null } },
        select: { pozycje_json: true },
      });
      for (const doc of wzDocs) {
        try {
          const pozycje = JSON.parse(doc.pozycje_json!) as any[];
          for (const poz of pozycje) {
            if (!partieIds.includes(poz.id_partii) || !poz.sztuki) continue;
            if (!issuedByBatch.has(poz.id_partii)) issuedByBatch.set(poz.id_partii, []);
            for (const [label, count] of Object.entries(poz.sztuki)) {
              const match = String(label).match(/^(.*)\s+\((\d+(?:\.\d+)?)\s*kg\)$/);
              if (match) issuedByBatch.get(poz.id_partii).push({ nazwa: match[1], waga_kg: parseFloat(match[2]), count });
            }
          }
        } catch {}
      }
    }

    const buforWzRefs = (await prisma.dokumenty_Magazynowe.findMany({
      where: { status: "Bufor", typ: "WZ" }, select: { referencja: true }
    })).map(d => d.referencja);
    const buforWzRuchy = buforWzRefs.length > 0 ? await prisma.ruchy_Magazynowe.findMany({
      where: { id_partii: { in: partieIds }, referencja_dokumentu: { in: buforWzRefs }, czy_aktywne: false },
      select: { id_partii: true, ilosc: true, referencja_dokumentu: true }
    }) : [];
    const buforByPartia = new Map<string, number>();
    for (const r of buforWzRuchy) {
      if (r.id_partii) buforByPartia.set(r.id_partii, (buforByPartia.get(r.id_partii) || 0) + Math.abs(r.ilosc));
    }

    const zasoby = partie.map(p => {
      const stan = p.ruchy_magazynowe.reduce((s, r) => s + r.ilosc, 0);
      const zarezerwowane = p.rezerwacje.reduce((s, r) => s + r.ilosc_zarezerwowana, 0)
        + (buforByPartia.get(p.id) || 0);

      const pzDoc = p.ruchy_magazynowe.find(r => (r.typ_ruchu === "PZ" || r.typ_ruchu === "Przyjecie_Z_Produkcji") && r.ilosc > 0);
      const cena_jednostkowa = pzDoc?.cena_jednostkowa || 0;
      const dokument_przyjecia = pzDoc?.referencja_dokumentu || null;

      let opakowania = null;
      if (p.opakowania_json) {
        try {
          let currentOps = (JSON.parse(p.opakowania_json) as any[])
            .map(o => ({ id_asortymentu: o.id_asortymentu, nazwa: opNazwyMap[o.id_asortymentu] || o.nazwa, waga_kg: o.waga_kg }));
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

    const totalStan = zasoby.reduce((s, z) => s + z.stan, 0);
    const batchZarezerwowane = zasoby.reduce((s, z) => s + z.zarezerwowane, 0);
    const sumGlobalneRezerwacje = globalneRezerwacje.reduce((s, r) => s + r.ilosc_zarezerwowana, 0);
    const totalZarezerwowane = batchZarezerwowane + sumGlobalneRezerwacje;

    const totalWartosc = zasoby.reduce((s, z) => s + z.wartosc, 0);
    const cenaSredniaWazona = totalStan > 0.001 ? (totalWartosc / totalStan) : 0;

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

    const historia = allRuchy.map(r => {
      saldo += r.ilosc;
      return { ...r, saldo_po_operacji: saldo };
    }).reverse();

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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
