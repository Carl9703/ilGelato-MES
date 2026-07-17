import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sesja = await prisma.sesja_Produkcyjna.findFirst({
    where: { numer_sesji: 'SP-001/07/26' }
  });
  console.log(sesja);
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
