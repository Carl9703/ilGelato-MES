/**
 * Seed script — czyści bazę i wgrywa kartoteki + receptury
 * Uruchom: npx tsx prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("⏳ Czyszczenie bazy...");

  // Utwórz domyślnego użytkownika (jeśli nie istnieje)
  await prisma.uzytkownicy.upsert({
    where: { login: "admin" },
    update: {},
    create: { login: "admin", haslo: "admin" },
  });

  // Usuń w kolejności respektującej klucze obce
  await prisma.sesja_Robocza_Log.deleteMany();
  await prisma.sesja_Robocza.deleteMany();
  await prisma.rezerwacje_Magazynowe.deleteMany();
  await prisma.ruchy_Magazynowe.deleteMany();
  await prisma.opakowania_Wyrobowe.deleteMany();
  await prisma.pozycje_Sesji_Gelato.deleteMany();
  await prisma.sesje_Produkcji_Gelato.deleteMany();
  await prisma.typy_Opakowan.deleteMany();
  await prisma.zlecenia_Produkcyjne.deleteMany();
  await prisma.sesje_Produkcji.deleteMany();
  await prisma.dokumenty_Magazynowe.deleteMany();
  await prisma.partie_Magazynowe.deleteMany();
  await prisma.skladniki_Receptury.deleteMany();
  await prisma.receptury.deleteMany();
  await prisma.wartosci_Odzywcze.deleteMany();
  await prisma.alergeny_Asortymentu.deleteMany();
  await prisma.asortyment.deleteMany();

  console.log("✓ Baza wyczyszczona");

  // ─── GRUPY TOWAROWE ────────────────────────────────────────────────────────

  const grpGelato = await prisma.grupy_Towarowe.upsert({
    where: { kod: "GEL" },
    update: { nazwa: "Gelato", kolejnosc: 1 },
    create: { kod: "GEL", nazwa: "Gelato", kolejnosc: 1 },
  });
  const grpMl = await prisma.grupy_Towarowe.upsert({
    where: { kod: "GEL-ML" },
    update: { nazwa: "Smaki mleczne", id_grupy_nadrzednej: grpGelato.id, kolejnosc: 1 },
    create: { kod: "GEL-ML", nazwa: "Smaki mleczne", id_grupy_nadrzednej: grpGelato.id, kolejnosc: 1 },
  });
  const grpSor = await prisma.grupy_Towarowe.upsert({
    where: { kod: "GEL-SOR" },
    update: { nazwa: "Sorbety", id_grupy_nadrzednej: grpGelato.id, kolejnosc: 2 },
    create: { kod: "GEL-SOR", nazwa: "Sorbety", id_grupy_nadrzednej: grpGelato.id, kolejnosc: 2 },
  });
  await prisma.grupy_Towarowe.upsert({
    where: { kod: "GEL-WEG" },
    update: { nazwa: "Wege", id_grupy_nadrzednej: grpGelato.id, kolejnosc: 3 },
    create: { kod: "GEL-WEG", nazwa: "Wege", id_grupy_nadrzednej: grpGelato.id, kolejnosc: 3 },
  });
  await prisma.grupy_Towarowe.upsert({
    where: { kod: "GEL-CRE" },
    update: { nazwa: "Cremino", id_grupy_nadrzednej: grpGelato.id, kolejnosc: 4 },
    create: { kod: "GEL-CRE", nazwa: "Cremino", id_grupy_nadrzednej: grpGelato.id, kolejnosc: 4 },
  });
  await prisma.grupy_Towarowe.upsert({
    where: { kod: "OPK" },
    update: { nazwa: "Opakowania", kolejnosc: 2 },
    create: { kod: "OPK", nazwa: "Opakowania", kolejnosc: 2 },
  });
  await prisma.grupy_Towarowe.upsert({
    where: { kod: "SUR" },
    update: { nazwa: "Surowce", kolejnosc: 3 },
    create: { kod: "SUR", nazwa: "Surowce", kolejnosc: 3 },
  });

  console.log("✓ Grupy towarowe (7) gotowe");

  // ─── SUROWCE WSPÓLNE ──────────────────────────────────────────────────────

  const mleko = await prisma.asortyment.create({ data: {
    kod_towaru: "MLK001",
    nazwa: "Mleko łowickie UHT 3,2%",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "L",
    jednostka_pomocnicza: "kg",
    przelicznik_jednostki: 1.03,
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
    skladniki_opis: "Rafinowane tłuszcze roślinne (słonecznikowy, kokosowy, masło kakaowe, krokoszowy, ryżowy), okruchy ciasteczek karmelowych, cukier, biała czekolada, laktoza, pełne mleko w proszku, odtłuszczone mleko w proszku, serwatka w proszku, tłuszcze mleczne, maltodekstryny, karmelizowany cukier, emulgator: lecytyny (soja); barwnik: ekstrakt z papryki; aromaty",
  }});

  console.log("✓ Surowce mleczne / lody (9) utworzone");

  // ─── SUROWCE SORBETOWE ────────────────────────────────────────────────────

  const woda = await prisma.asortyment.create({ data: {
    kod_towaru: "WOD001",
    nazwa: "Woda",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    zrodlo_danych: "ilGelato MES",
    czy_zasob_nieograniczony: true,
  }});

  const tfMango = await prisma.asortyment.create({ data: {
    kod_towaru: "TFM001",
    nazwa: "Tuttafrutta Mango",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    producent: "Albert",
    zrodlo_danych: "ilGelato MES",
    skladniki_opis: "Przecier z mango (min. 50%), cukier, regulatory kwasowości: kwas cytrynowy; aromaty naturalne",
    czy_wymaga_daty_waznosci: true,
  }});

  const tfMaracuja = await prisma.asortyment.create({ data: {
    kod_towaru: "TFMR001",
    nazwa: "Tuttafrutta Maracuja",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    producent: "Albert",
    zrodlo_danych: "ilGelato MES",
    skladniki_opis: "Przecier z marakui (min. 50%), cukier, regulatory kwasowości: kwas cytrynowy; aromaty naturalne",
    czy_wymaga_daty_waznosci: true,
  }});

  const perfruita = await prisma.asortyment.create({ data: {
    kod_towaru: "PFC001",
    nazwa: "Perfrutta Cremosa",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    producent: "Albert",
    zrodlo_danych: "ilGelato MES",
    skladniki_opis: "Dekstroza, stabilizatory: E412, E415, E466; regulatory kwasowości: kwas cytrynowy; emulgator: E471",
  }});

  const tfTruskawka = await prisma.asortyment.create({ data: {
    kod_towaru: "TFTRS001",
    nazwa: "Tuttafrutta Truskawka",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    producent: "Albert",
    zrodlo_danych: "ilGelato MES",
    skladniki_opis: "Przecier z truskawek (min. 50%), cukier, regulatory kwasowości: kwas cytrynowy; aromaty naturalne",
    czy_wymaga_daty_waznosci: true,
  }});

  const tfCytryna = await prisma.asortyment.create({ data: {
    kod_towaru: "TFCYT001",
    nazwa: "Tuttafrutta Cytryna",
    typ_asortymentu: "Surowiec",
    jednostka_miary: "kg",
    producent: "Albert",
    zrodlo_danych: "ilGelato MES",
    skladniki_opis: "Sok z cytryn (min. 40%), cukier, skórka cytrynowa, regulatory kwasowości: kwas cytrynowy; aromaty naturalne",
    czy_wymaga_daty_waznosci: true,
  }});

  console.log("✓ Surowce sorbetowe (6) utworzone");

  // ─── OPAKOWANIA ───────────────────────────────────────────────────────────

  const pozetti = await prisma.asortyment.create({ data: {
    kod_towaru: "OPK001",
    nazwa: "Pozetti (kubeczki papierowe 150ml)",
    typ_asortymentu: "Opakowanie",
    jednostka_miary: "szt",
    zrodlo_danych: "ilGelato MES",
  }});

  await prisma.asortyment.create({ data: {
    kod_towaru: "OPK002",
    nazwa: "Opakowanie plastikowe 500ml",
    typ_asortymentu: "Opakowanie",
    jednostka_miary: "szt",
    zrodlo_danych: "ilGelato MES",
  }});

  console.log("✓ Opakowania (2) utworzone");

  // ─── PÓŁPRODUKT: Mieszanka mleczna PERPANNA 50-18 ─────────────────────────

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
    porcja_g: 100, energia_kj: 809, energia_kcal: 193,
    tluszcz: 9.6, kwasy_nasycone: 7.0, weglowodany: 23, cukry: 22,
    blonnik: 0, bialko: 3.7, sol: 0.14,
  }});

  await prisma.alergeny_Asortymentu.create({ data: {
    id_asortymentu: mieszanka.id, mleko: true,
  }});

  console.log("✓ Półprodukt: Mieszanka mleczna PERPANNA 50-18");

  // ─── WYROBY GOTOWE: LODY (grupa GEL-ML) ──────────────────────────────────

  const lody = await prisma.asortyment.create({ data: {
    kod_towaru: "LOD001",
    nazwa: "Lody ciasteczko z karmelem",
    typ_asortymentu: "Wyrob_Gotowy",
    jednostka_miary: "kg",
    czy_wymaga_daty_waznosci: true,
    producent: "Fanaberia S.C.",
    zrodlo_danych: "ilGelato MES",
    id_grupy: grpMl.id,
    moze_zawierac: "SOJA, JAJA, MIGDAŁY, ORZECHY LASKOWE, ORZECHY WŁOSKIE, ORZECHY nerkowca",
    skladniki_opis: "Mleko 3,2%, śmietanka UHT 36%, cukier, dekstroza, pasta ciasteczkowo-karmelowa, odtłuszczone mleko w proszku, baza mleczna [dekstroza, OMP, proteiny mleczne, pełne mleko w proszku, aromat, sól, stabilizatory: E466, E407, E412, emulgator: E471; E551], posypka ciasteczkowa, przekładka variegato",
  }});

  await prisma.wartosci_Odzywcze.create({ data: {
    id_asortymentu: lody.id,
    porcja_g: 100, energia_kj: 869, energia_kcal: 208,
    tluszcz: 11, kwasy_nasycone: 8.2, weglowodany: 23, cukry: 22,
    blonnik: 0.5, bialko: 4.1, sol: 0.18,
  }});

  await prisma.alergeny_Asortymentu.create({ data: {
    id_asortymentu: lody.id, gluten: true, mleko: true, soja: true,
  }});

  const lodySm = await prisma.asortyment.create({ data: {
    kod_towaru: "LOD002",
    nazwa: "Lody śmietankowe",
    typ_asortymentu: "Wyrob_Gotowy",
    jednostka_miary: "kg",
    czy_wymaga_daty_waznosci: true,
    producent: "Fanaberia S.C.",
    zrodlo_danych: "ilGelato MES",
    id_grupy: grpMl.id,
    skladniki_opis: "Mleko 3,2%, śmietanka UHT 36%, baza mleczna [dekstroza, odtłuszczone mleko w proszku, proteiny mleczne, pełne mleko w proszku, stabilizatory: E466, E407, E412, emulgator: E471], cukier",
    moze_zawierac: "JAJA, GLUTEN, SOJA",
  }});

  await prisma.alergeny_Asortymentu.create({ data: {
    id_asortymentu: lodySm.id, mleko: true,
  }});

  console.log("✓ Wyroby gotowe: Lody (2) w grupie GEL-ML");

  // ─── WYROBY GOTOWE: SORBETY (grupa GEL-SOR) ──────────────────────────────

  const sorbetMango = await prisma.asortyment.create({ data: {
    kod_towaru: "SOR001",
    nazwa: "Sorbet Mango-Maracuja",
    typ_asortymentu: "Wyrob_Gotowy",
    jednostka_miary: "kg",
    czy_wymaga_daty_waznosci: true,
    producent: "Fanaberia S.C.",
    zrodlo_danych: "ilGelato MES",
    id_grupy: grpSor.id,
    moze_zawierac: null,
    skladniki_opis: "Woda, przecier z mango (Tuttafrutta Mango), przecier z marakui (Tuttafrutta Maracuja), cukier, dekstroza, stabilizator sorbetowy (Perfrutta Cremosa) [dekstroza, E412, E415, E466, kwas cytrynowy, E471]",
  }});

  await prisma.wartosci_Odzywcze.create({ data: {
    id_asortymentu: sorbetMango.id,
    porcja_g: 100, energia_kj: 387, energia_kcal: 91,
    tluszcz: 0.2, kwasy_nasycone: 0, weglowodany: 22, cukry: 21,
    blonnik: 0.4, bialko: 0.3, sol: 0.01,
  }});

  await prisma.alergeny_Asortymentu.create({ data: {
    id_asortymentu: sorbetMango.id,
  }});

  const sorbetTruskawka = await prisma.asortyment.create({ data: {
    kod_towaru: "SOR002",
    nazwa: "Sorbet Truskawka-Cytryna",
    typ_asortymentu: "Wyrob_Gotowy",
    jednostka_miary: "kg",
    czy_wymaga_daty_waznosci: true,
    producent: "Fanaberia S.C.",
    zrodlo_danych: "ilGelato MES",
    id_grupy: grpSor.id,
    moze_zawierac: null,
    skladniki_opis: "Woda, przecier z truskawek (Tuttafrutta Truskawka), sok i skórka cytrynowa (Tuttafrutta Cytryna), cukier, dekstroza, stabilizator sorbetowy (Perfrutta Cremosa) [dekstroza, E412, E415, E466, kwas cytrynowy, E471]",
  }});

  await prisma.wartosci_Odzywcze.create({ data: {
    id_asortymentu: sorbetTruskawka.id,
    porcja_g: 100, energia_kj: 352, energia_kcal: 83,
    tluszcz: 0.1, kwasy_nasycone: 0, weglowodany: 20, cukry: 19,
    blonnik: 0.5, bialko: 0.3, sol: 0.01,
  }});

  await prisma.alergeny_Asortymentu.create({ data: {
    id_asortymentu: sorbetTruskawka.id,
  }});

  console.log("✓ Wyroby gotowe: Sorbety (2) w grupie GEL-SOR");

  // ─── RECEPTURA 1: Mieszanka mleczna PERPANNA 50-18 (wsad 60 kg) ───────────

  const recMieszanka = await prisma.receptury.create({ data: {
    id_asortymentu_docelowego: mieszanka.id,
    numer_wersji: 1, dni_trwalosci: null, wielkosc_produkcji: 60, narzut_procent: 0,
  }});

  for (const s of [
    { asortyment: mleko,      ilosc: 37.200 / 60, czy_pomocnicza: true },
    { asortyment: smietanka,  ilosc: 8.500  / 60 },
    { asortyment: cukier,     ilosc: 6.600  / 60 },
    { asortyment: dekstroza,  ilosc: 3.600  / 60 },
    { asortyment: omp,        ilosc: 2.100  / 60 },
    { asortyment: perpanna50, ilosc: 2.000  / 60 },
  ]) {
    await prisma.skladniki_Receptury.create({ data: {
      id_receptury: recMieszanka.id,
      id_asortymentu_skladnika: s.asortyment.id,
      ilosc_wymagana: Math.round(s.ilosc * 100000) / 100000,
      czy_pomocnicza: s.czy_pomocnicza ?? false,
    }});
  }

  console.log("✓ Receptura: Mieszanka mleczna PERPANNA 50-18 (6 składników)");

  // ─── RECEPTURA 2: Lody ciasteczko z karmelem (wsad 1 kg) ─────────────────

  const recLody = await prisma.receptury.create({ data: {
    id_asortymentu_docelowego: lody.id,
    numer_wersji: 3, dni_trwalosci: 60, wielkosc_produkcji: 1, narzut_procent: 0,
  }});

  for (const s of [
    { asortyment: mieszanka, ilosc_wymagana: 5.225 },
    { asortyment: mleko,     ilosc_wymagana: 0.275, czy_pomocnicza: true },
    { asortyment: pasta,     ilosc_wymagana: 0.275 },
  ]) {
    await prisma.skladniki_Receptury.create({ data: {
      id_receptury: recLody.id,
      id_asortymentu_skladnika: s.asortyment.id,
      ilosc_wymagana: s.ilosc_wymagana,
      czy_pomocnicza: s.czy_pomocnicza ?? false,
    }});
  }

  console.log("✓ Receptura: Lody ciasteczko z karmelem (3 składniki, v3, 60 dni)");

  // ─── RECEPTURA 3: Lody śmietankowe (wsad 1 kg) ───────────────────────────

  const recLodySm = await prisma.receptury.create({ data: {
    id_asortymentu_docelowego: lodySm.id,
    numer_wersji: 1, dni_trwalosci: 60, wielkosc_produkcji: 1, narzut_procent: 0,
  }});

  for (const s of [
    { asortyment: mieszanka, ilosc_wymagana: 5.0   },
    { asortyment: smietanka, ilosc_wymagana: 0.5   },
    { asortyment: mleko,     ilosc_wymagana: 0.275, czy_pomocnicza: true },
  ]) {
    await prisma.skladniki_Receptury.create({ data: {
      id_receptury: recLodySm.id,
      id_asortymentu_skladnika: s.asortyment.id,
      ilosc_wymagana: s.ilosc_wymagana,
      czy_pomocnicza: s.czy_pomocnicza ?? false,
    }});
  }

  console.log("✓ Receptura: Lody śmietankowe (3 składniki, v1, 60 dni)");

  // ─── RECEPTURA 4: Sorbet Mango-Maracuja (wsad 1 kg) ──────────────────────
  // Źródło: karta technologiczna
  // 1 kg wsad: Woda 450g, TF Mango 200g, TF Maracuja 100g, Cukier 150g, Dekstroza 50g, Perfrutta Cremosa 50g

  const recSorbetMango = await prisma.receptury.create({ data: {
    id_asortymentu_docelowego: sorbetMango.id,
    numer_wersji: 1, dni_trwalosci: 90, wielkosc_produkcji: 1, narzut_procent: 0,
  }});

  for (const s of [
    { asortyment: woda,       ilosc_wymagana: 0.450 },
    { asortyment: tfMango,    ilosc_wymagana: 0.200 },
    { asortyment: tfMaracuja, ilosc_wymagana: 0.100 },
    { asortyment: cukier,     ilosc_wymagana: 0.150 },
    { asortyment: dekstroza,  ilosc_wymagana: 0.050 },
    { asortyment: perfruita,  ilosc_wymagana: 0.050 },
  ]) {
    await prisma.skladniki_Receptury.create({ data: {
      id_receptury: recSorbetMango.id,
      id_asortymentu_skladnika: s.asortyment.id,
      ilosc_wymagana: s.ilosc_wymagana,
      czy_pomocnicza: false,
    }});
  }

  console.log("✓ Receptura: Sorbet Mango-Maracuja (6 składników, v1, 90 dni)");

  // ─── RECEPTURA 5: Sorbet Truskawka-Cytryna (wsad 1 kg) ───────────────────
  // Proporcje: Woda 400g, TF Truskawka 250g, TF Cytryna 80g,
  //            Cukier 160g, Dekstroza 60g, Perfrutta Cremosa 50g = 1000g

  const recSorbetTruskawka = await prisma.receptury.create({ data: {
    id_asortymentu_docelowego: sorbetTruskawka.id,
    numer_wersji: 1, dni_trwalosci: 90, wielkosc_produkcji: 1, narzut_procent: 0,
  }});

  for (const s of [
    { asortyment: woda,         ilosc_wymagana: 0.400 },
    { asortyment: tfTruskawka,  ilosc_wymagana: 0.250 },
    { asortyment: tfCytryna,    ilosc_wymagana: 0.080 },
    { asortyment: cukier,       ilosc_wymagana: 0.160 },
    { asortyment: dekstroza,    ilosc_wymagana: 0.060 },
    { asortyment: perfruita,    ilosc_wymagana: 0.050 },
  ]) {
    await prisma.skladniki_Receptury.create({ data: {
      id_receptury: recSorbetTruskawka.id,
      id_asortymentu_skladnika: s.asortyment.id,
      ilosc_wymagana: s.ilosc_wymagana,
      czy_pomocnicza: false,
    }});
  }

  console.log("✓ Receptura: Sorbet Truskawka-Cytryna (6 składników, v1, 90 dni)");

  // ─── PZ — przyjęcie wszystkich surowców ──────────────────────────────────

  const admin = await prisma.uzytkownicy.findFirstOrThrow({ where: { login: "admin" } });
  const pzRef = "PZ-1/03/26";
  const dataPz = new Date("2026-03-01");
  const terminWaznosci = new Date("2026-12-31");

  const pzDoc = await prisma.dokumenty_Magazynowe.create({ data: {
    referencja: pzRef,
    typ: "PZ",
    status: "Zatwierdzony",
    id_uzytkownika_utworzenia: admin.id,
    id_uzytkownika_zatwierdzenia: admin.id,
    data_zatwierdzenia: dataPz,
    utworzono_dnia: dataPz,
  }});

  const surowcePZ: { asortyment: typeof mleko; cena: number; ilosc?: number }[] = [
    // Surowce mleczne / lody
    { asortyment: mleko,         cena: 2.50  },
    { asortyment: smietanka,     cena: 8.00  },
    { asortyment: cukier,        cena: 3.50  },
    { asortyment: dekstroza,     cena: 4.20  },
    { asortyment: omp,           cena: 12.00 },
    { asortyment: perpanna50,    cena: 15.50 },
    { asortyment: pasta,         cena: 25.00 },
    { asortyment: crumbs,        cena: 18.00 },
    { asortyment: variegato,     cena: 20.00 },
    // Surowce sorbetowe (woda pomijana — zasób nieograniczony)
    { asortyment: tfMango,       cena: 14.50, ilosc: 50  },
    { asortyment: tfMaracuja,    cena: 16.00, ilosc: 50  },
    { asortyment: perfruita,     cena: 18.00, ilosc: 50  },
    { asortyment: tfTruskawka,   cena: 13.00, ilosc: 50  },
    { asortyment: tfCytryna,     cena: 15.00, ilosc: 50  },
  ];

  for (let i = 0; i < surowcePZ.length; i++) {
    const { asortyment: asort, cena, ilosc = 100 } = surowcePZ[i];
    const partia = await prisma.partie_Magazynowe.create({ data: {
      id_asortymentu: asort.id,
      numer_partii: `${pzRef}/${String(i + 1).padStart(2, "0")}`,
      data_produkcji: dataPz,
      termin_waznosci: terminWaznosci,
      status_partii: "Dostepna",
      utworzono_dnia: dataPz,
    }});
    await prisma.ruchy_Magazynowe.create({ data: {
      id_partii: partia.id,
      typ_ruchu: "PZ",
      ilosc,
      cena_jednostkowa: cena,
      referencja_dokumentu: pzRef,
      id_uzytkownika: admin.id,
      czy_aktywne: true,
      utworzono_dnia: dataPz,
    }});
  }

  console.log(`✓ PZ: ${pzRef} — ${surowcePZ.length} pozycji surowców (woda: zasób nieograniczony, bez PZ)`);

  // ─── PODSUMOWANIE ─────────────────────────────────────────────────────────
  console.log("\n✅ Seed zakończony pomyślnie!");
  console.log("   Użytkownik:  admin / admin");
  console.log("   Grupy:       7 (GEL, GEL-ML, GEL-SOR, GEL-WEG, GEL-CRE, OPK, SUR)");
  console.log("   Asortyment:  9 surowców mlecznych + 6 surowców sorbetowych + 2 opakowania");
  console.log("                + 1 półprodukt + 2 lody (GEL-ML) + 2 sorbety (GEL-SOR) = 22 pozycje");
  console.log("   Receptury:   5 (Mieszanka + 2 lody + 2 sorbety)");
  console.log("   Magazyn:     PZ-1/03/26 — surowce na stanie (woda bez PZ — zasób nieograniczony)");
}

main()
  .catch((e) => { console.error("❌ Błąd:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
