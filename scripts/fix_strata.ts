/**
 * Skrypt naprawczy: dla istniejących partii półproduktu które mają dodatni stan
 * po zakończeniu sesji produkcyjnej (wyroby już zrealizowane), generuje brakujące RW straty.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const prisma = new PrismaClient();

async function generateDocNumber(prefix: string): Promise<string> {
  const date = new Date();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  const suffix = `/${month}/${year}`;
  const existing = await prisma.ruchy_Magazynowe.findMany({
    where: { referencja_dokumentu: { startsWith: `${prefix}-`, endsWith: suffix } },
    select: { referencja_dokumentu: true }
  });
  const also = await prisma.dokumenty_Magazynowe.findMany({
    where: { referencja: { startsWith: `${prefix}-`, endsWith: suffix } },
    select: { referencja: true }
  });
  let maxNum = 0;
  const allRefs = [
    ...existing.map(r => r.referencja_dokumentu),
    ...also.map(r => r.referencja)
  ];
  for (const ref of allRefs) {
    if (!ref) continue;
    const m = ref.match(new RegExp(`^${prefix}-(\\d+)`));
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  }
  return `${prefix}-${(maxNum + 1).toString()}${suffix}`;
}

async function main() {
  // Znajdź wszystkie partię Półproduktu z aktywnym stanem > 0.001
  const partie = await prisma.partie_Magazynowe.findMany({
    include: {
      asortyment: true,
      ruchy_magazynowe: { where: { czy_aktywne: true }, orderBy: { utworzono_dnia: 'asc' } }
    },
    where: { asortyment: { typ_asortymentu: "Polprodukt" }, czy_aktywne: true }
  });

  const user = await prisma.uzytkownicy.findFirst();
  if (!user) throw new Error("Brak uzytkownika");

  const log: string[] = [];

  for (const p of partie) {
    const stan = p.ruchy_magazynowe.reduce((s: number, r: any) => s + r.ilosc, 0);
    if (stan <= 0.001) continue;

    // Sprawdz czy są jakiekolwiek zużycia etapu 2 (wyroby) powiązane z tą partią
    const zuzciaEtap2 = p.ruchy_magazynowe.filter((r: any) => r.ilosc < 0);
    if (zuzciaEtap2.length === 0) {
      log.push(`POMIJAM ${p.numer_partii}: brak zużyć (partia może być w trakcie produkcji)`);
      continue;
    }

    log.push(`NAPRAWIAM: ${p.numer_partii} | ${p.asortyment.nazwa} | stan = ${stan.toFixed(3)} kg`);

    // Pobierz cenę z PW
    const pwRuch = p.ruchy_magazynowe.find((r: any) => r.ilosc > 0);
    const cenaBazy = pwRuch?.cena_jednostkowa ?? 0;

    // Pobierz id zlecenia bazy (z PW ruchu jeśli jest)
    const idZlecenia = pwRuch?.id_zlecenia ?? null;

    const rwStrataNr = await generateDocNumber("RW");
    await prisma.ruchy_Magazynowe.create({
      data: {
        id_partii: p.id,
        id_zlecenia: idZlecenia,
        typ_ruchu: "Strata",
        ilosc: -stan,
        cena_jednostkowa: cenaBazy,
        referencja_dokumentu: rwStrataNr,
        id_uzytkownika: user.id,
      },
    });

    log.push(`  => Utworzono RW straty: ${rwStrataNr} | ilosc = ${stan.toFixed(3)} | zlecenie = ${idZlecenia}`);
  }

  fs.writeFileSync("scripts/fix_strata_log.txt", log.join("\n"), "utf8");
  console.log(log.join("\n"));
  console.log("\nZakończono.");
}

main().finally(() => prisma.$disconnect());
