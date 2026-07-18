import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const sesja = await prisma.sesje_Produkcji.findFirst({
    where: { numer_sesji: 'SP-001/07/26' },
    include: {
      zlecenia: {
        include: {
          receptura: {
            include: { asortyment_docelowy: true }
          }
        }
      }
    }
  });
  console.log(JSON.stringify(sesja, null, 2));
}
main().finally(() => prisma.$disconnect());
