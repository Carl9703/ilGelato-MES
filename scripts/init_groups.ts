import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for required product groups...');
  
  const kod = 'GEL-KUB';
  const nazwa = 'Kubeczki';
  
  const existingGroup = await prisma.grupy_Towarowe.findUnique({
    where: { kod }
  });
  
  if (!existingGroup) {
    console.log(`Group ${kod} not found. Creating it...`);
    await prisma.grupy_Towarowe.create({
      data: {
        kod,
        nazwa,
        czy_aktywne: true,
      }
    });
    console.log(`Successfully created group: ${kod} - ${nazwa}`);
  } else {
    console.log(`Group ${kod} already exists.`);
  }
}

main()
  .catch((e) => {
    console.error('Error initializing groups:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
