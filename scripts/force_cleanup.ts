import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
  console.log('--- ROZPOCZYNAM CZYSZCZENIE REZERWACJI ---');
  
  // Usuwamy rezerwacje, które należą do zleceń anulowanych lub nieaktywnych
  const result = await prisma.rezerwacje_Magazynowe.deleteMany({
    where: {
      OR: [
        { zlecenie: { czy_aktywne: false } },
        { zlecenie: { status: 'Anulowane' } }
      ]
    }
  });

  console.log(`Usunięto ${result.count} osieroconych rezerwacji.`);
}

cleanup().catch(console.error).finally(() => prisma.$disconnect());
