import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Rozpoczynam czyszczenie bazy danych z dokumentów, zleceń i sesji...");

  await prisma.$transaction(async (tx) => {
    // Odwrócona kolejność ze względu na relacje kluczy obcych
    
    // 1. Opakowania wyrobowe (zależne od sesji, WZ, partii)
    const delOpakowania = await tx.opakowania_Wyrobowe.deleteMany();
    
    // 2. Pozycje Sesji Gelato (zależne od sesji, partii)
    const delPozSesji = await tx.pozycje_Sesji_Gelato.deleteMany();
    
    // 3. Sesje Produkcji Gelato
    const delSesjeG = await tx.sesje_Produkcji_Gelato.deleteMany();
    
    // 4. Rezerwacje Magazynowe (zależne od zleceń i partii)
    const delRezerwacje = await tx.rezerwacje_Magazynowe.deleteMany();
    
    // 5. Ruchy Magazynowe (zależne od dokumentów, zleceń, partii)
    const delRuchy = await tx.ruchy_Magazynowe.deleteMany();
    
    // 6. Zlecenia Produkcyjne (zależne od sesji wieloetapowych)
    const delZlecenia = await tx.zlecenia_Produkcyjne.deleteMany();
    
    // 7. Wieloetapowe Sesje Produkcji
    const delSesje = await tx.sesje_Produkcji.deleteMany();
    
    // 8. Nagłówki Dokumentów Magazynowych (PZ, WZ)
    const delDokumenty = await tx.dokumenty_Magazynowe.deleteMany();
    
    // 9. Partie Magazynowe (tworzone przez dokumenty np. PZ, PW)
    // Samo usunięcie ruchów by je wyzerowało, ale chcemy mieć czysty system
    const delPartie = await tx.partie_Magazynowe.deleteMany();

    // Dodatkowo: wyczyszczenie sesji roboczych (wizardy / drafty)
    await tx.sesja_Robocza_Log.deleteMany().catch(() => {}); // catch w razie gdyby tabeli nie było
    await tx.sesja_Robocza.deleteMany().catch(() => {});

    console.log("-----------------------------------------");
    console.log("Pomyślnie usunięto dane transakcyjne:");
    console.log(`- Dokumenty magazynowe:  ${delDokumenty.count}`);
    console.log(`- Zlecenia produkcyjne:  ${delZlecenia.count}`);
    console.log(`- Ruchy magazynowe:      ${delRuchy.count}`);
    console.log(`- Partie magazynowe:     ${delPartie.count}`);
    console.log(`- Rezerwacje magazynowe: ${delRezerwacje.count}`);
    console.log(`- Opakowania:            ${delOpakowania.count}`);
    console.log(`- Sesje Gelato:          ${delSesjeG.count}`);
    console.log(`- Sesje Produkcyjne:     ${delSesje.count}`);
    console.log("-----------------------------------------");
  });

  console.log("Czyszczenie bazy z dokumentów zakończone! (Zostawiono słowniki: asortyment, kontrahenci, receptury, użytkownicy, itd.)");
}

main()
  .catch((e) => {
    console.error("Wystąpił błąd podczas czyszczenia bazy:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
