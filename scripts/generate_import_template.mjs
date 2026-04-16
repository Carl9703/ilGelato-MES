// Generuje przykładowy plik Excel do importu asortymentu
// Uruchom: node scripts/generate_import_template.mjs

import { writeFileSync } from "fs";
import * as XLSX from "xlsx";

const headers = [
  "Kod towaru",
  "Nazwa",
  "Typ",
  "Jednostka miary",
  "Jednostka pomocnicza",
  "Przelicznik",
  "Wymaga daty waznosci",
  "Zasob nieograniczony",
  "Producent",
  "Zrodlo danych",
];

const exampleRows = [
  // Surowce
  ["MLK-001", "Mleko pełne 3,2%",         "Surowiec",    "L",   "",    "",    "TAK", "NIE", "Mlekovita",    ""],
  ["SMT-001", "Śmietana 36%",              "Surowiec",    "L",   "",    "",    "TAK", "NIE", "Mlekovita",    ""],
  ["CKR-001", "Cukier biały kryształ",     "Surowiec",    "kg",  "",    "",    "NIE", "NIE", "Krajowe",      "WŁASNE"],
  ["CKP-001", "Cukier puder",              "Surowiec",    "kg",  "",    "",    "NIE", "NIE", "",             ""],
  ["OWC-001", "Truskawki mrożone",         "Surowiec",    "kg",  "",    "",    "TAK", "NIE", "Frosta",       ""],
  ["OWC-002", "Mango mrożone",             "Surowiec",    "kg",  "",    "",    "TAK", "NIE", "Frosta",       ""],
  ["CHK-001", "Czekolada gorzka 70%",      "Surowiec",    "kg",  "",    "",    "TAK", "NIE", "Callebaut",    ""],
  ["ORL-001", "Orzechy laskowe",           "Surowiec",    "kg",  "",    "",    "TAK", "NIE", "Pellegrini",   ""],
  ["WAN-001", "Wanilia laska bourbon",     "Surowiec",    "szt", "",    "",    "TAK", "NIE", "Bourbon",      ""],
  ["WOD-001", "Woda z kranu",              "Surowiec",    "L",   "",    "",    "NIE", "TAK", "",             ""],
  // Opakowania
  ["OPK-001", "Pojemnik pozzetti 5L",      "Opakowanie",  "szt", "",    "",    "NIE", "NIE", "GelPack",      ""],
  ["OPK-002", "Kuweta plastikowa 1/3 GN",  "Opakowanie",  "szt", "",    "",    "NIE", "NIE", "GelPack",      ""],
  ["OPK-003", "Wieczko do pojemnika 5L",   "Opakowanie",  "szt", "",    "",    "NIE", "NIE", "GelPack",      ""],
  ["OPK-004", "Łyżeczka drewniana",        "Opakowanie",  "szt", "",    "",    "NIE", "NIE", "",             "WŁASNE"],
  // Półprodukty
  ["PPD-001", "Baza mleczna standard",     "Polprodukt",  "kg",  "",    "",    "TAK", "NIE", "",             ""],
  ["PPD-002", "Baza sorbetowa",            "Polprodukt",  "kg",  "",    "",    "TAK", "NIE", "",             ""],
  // Wyroby gotowe
  ["GEL-001", "Gelato truskawkowe",        "Wyrob_Gotowy","kg",  "szt", "1.5", "TAK", "NIE", "",             ""],
  ["GEL-002", "Gelato czekoladowe",        "Wyrob_Gotowy","kg",  "szt", "1.5", "TAK", "NIE", "",             ""],
  ["GEL-003", "Gelato waniliowe",          "Wyrob_Gotowy","kg",  "szt", "1.5", "TAK", "NIE", "",             ""],
  ["SOR-001", "Sorbet mango",              "Wyrob_Gotowy","kg",  "szt", "1.5", "TAK", "NIE", "",             ""],
];

// Informacja o dozwolonych wartościach (osobny arkusz)
const infoRows = [
  ["POLE",                     "WYMAGANE", "DOZWOLONE WARTOŚCI / FORMAT"],
  ["Kod towaru",               "TAK",      "Dowolny unikalny tekst, np. MLK-001"],
  ["Nazwa",                    "TAK",      "Dowolny tekst"],
  ["Typ",                      "TAK",      "Surowiec | Polprodukt | Wyrob_Gotowy | Opakowanie"],
  ["Jednostka miary",          "TAK",      "kg | L | szt | ml | g | opak"],
  ["Jednostka pomocnicza",     "nie",      "kg | L | szt | ml | g | opak  (lub puste)"],
  ["Przelicznik",              "nie",      "Liczba, np. 1.5  (ile JM pomocniczej = 1 JM główna)"],
  ["Wymaga daty waznosci",     "nie",      "TAK | NIE  (domyślnie: NIE)"],
  ["Zasob nieograniczony",     "nie",      "TAK | NIE  (domyślnie: NIE) — media jak woda z kranu"],
  ["Producent",                "nie",      "Dowolny tekst lub puste"],
  ["Zrodlo danych",            "nie",      "Dowolny tekst lub puste, np. WŁASNE, XMART"],
];

// Budujemy arkusz danych
const wsData = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);

// Szerokości kolumn
wsData["!cols"] = [
  { wch: 14 }, // Kod towaru
  { wch: 30 }, // Nazwa
  { wch: 15 }, // Typ
  { wch: 16 }, // Jednostka miary
  { wch: 20 }, // Jednostka pomocnicza
  { wch: 12 }, // Przelicznik
  { wch: 22 }, // Wymaga daty waznosci
  { wch: 20 }, // Zasob nieograniczony
  { wch: 18 }, // Producent
  { wch: 16 }, // Zrodlo danych
];

// Arkusz z opisem pól
const wsInfo = XLSX.utils.aoa_to_sheet(infoRows);
wsInfo["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 56 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsData, "Import");
XLSX.utils.book_append_sheet(wb, wsInfo, "Opis pól");

const outputPath = "public/import_asortyment_template.xlsx";
XLSX.writeFile(wb, outputPath);
console.log(`Plik zapisany: ${outputPath}`);
