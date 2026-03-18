import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Czyszczenie bazy danych...')

  await prisma.rezerwacje_Magazynowe.deleteMany({})
  await prisma.ruchy_Magazynowe.deleteMany({})
  await prisma.partie_Magazynowe.deleteMany({})
  await prisma.skladniki_Receptury.deleteMany({})
  await prisma.zlecenia_Produkcyjne.deleteMany({})
  await prisma.receptury.deleteMany({})
  await prisma.wartosci_Odzywcze.deleteMany({})
  await prisma.alergeny_Asortymentu.deleteMany({})
  await prisma.asortyment.deleteMany({})
  await prisma.dokumenty_Magazynowe.deleteMany({})
  await prisma.uzytkownicy.deleteMany({})

  await prisma.uzytkownicy.create({
    data: { login: 'admin', haslo: 'admin123' }
  })

  console.log('✅ Baza wyczyszczona.')
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
