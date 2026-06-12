import { Router } from "express";
import { prisma } from "../db";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const kontrahenci = await prisma.kontrahenci.findMany({
      where: { czy_aktywne: true },
      orderBy: { nazwa: "asc" },
    });
    res.json(kontrahenci);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { kod, nazwa, adres } = req.body;
    if (!kod?.trim() || !nazwa?.trim()) return res.status(400).json({ error: "Kod i nazwa są wymagane" });
    const k = await prisma.kontrahenci.create({ data: { kod: kod.trim(), nazwa: nazwa.trim(), adres: adres?.trim() || null } });
    res.json(k);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(400).json({ error: "Kontrahent z tym kodem już istnieje" });
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { kod, nazwa, adres } = req.body;
    if (!kod?.trim() || !nazwa?.trim()) return res.status(400).json({ error: "Kod i nazwa są wymagane" });
    const k = await prisma.kontrahenci.update({
      where: { id: req.params.id },
      data: { kod: kod.trim(), nazwa: nazwa.trim(), adres: adres?.trim() || null },
    });
    res.json(k);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(400).json({ error: "Kontrahent z tym kodem już istnieje" });
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await prisma.kontrahenci.update({ where: { id: req.params.id }, data: { czy_aktywne: false } });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
