import { Router } from "express";
import { prisma } from "../db";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const grupy = await (prisma as any).grupy_Towarowe.findMany({
      where: { czy_aktywne: true },
      include: { podgrupy: { where: { czy_aktywne: true }, orderBy: { kolejnosc: "asc" } } },
      orderBy: { kolejnosc: "asc" }
    });
    res.json(grupy.filter((g: any) => !g.id_grupy_nadrzednej));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/", async (req, res) => {
  try {
    const { kod, nazwa, id_grupy_nadrzednej, kolejnosc } = req.body;
    if (!kod?.trim() || !nazwa?.trim()) return res.status(400).json({ error: "Kod i nazwa są wymagane" });
    const grp = await (prisma as any).grupy_Towarowe.create({
      data: { kod: kod.trim().toUpperCase(), nazwa: nazwa.trim(), id_grupy_nadrzednej: id_grupy_nadrzednej || null, kolejnosc: kolejnosc || 0 }
    });
    res.json(grp);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(400).json({ error: "Grupa z tym kodem już istnieje" });
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { kod, nazwa, kolejnosc, id_grupy_nadrzednej } = req.body;
    if (!kod?.trim() || !nazwa?.trim()) return res.status(400).json({ error: "Kod i nazwa są wymagane" });
    const grp = await (prisma as any).grupy_Towarowe.update({
      where: { id: req.params.id },
      data: { kod: kod.trim().toUpperCase(), nazwa: nazwa.trim(), kolejnosc: kolejnosc ?? 0, id_grupy_nadrzednej: id_grupy_nadrzednej || null }
    });
    res.json(grp);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(400).json({ error: "Grupa z tym kodem już istnieje" });
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const podgrupy = await (prisma as any).grupy_Towarowe.count({
      where: { id_grupy_nadrzednej: req.params.id, czy_aktywne: true }
    });
    if (podgrupy > 0) return res.status(409).json({ error: `Nie można usunąć grupy – ma ${podgrupy} aktywnych podgrup. Usuń je najpierw.` });
    const asortyment = await prisma.asortyment.count({ where: { id_grupy: req.params.id, czy_aktywne: true } });
    if (asortyment > 0) return res.status(409).json({ error: `Nie można usunąć grupy – jest przypisana do ${asortyment} pozycji asortymentu.` });
    await (prisma as any).grupy_Towarowe.update({ where: { id: req.params.id }, data: { czy_aktywne: false } });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
