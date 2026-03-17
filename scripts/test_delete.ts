import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testDelete() {
  console.log('--- TEST USUWANIA ZLECENIA ---');
  
  // 1. Znajdź jakąś recepturę
  const rec = await prisma.receptury.findFirst();
  if (!rec) { console.log('Brak receptury'); return; }

  // 2. Utwórz zlecenie
  const zlecenie = await prisma.zlecenia_Produkcyjne.create({
    data: {
      id_receptury: rec.id,
      planowana_ilosc_wyrobu: 1,
      status: 'Planowane'
    }
  });
  console.log(`Utworzono zlecenie: ${zlecenie.id}`);

  // 3. Dodaj fejkową rezerwację
  const partia = await prisma.partie_Magazynowe.findFirst();
  if (partia) {
    await prisma.rezerwacje_Magazynowe.create({
      data: {
        id_partii: partia.id,
        id_zlecenia: zlecenie.id,
        ilosc_zarezerwowana: 10
      }
    });
    console.log('Dodano rezerwację.');
  }

  // 4. Spróbuj usunąć przez API (symulacja logiki serwera)
  const id = zlecenie.id;
  await prisma.$transaction(async (tx) => {
    const deletedRes = await tx.rezerwacje_Magazynowe.deleteMany({
      where: { id_zlecenia: id }
    });
    console.log(`Usunięto rezerwacji: ${deletedRes.count}`);

    await tx.zlecenia_Produkcyjne.update({
      where: { id },
      data: { czy_aktywne: false, status: 'Anulowane' }
    });
  });

  // 5. Sprawdź czy zniknęło
  const resCount = await prisma.rezerwacje_Magazynowe.count({ where: { id_zlecenia: id } });
  console.log(`Pozostało rezerwacji: ${resCount}`);
}

testDelete().catch(console.error).finally(() => prisma.$disconnect());
