/**
 * Jednorazowy backfill po dodaniu pola `status` do `Sesje_Produkcji`.
 *
 * Wszystkie sesje sprzed wprowadzenia planera powstawały od razu jako
 * zrealizowane (stary `POST /api/produkcja/sesja` tworzył sesję razem z ruchami
 * magazynowymi). Domyślna wartość nowego pola to "Planowana", więc istniejące
 * rekordy trzeba przestawić na "Zrealizowana".
 *
 * Uruchomienie:  npx tsx prisma/backfill-status-sesji.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const doPoprawy = await prisma.sesje_Produkcji.findMany({
    where: { status: "Planowana" },
    select: { id: true, numer_sesji: true },
  });

  if (doPoprawy.length === 0) {
    console.log("Brak sesji do poprawy — wszystkie mają już właściwy status.");
    return;
  }

  console.log(`Do oznaczenia jako "Zrealizowana": ${doPoprawy.length} sesji`);
  for (const s of doPoprawy) console.log(`  - ${s.numer_sesji}`);

  const wynik = await prisma.sesje_Produkcji.updateMany({
    where: { status: "Planowana" },
    data: { status: "Zrealizowana" },
  });

  console.log(`Zaktualizowano: ${wynik.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
