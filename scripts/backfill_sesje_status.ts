import { PrismaClient } from '@prisma/client';

/**
 * Backfill pola Sesje_Produkcji.status dla danych sprzed wprowadzenia planera.
 *
 * Kolumna `status` została dodana wraz z planerem turnusu (commit 36a4c94).
 * `prisma db push` na starej bazie zakłada ją z domyślną wartością "Planowana"
 * dla WSZYSTKICH istniejących sesji — również tych dawno zrealizowanych.
 * Ten skrypt ustawia "Zrealizowana" dla sesji, których zlecenia są już zamknięte.
 *
 * Reguła (spójna z logiką wykonajSesjeProdukcji w server/routes/produkcja.ts):
 *   sesja "Planowana"  +  ma >=1 aktywne zlecenie
 *   +  żadne aktywne zlecenie nie jest "Planowane" ani "W_toku"
 *   +  >=1 aktywne zlecenie jest "Zrealizowane"
 *   =>  status := "Zrealizowana"
 *
 * Sesje faktycznie zaplanowane (świeże turnusy ze zleceniami "Planowane")
 * zostają bez zmian. Skrypt jest idempotentny — po przejściu nie ma już
 * sesji "Planowana" spełniających regułę.
 *
 * DRY_RUN=1  -> tylko podgląd, bez zapisu.
 */

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');

const OTWARTE = new Set(['Planowane', 'W_toku']);

async function main() {
  console.log(`Backfill statusów sesji produkcyjnych${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  const sesje = await prisma.sesje_Produkcji.findMany({
    where: { status: 'Planowana' },
    include: { zlecenia: { where: { czy_aktywne: true }, select: { status: true } } },
  });

  if (sesje.length === 0) {
    console.log('Brak sesji w statusie "Planowana" — nic do zrobienia.');
    return;
  }

  const doAktualizacji: string[] = [];
  for (const s of sesje) {
    const statusy = s.zlecenia.map((z) => z.status);
    const maZlecenia = statusy.length > 0;
    const maOtwarte = statusy.some((st) => OTWARTE.has(st));
    const maZrealizowane = statusy.includes('Zrealizowane');
    if (maZlecenia && !maOtwarte && maZrealizowane) {
      doAktualizacji.push(s.id);
      console.log(`  ${s.numer_sesji}: Planowana -> Zrealizowana (zlecenia: ${statusy.join(', ')})`);
    }
  }

  console.log(
    `Sesji "Planowana": ${sesje.length}, do przestawienia na "Zrealizowana": ${doAktualizacji.length}`,
  );

  if (!DRY_RUN && doAktualizacji.length > 0) {
    const r = await prisma.sesje_Produkcji.updateMany({
      where: { id: { in: doAktualizacji } },
      data: { status: 'Zrealizowana' },
    });
    console.log(`Zaktualizowano ${r.count} sesji.`);
  }
}

main()
  .catch((e) => {
    console.error('Błąd backfillu statusów sesji:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
