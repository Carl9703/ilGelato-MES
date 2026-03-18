/**
 * Seed script — czyści bazę i wgrywa kartoteki + receptury z PDF-ów
 * Uruchom: npx tsx prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("⏳ Czyszczenie bazy...");

  // Usuń w kolejności respektującej klucze obce
  await prisma.rezerwacje_Magazynowe.deleteMany();
  await prisma.ruchy_Magazynowe.deleteMany();
  await prisma.zlecenia_Produkcyjne.deleteMany();
  await prisma.skladniki_Receptury.deleteMany();
  await prisma.receptury.deleteMany();
  await prisma.wartosci_Odzywcze.deleteMany();
  await prisma.alergeny_Asortymentu.deleteMany();
  await prisma.partie_Magazynowe.deleteMany();
  await prisma.asortyment.deleteMany();

  console.log("✓ Baza wyczyszczona");

  // ─── SUROWCE ──────────────────────────────────────────────────────────────

  const mleko = await prisma.asortyment.create({ data: {
    kod_towaru: "MLK001",
    nazwa: "Mleko łowickie UHT 3,2%",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    czy_wymaga_daty_waznosci: true,
    producent: "OSM Łowicz",
    zrodlo_danych: "ilGelato MES",
  }});

  const smietanka = await prisma.asortyment.create({ data: {
    kod_towaru: "SMI001",
    nazwa: "Śmietanka deserowa UHT 36%",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    jednostka_pomocnicza: "L",
    przelicznik_jednostki: 1.0,
    czy_wymaga_daty_waznosci: true,
    producent: "OSM Bieruń",
    zrodlo_danych: "ilGelato MES",
  }});

  const cukier = await prisma.asortyment.create({ data: {
    kod_towaru: "CUK001",
    nazwa: "Cukier",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    zrodlo_danych: "ilGelato MES",
  }});

  const dekstroza = await prisma.asortyment.create({ data: {
    kod_towaru: "DEK001",
    nazwa: "Dekstroza",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    producent: "Cargill",
    zrodlo_danych: "ilGelato MES",
  }});

  const omp = await prisma.asortyment.create({ data: {
    kod_towaru: "OMP001",
    nazwa: "Odtłuszczone mleko w proszku",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    producent: "Bartex",
    zrodlo_danych: "ilGelato MES",
    skladniki_opis: "Odtłuszczone mleko w proszku (100%)",
  }});

  const perpanna50 = await prisma.asortyment.create({ data: {
    kod_towaru: "PRE001",
    nazwa: "PERPANNA 50",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    producent: "Albert",
    zrodlo_danych: "ilGelato MES",
    skladniki_opis: "Dekstroza, odtłuszczone mleko w proszku, proteiny mleczne, pełne mleko w proszku, aromat, sól, stabilizatory: E466, E407, E412, emulgator: E471; E551",
  }});

  const pasta = await prisma.asortyment.create({ data: {
    kod_towaru: "PAS001",
    nazwa: "Pasta Kookie&Caramel",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    producent: "Disaronno",
    zrodlo_danych: "ilGelato MES",
  }});

  const crumbs = await prisma.asortyment.create({ data: {
    kod_towaru: "CRU001",
    nazwa: "Kookie & Caramel Crumbs",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    producent: "Disaronno",
    zrodlo_danych: "ilGelato MES",
    skladniki_opis: "Okruszki ciasteczek karmelowych: mąka pszenna, cukier, rafinowane tłuszcze roślinne (palmowy, rzepakowy), syrop cukrowy, substancja spulchniająca: wodorowęglan sodu; sól, cynamon",
  }});

  const variegato = await prisma.asortyment.create({ data: {
    kod_towaru: "VAR001",
    nazwa: "Variegato Kookie&Caramel",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    producent: "Disaronno",
    zrodlo_danych: "ilGelato MES",
    skladniki_opis: "Rafinowane tłuszcze roślinne (słonecznikowy, kokosowy, masło kakaowe, krokoszowy, ryżowy), okruchy ciasteczek karmelowych (mąka pszenna, cukier, tłuszcze roślinne, syrop cukrowy, E500ii; sól, cynamon), cukier, biała czekolada (cukier, pełne mleko w proszku, masło kakaowe), laktoza, pełne mleko w proszku, odtłuszczone mleko w proszku, serwatka w proszku, tłuszcze mleczne, maltodekstryny, karmelizowany cukier, emulgator: lecytyny (soja); barwnik: ekstrakt z papryki; aromaty",
  }});

  console.log("✓ Surowce (9) utworzone");

  // ─── PÓŁPRODUKT ───────────────────────────────────────────────────────────

  // Mieszanka jest na -18°, dni trwałości przechowywania zamrożonego (brak w PDF, pomijamy)
  const mieszanka = await prisma.asortyment.create({ data: {
    kod_towaru: "MIE001",
    nazwa: "Mieszanka mleczna PERPANNA 50-18",
    typ_asortymentu: "Polprodukt",
    jednostka_miary: "kg",
    czy_wymaga_daty_waznosci: false,
    producent: "Fanaberia S.C.",
    zrodlo_danych: "ilGelato MES",
    skladniki_opis: "Mleko 3,2%, śmietanka UHT 36%, cukier, dekstroza, odtłuszczone mleko w proszku, Baza mleczna 50 [dekstroza, odtłuszczone mleko w proszku, proteiny mleczne, pełne mleko w proszku, aromat, sól, stabilizatory: E466, E407, E412, emulgator: E471; E551]",
  }});

  await prisma.wartosci_Odzywcze.create({ data: {
    id_asortymentu: mieszanka.id,
    porcja_g:        100,
    energia_kj:      809,
    energia_kcal:    193,
    tluszcz:         9.6,
    kwasy_nasycone:  7.0,
    weglowodany:     23,
    cukry:           22,
    blonnik:         0,
    bialko:          3.7,
    sol:             0.14,
  }});

  await prisma.alergeny_Asortymentu.create({ data: {
    id_asortymentu: mieszanka.id,
    mleko: true,
  }});

  console.log("✓ Półprodukt: Mieszanka mleczna PERPANNA 50-18");

  // ─── WYRÓB GOTOWY ─────────────────────────────────────────────────────────

  const lody = await prisma.asortyment.create({ data: {
    kod_towaru: "LOD001",
    nazwa: "Lody ciasteczko z karmelem",
    typ_asortymentu: "Wyrob_Gotowy",
    jednostka_miary: "kg",
    czy_wymaga_daty_waznosci: true,
    producent: "Fanaberia S.C.",
    zrodlo_danych: "ilGelato MES",
    moze_zawierac: "SOJA, JAJA, MIGDAŁY, ORZECHY LASKOWE, ORZECHY WŁOSKIE, ORZECHY nerkowca",
    skladniki_opis: "Mleko 3,2%, śmietanka UHT 36% [śmietanka, stabilizator (karagen)], cukier, dekstroza, pasta ciasteczkowo-karmelowa, odtłuszczone mleko w proszku [odtłuszczone mleko w proszku (100%)], baza mleczna [dekstroza, odtłuszczone mleko w proszku, proteiny mleczne, pełne mleko w proszku, aromat, sól, stabilizatory: E466, E407, E412, emulgator: E471; E551], posypka ciasteczkowa do lodów [okruszki ciasteczek karmelowych (mąka pszenna, cukier, rafinowane tłuszcze roślinne (palmowy, rzepakowy), syrop cukrowy, substancja spulchniająca: wodorowęglan sodu; sól, cynamon)], przekładka variegato ciasteczkowo-karmelowa [rafinowane tłuszcze roślinne (słonecznikowy, kokosowy, masło kakaowe, krokoszowy, ryżowy), okruchy ciasteczek karmelowych (mąka pszenna, cukier, tłuszcze roślinne, syrop cukrowy, E500ii; sól, cynamon), cukier, biała czekolada, laktoza, pełne mleko w proszku, odtłuszczone mleko w proszku, serwatka w proszku, tłuszcze mleczne, maltodekstryny, karmelizowany cukier, emulgator: lecytyny (soja); barwnik: ekstrakt z papryki; aromaty]",
  }});

  await prisma.wartosci_Odzywcze.create({ data: {
    id_asortymentu: lody.id,
    porcja_g:        100,
    energia_kj:      869,
    energia_kcal:    208,
    tluszcz:         11,
    kwasy_nasycone:  8.2,
    weglowodany:     23,
    cukry:           22,
    blonnik:         0.5,   // PDF: <0,5 g
    bialko:          4.1,
    sol:             0.18,
  }});

  await prisma.alergeny_Asortymentu.create({ data: {
    id_asortymentu: lody.id,
    gluten: true,    // mąka pszenna w crumbs i variegato
    mleko:  true,    // mleko, śmietanka, OMP, PERPANNA 50
    soja:   true,    // lecytyny sojowe w variegato
  }});

  console.log("✓ Wyrób gotowy: Lody ciasteczko z karmelem");

  // ─── RECEPTURA 1: Mieszanka mleczna PERPANNA 50-18 ────────────────────────
  // Wsad = WG = 60 kg (bez strat). Przechowujem ilosc_wymagana jako per 1 kg output.
  // wielkosc_produkcji = 60 (domyślny wsad z PDF)

  const recMieszanka = await prisma.receptury.create({ data: {
    id_asortymentu_docelowego: mieszanka.id,
    numer_wersji:      1,
    dni_trwalosci:     null,
    wielkosc_produkcji: 60,
    narzut_procent:    0,
  }});

  const skladnikiMieszanka = [
    { asortyment: mleko,    ilosc: 37.200 / 60 },  // 0.62
    { asortyment: smietanka, ilosc: 8.500 / 60 },  // 0.14167
    { asortyment: cukier,   ilosc: 6.600 / 60 },   // 0.11
    { asortyment: dekstroza, ilosc: 3.600 / 60 },  // 0.06
    { asortyment: omp,      ilosc: 2.100 / 60 },   // 0.035
    { asortyment: perpanna50, ilosc: 2.000 / 60 }, // 0.03333
  ];

  for (const s of skladnikiMieszanka) {
    await prisma.skladniki_Receptury.create({ data: {
      id_receptury:             recMieszanka.id,
      id_asortymentu_skladnika: s.asortyment.id,
      ilosc_wymagana:           Math.round(s.ilosc * 100000) / 100000,
    }});
  }

  console.log("✓ Receptura: Mieszanka mleczna PERPANNA 50-18 (6 składników)");

  // ─── RECEPTURA 2: Lody ciasteczko z karmelem ──────────────────────────────
  // MS = 5.805 kg, WG = 5.775 kg (-0.5% strat).
  // Przechowujem ilosc_wymagana jako per 1 kg WG.
  // wielkosc_produkcji = 5.775 (domyślny wsad z PDF)

  const WG_LODY = 5.775;

  const recLody = await prisma.receptury.create({ data: {
    id_asortymentu_docelowego: lody.id,
    numer_wersji:      1,
    dni_trwalosci:     null,
    wielkosc_produkcji: WG_LODY,
    narzut_procent:    0,
  }});

  const skladnikiLody = [
    { asortyment: mleko,     ilosc: 3.515 },
    { asortyment: smietanka, ilosc: 0.740 },
    { asortyment: cukier,    ilosc: 0.575 },
    { asortyment: dekstroza, ilosc: 0.314 },
    { asortyment: pasta,     ilosc: 0.275 },
    { asortyment: omp,       ilosc: 0.183 },
    { asortyment: perpanna50, ilosc: 0.174 },
    { asortyment: crumbs,    ilosc: 0.020 },
    { asortyment: variegato, ilosc: 0.010 },
  ];

  for (const s of skladnikiLody) {
    await prisma.skladniki_Receptury.create({ data: {
      id_receptury:             recLody.id,
      id_asortymentu_skladnika: s.asortyment.id,
      ilosc_wymagana:           Math.round((s.ilosc / WG_LODY) * 100000) / 100000,
    }});
  }

  console.log("✓ Receptura: Lody ciasteczko z karmelem (9 składników)");

  // ─── PODSUMOWANIE ─────────────────────────────────────────────────────────
  console.log("\n✅ Seed zakończony pomyślnie!");
  console.log("   Asortyment: 9 surowców + 1 półprodukt + 1 wyrób gotowy = 11 pozycji");
  console.log("   Receptury:  2 (Mieszanka PERPANNA 50-18 + Lody ciasteczko z karmelem)");
}

main()
  .catch((e) => { console.error("❌ Błąd:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
