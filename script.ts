import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const idsToDelete = [
    "17a0855e-9f73-4358-a1c8-7b52475e94dd",
    "53404830-52a6-40a0-ada3-1ea7f8d9d126",
    "849c6c23-4f47-49ec-aa1b-41f575ea6457"
  ];
  
  await prisma.partie_Magazynowe.deleteMany({
    where: { id: { in: idsToDelete } }
  });
  
  console.log("Deleted orphan partie successfully.");
}

main();
