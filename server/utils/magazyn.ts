import { prisma } from "../db";

export async function getBuforWzByPartia(partieIds?: string[]): Promise<Map<string, number>> {
  const buforRefs = (await prisma.dokumenty_Magazynowe.findMany({
    where: { status: "Bufor", typ: { in: ["WZ", "RW"] } },
    select: { referencja: true }
  })).map(d => d.referencja);
  if (buforRefs.length === 0) return new Map();
  const where: any = { referencja_dokumentu: { in: buforRefs }, czy_aktywne: false, typ_ruchu: { in: ["WZ", "RW"] } };
  if (partieIds) where.id_partii = { in: partieIds };
  const ruchy = await prisma.ruchy_Magazynowe.findMany({ where, select: { id_partii: true, ilosc: true } });
  const map = new Map<string, number>();
  for (const r of ruchy) map.set(r.id_partii, (map.get(r.id_partii) || 0) + Math.abs(r.ilosc));
  return map;
}
