import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Czyszczenie bazy danych...')

  // Delete all data in reverse dependency order
  await prisma.wyniki_Kontroli.deleteMany({})
  await prisma.punkty_Kontrolne.deleteMany({})
  await prisma.rejestr_Przestojow.deleteMany({})
  await prisma.rezerwacje_Magazynowe.deleteMany({})
  await prisma.ruchy_Magazynowe.deleteMany({})
  await prisma.partie_Magazynowe.deleteMany({})
  await prisma.skladniki_Receptury.deleteMany({})
  await prisma.zlecenia_Produkcyjne.deleteMany({})
  await prisma.receptury.deleteMany({})
  await prisma.asortyment.deleteMany({})

  await prisma.uzytkownicy.deleteMany({})

  console.log('Baza wyczyszczona. Dodawanie konta użytkownika...')

  await prisma.uzytkownicy.create({
    data: {
      login: 'admin',
      haslo: 'admin123', // oczywiście testowe
    }
  })


  console.log('Dodawanie kartotek (Asortyment)...')

  // Surowce płynne
  const mleko = await prisma.asortyment.create({
    data: {
      kod_towaru: 'SUR-ML-32',
      nazwa: 'Mleko 3.2%',
      typ_asortymentu: 'Surowiec',
      jednostka_miary: 'L',
      jednostka_pomocnicza: 'kg',
      przelicznik_jednostki: 1.03, // np. 1 L = ~1.03 kg, choć bywa z mlekiem odwrotnie, zostawmy sztywno 1
      czy_wymaga_daty_waznosci: true
    }
  })

  const smietanka = await prisma.asortyment.create({
    data: {
      kod_towaru: 'SUR-SM-36',
      nazwa: 'Śmietanka 36%',
      typ_asortymentu: 'Surowiec',
      jednostka_miary: 'L',
      czy_wymaga_daty_waznosci: true
    }
  })

  // Surowce sypkie
  const cukier = await prisma.asortyment.create({
    data: {
      kod_towaru: 'SUR-CUK',
      nazwa: 'Cukier biały (worek 25kg)',
      typ_asortymentu: 'Surowiec',
      jednostka_miary: 'kg',
      czy_wymaga_daty_waznosci: true
    }
  })

  // Pasty
  const pastaPist = await prisma.asortyment.create({
    data: {
      kod_towaru: 'SUR-PAS-PIST',
      nazwa: 'Pasta Pistacjowa 100%',
      typ_asortymentu: 'Surowiec',
      jednostka_miary: 'kg',
      czy_wymaga_daty_waznosci: true
    }
  })
  
  // Dodatki
  const pistPraz = await prisma.asortyment.create({
    data: {
      kod_towaru: 'SUR-PIST-PRAZ',
      nazwa: 'Pistacje prażone i kruszone',
      typ_asortymentu: 'Surowiec',
      jednostka_miary: 'kg',
      czy_wymaga_daty_waznosci: true
    }
  })

  // Bazy
  const baza70 = await prisma.asortyment.create({
    data: {
      kod_towaru: 'POL-BAZ-70',
      nazwa: 'Baza Mleczna Neutralna',
      typ_asortymentu: 'Polprodukt',
      jednostka_miary: 'kg',
      czy_wymaga_daty_waznosci: true
    }
  })

  // Opakowania
  const kuweta = await prisma.asortyment.create({
    data: {
      kod_towaru: 'OP-KUW-5L',
      nazwa: 'Kuweta stalowa / plastikowa 5L',
      typ_asortymentu: 'Opakowanie',
      jednostka_miary: 'szt',
      czy_wymaga_daty_waznosci: false
    }
  })

  // Wyroby gotowe
  const gotowyPist = await prisma.asortyment.create({
    data: {
      kod_towaru: 'WG-LODY-PIST-5L',
      nazwa: 'Lody Pistacjowe Rzemieślnicze (Kuweta 5L)',
      typ_asortymentu: 'Wyrob_Gotowy',
      jednostka_miary: 'szt',
      czy_wymaga_daty_waznosci: true
    }
  })
  
  const gotowySmix = await prisma.asortyment.create({
    data: {
      kod_towaru: 'WG-LODY-SMIX-5L',
      nazwa: 'Lody Śmietankowe (Kuweta 5L)',
      typ_asortymentu: 'Wyrob_Gotowy',
      jednostka_miary: 'szt',
      czy_wymaga_daty_waznosci: true
    }
  })

  console.log('Dodawanie receptur i technologii...')

  // Receptura - Baza Mleczna
  const recBaza = await prisma.receptury.create({
    data: {
      id_asortymentu_docelowego: baza70.id,
      numer_wersji: 1,
      dni_trwalosci: 5, // 5 dni w chłodni po pasteryzacji
    }
  })

  // BOM dla 1 kg bazy
  await prisma.skladniki_Receptury.createMany({
    data: [
      { id_receptury: recBaza.id, id_asortymentu_skladnika: mleko.id, ilosc_wymagana: 0.650, czy_pomocnicza: false, procent_strat: 1 },
      { id_receptury: recBaza.id, id_asortymentu_skladnika: smietanka.id, ilosc_wymagana: 0.150, czy_pomocnicza: false, procent_strat: 1 },
      { id_receptury: recBaza.id, id_asortymentu_skladnika: cukier.id, ilosc_wymagana: 0.200, czy_pomocnicza: false, procent_strat: 0 },
    ]
  })

  await prisma.punkty_Kontrolne.createMany({
    data: [
       { id_receptury: recBaza.id, nazwa_parametru: "Temperatura pasteryzacji bazy", jednostka: "°C", wartosc_min: 85, wartosc_max: 95, czy_wymagany: true, kolejnosc: 1 },
       { id_receptury: recBaza.id, nazwa_parametru: "Gęstość (Brix)", jednostka: "%", wartosc_min: 25, wartosc_max: 28, czy_wymagany: true, kolejnosc: 2 },
    ]
  })

  // Receptura - Lody Pistacjowe
  const recPist = await prisma.receptury.create({
    data: {
      id_asortymentu_docelowego: gotowyPist.id,
      numer_wersji: 1,
      dni_trwalosci: 365, // 1 rok shelf-life dla lodów w mroźni
    }
  })

  // Składniki dla Lodów Pistacjowych
  // BOM - na uzyskanie 1 kuwety
  await prisma.skladniki_Receptury.createMany({
    data: [
      { id_receptury: recPist.id, id_asortymentu_skladnika: mleko.id, ilosc_wymagana: 2.500, czy_pomocnicza: false, procent_strat: 2 },
      { id_receptury: recPist.id, id_asortymentu_skladnika: smietanka.id, ilosc_wymagana: 0.800, czy_pomocnicza: false, procent_strat: 1 },
      { id_receptury: recPist.id, id_asortymentu_skladnika: cukier.id, ilosc_wymagana: 0.600, czy_pomocnicza: false, procent_strat: 0 },
      { id_receptury: recPist.id, id_asortymentu_skladnika: baza70.id, ilosc_wymagana: 0.150, czy_pomocnicza: false, procent_strat: 0 },
      { id_receptury: recPist.id, id_asortymentu_skladnika: pastaPist.id, ilosc_wymagana: 0.450, czy_pomocnicza: false, procent_strat: 0 },
      { id_receptury: recPist.id, id_asortymentu_skladnika: pistPraz.id, ilosc_wymagana: 0.100, czy_pomocnicza: false, procent_strat: 0 },
      { id_receptury: recPist.id, id_asortymentu_skladnika: kuweta.id, ilosc_wymagana: 1.000, czy_pomocnicza: false, procent_strat: 0 },
    ]
  })

  await prisma.punkty_Kontrolne.createMany({
    data: [
       { id_receptury: recPist.id, nazwa_parametru: "Temperatura Pasteryzacji", jednostka: "°C", wartosc_min: 85, wartosc_max: 90, czy_wymagany: true, kolejnosc: 1 },
       { id_receptury: recPist.id, nazwa_parametru: "Waga końcowa kuwety brutto", jednostka: "kg", wartosc_min: 4.5, wartosc_max: 4.8, czy_wymagany: true, kolejnosc: 2 },
    ]
  })

  // Receptura - Lody Śmietankowe
  const recSmix = await prisma.receptury.create({
    data: {
      id_asortymentu_docelowego: gotowySmix.id,
      numer_wersji: 1,
      dni_trwalosci: 365,
    }
  })

  await prisma.skladniki_Receptury.createMany({
    data: [
      { id_receptury: recSmix.id, id_asortymentu_skladnika: mleko.id, ilosc_wymagana: 3.000, czy_pomocnicza: false, procent_strat: 2 },
      { id_receptury: recSmix.id, id_asortymentu_skladnika: smietanka.id, ilosc_wymagana: 1.200, czy_pomocnicza: false, procent_strat: 1 },
      { id_receptury: recSmix.id, id_asortymentu_skladnika: cukier.id, ilosc_wymagana: 0.700, czy_pomocnicza: false, procent_strat: 0 },
      { id_receptury: recSmix.id, id_asortymentu_skladnika: baza70.id, ilosc_wymagana: 0.200, czy_pomocnicza: false, procent_strat: 0 },
      { id_receptury: recSmix.id, id_asortymentu_skladnika: kuweta.id, ilosc_wymagana: 1.000, czy_pomocnicza: false, procent_strat: 0 },
    ]
  })

  await prisma.punkty_Kontrolne.createMany({
    data: [
       { id_receptury: recSmix.id, nazwa_parametru: "Temperatura Dojrzewania Bazy", jednostka: "°C", wartosc_min: 2, wartosc_max: 6, czy_wymagany: true, kolejnosc: 1 },
    ]
  })

  console.log('✅ Baza zasilona świeżymi danymi testowymi!')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
