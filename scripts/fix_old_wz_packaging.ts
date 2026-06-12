import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.dokumenty_Magazynowe.findMany({
    where: { typ: 'WZ', status: 'Zatwierdzony' },
    orderBy: { utworzono_dnia: 'asc' }
  });

  let fixedCount = 0;

  for (const header of docs) {
    if (!header.pozycje_json) continue;

    // Check if packaging movements already exist for this document
    const existingRuchy = await prisma.ruchy_Opakowan_Zwrotnych.findFirst({
      where: { referencja_dokumentu: header.referencja }
    });

    if (existingRuchy) {
      continue; // Already processed
    }

    try {
      const pozycje = JSON.parse(header.pozycje_json) as any[];
      const countsToCreate = new Map<string, number>();

      for (const p of pozycje) {
        if (!p.sztuki || typeof p.sztuki !== "object") continue;
        
        const partia = await prisma.partie_Magazynowe.findUnique({ where: { id: p.id_partii } });
        if (!partia?.opakowania_json) continue;
        const opMap = JSON.parse(partia.opakowania_json) as any[];
        
        for (const [label, count] of Object.entries(p.sztuki)) {
          const ilosc = Number(count);
          if (ilosc <= 0) continue;

          const match = label.match(/^(.*)\s+\((\d+(?:[\.,]\d+)?)\s*kg\)$/);
          if (!match) continue;
          const nazwaNominalna = match[1].trim();
          const wagaNominalna = parseFloat(match[2].replace(',', '.'));
          
          // Using .trim() here, exactly the fix we made
          const matched = opMap.find(o => o.nazwa?.trim() === nazwaNominalna && Math.abs(o.waga_kg - wagaNominalna) < 0.01);
          if (matched && matched.id_asortymentu) {
            countsToCreate.set(matched.id_asortymentu, (countsToCreate.get(matched.id_asortymentu) || 0) + ilosc);
          }
        }
      }

      let createdAny = false;
      for (const [id_asort, total] of countsToCreate.entries()) {
        const packagingAsort = await prisma.asortyment.findUnique({ where: { id: id_asort } });
        if (packagingAsort?.czy_zwrotne) {
          await prisma.ruchy_Opakowan_Zwrotnych.create({
            data: {
              id_asortymentu: id_asort,
              ilosc: total,
              typ_ruchu: "WYDA",
              id_kontrahenta: header.id_kontrahenta,
              referencja_dokumentu: header.referencja,
              id_uzytkownika: header.id_uzytkownika_zatwierdzenia || header.id_uzytkownika_utworzenia,
              uwagi: `Nadrabianie automatu WZ: ${header.referencja}`,
              utworzono_dnia: header.data_zatwierdzenia || header.utworzono_dnia
            }
          });
          createdAny = true;
        }
      }
      
      if (createdAny) fixedCount++;
      
    } catch (e) {
      console.error(`Błąd podczas naprawy WZ ${header.referencja}:`, e);
    }
  }

  console.log(`Zakończono. Naprawiono (wygenerowano braki) dla ${fixedCount} dokumentów WZ.`);
}

main().finally(() => prisma.$disconnect());
