import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
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

main().catch(console.error).finally(() => prisma.$disconnect());
