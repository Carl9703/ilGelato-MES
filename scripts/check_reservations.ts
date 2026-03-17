import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const reservations = await prisma.rezerwacje_Magazynowe.findMany({
    where: { status: 'Aktywna' },
    include: {
      zlecenie: {
        include: {
          receptura: {
            include: {
              asortyment_docelowy: true
            }
          }
        }
      },
      partia: {
        include: {
          asortyment: true
        }
      }
    }
  });

  console.log('--- AKTYWNE REZERWACJE ---');
  reservations.forEach(r => {
    console.log(`ZP: ${r.zlecenie.numer_zlecenia || r.zlecenie.id} (Status: ${r.zlecenie.status}, Aktywne: ${r.zlecenie.czy_aktywne})`);
    console.log(`  Produkt: ${r.zlecenie.receptura.asortyment_docelowy.nazwa} (Ilość: ${r.zlecenie.planowana_ilosc_wyrobu})`);
    console.log(`  Surowiec: ${r.partia.asortyment.nazwa}`);
    console.log(`  Ilość zarezerwowana: ${r.ilosc_zarezerwowana} ${r.partia.asortyment.jednostka_miary}`);
    console.log('---------------------------');
  });

  const orphaned = await prisma.rezerwacje_Magazynowe.findMany({
    where: {
      OR: [
        { zlecenie: { czy_aktywne: false } },
        { zlecenie: { status: 'Anulowane' } }
      ]
    }
  });

  if (orphaned.length > 0) {
    console.log(`Znaleziono ${orphaned.length} osieroconych rezerwacji.`);
    // await prisma.rezerwacje_Magazynowe.deleteMany({ where: { id: { in: orphaned.map(o => o.id) } } });
    // console.log('Usunięto osierocone rezerwacje.');
  } else {
    console.log('Nie znaleziono osieroconych rezerwacji.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
