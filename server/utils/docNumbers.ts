export async function generateDocNumber(tx: any, prefix: string) {
  const date = new Date();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  const suffix = `/${month}/${year}`;

  // For PZ/WZ, also check Dokumenty_Magazynowe headers (includes BUFOR docs)
  let maxNum = 0;
  if (prefix === "PZ" || prefix === "WZ") {
    const headers = await tx.dokumenty_Magazynowe.findMany({
      where: { referencja: { endsWith: suffix }, typ: prefix }
    });
    for (const h of headers) {
      const match = h.referencja.match(new RegExp(`^${prefix}-(\\d+)/${month}/${year}$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  } else {
    const ruchy = await tx.ruchy_Magazynowe.findMany({
      where: { referencja_dokumentu: { endsWith: suffix } }
    });
    for (const r of ruchy) {
      if (r.referencja_dokumentu && r.referencja_dokumentu.startsWith(`${prefix}-`)) {
        const match = r.referencja_dokumentu.match(new RegExp(`^${prefix}-(\\d+)/${month}/${year}$`));
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
  }
  return `${prefix}-${maxNum + 1}${suffix}`;
}

export async function generateSesjaNumber(tx: any) {
  const date = new Date();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  const suffix = `/${month}/${year}`;
  const sesje = await tx.sesje_Produkcji.findMany({ where: { numer_sesji: { endsWith: suffix } } });
  let maxNum = 0;
  for (const s of sesje) {
    const match = s.numer_sesji.match(new RegExp(`^SP-(\\d+)/${month}/${year}$`));
    if (match) { const num = parseInt(match[1], 10); if (num > maxNum) maxNum = num; }
  }
  return `SP-${(maxNum + 1).toString().padStart(3, '0')}${suffix}`;
}

export async function generateZlecenieNumber(tx: any) {
  const date = new Date();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  const prefix = 'ZP';
  const suffix = `/${month}/${year}`;

  const zlecenia = await tx.zlecenia_Produkcyjne.findMany({
    where: {
      czy_aktywne: true,
      numer_zlecenia: {
        endsWith: suffix
      }
    }
  });

  let maxNum = 0;
  for (const z of zlecenia) {
    if (z.numer_zlecenia && z.numer_zlecenia.startsWith(`${prefix}-`)) {
      const match = z.numer_zlecenia.match(new RegExp(`^${prefix}-(\\d+)/${month}/${year}$`));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }

  return `${prefix}-${(maxNum + 1).toString().padStart(4, '0')}${suffix}`;
}
