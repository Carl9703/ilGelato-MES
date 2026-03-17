import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkUnits() {
  const mleko = await prisma.asortyment.findFirst({
    where: { nazwa: { contains: "Mleko" } }
  });

  if (!mleko) {
    console.log("Nie znaleziono mleka.");
    return;
  }

  console.log("Asortyment Mleko:", {
    nazwa: mleko.nazwa,
    jednostka_miary: mleko.jednostka_miary,
    jednostka_pomocnicza: mleko.jednostka_pomocnicza,
    przelicznik: mleko.przelicznik_jednostki
  });

  const skladniki = await prisma.skladniki_Receptury.findMany({
    where: { id_asortymentu_skladnika: mleko.id },
    include: { receptura: { include: { asortyment_docelowy: true } } }
  });

  console.log("\nSkladniki Receptury z mlekiem:");
  skladniki.forEach(s => {
    console.log({
      receptura_na: s.receptura.asortyment_docelowy.nazwa,
      ilosc_wymagana: s.ilosc_wymagana,
      czy_pomocnicza: s.czy_pomocnicza
    });
  });

  const zlecenia = await prisma.zlecenia_Produkcyjne.findMany({
    where: { status: "Planowane" },
    include: { receptura: { include: { asortyment_docelowy: true } } }
  });

  console.log("\nPlanowane Zlecenia:");
  zlecenia.forEach(z => {
      console.log({
          numer: z.numer_zlecenia,
          produkt: z.receptura.asortyment_docelowy.nazwa,
          ilosc_wyrobu: z.planowana_ilosc_wyrobu
      });
  });
}

checkUnits()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
