import { Router } from "express";
import { prisma } from "../db";
import bcrypt from "bcryptjs";
import { generateZlecenieNumber } from "../utils/docNumbers";

const router = Router();

router.get("/setup", async (req, res) => {
  const count = await prisma.uzytkownicy.count();
  if (count > 0) {
    return res.send("✅ System już skonfigurowany — użytkownik istnieje.");
  }
  const hashed = await bcrypt.hash("admin", 10);
  await prisma.uzytkownicy.create({ data: { login: "admin", haslo: hashed } });
  res.send("✅ Utworzono użytkownika admin / admin. Możesz teraz korzystać z systemu.");
});

router.post("/reset", async (req, res) => {
  const { confirm } = req.body;
  if (confirm !== "RESET_CONFIRMED") {
    return res.status(400).json({ error: "Wymagane potwierdzenie: { confirm: 'RESET_CONFIRMED' }" });
  }
  const resetToken = process.env.RESET_SECRET;
  if (!resetToken) {
    return res.status(503).json({ error: "Endpoint niedostępny — ustaw zmienną środowiskową RESET_SECRET." });
  }
  const authHeader = req.headers["x-reset-token"];
  if (authHeader !== resetToken) {
    return res.status(403).json({ error: "Brak autoryzacji. Wymagany nagłówek X-Reset-Token." });
  }
  try {
    await prisma.$transaction(async (tx) => {
      await (tx as any).sesja_Robocza_Log?.deleteMany();
      await (tx as any).sesja_Robocza?.deleteMany();
      await (tx as any).pozycje_Sesji_Gelato?.deleteMany();
      await (tx as any).sesje_Produkcji_Gelato?.deleteMany();
      await (tx as any).sesje_Produkcji?.deleteMany();
      await (tx as any).opakowania_Wyrobowe?.deleteMany();
      await (tx as any).wartosci_Odzywcze?.deleteMany();
      await (tx as any).alergeny_Asortymentu?.deleteMany();
      await tx.rezerwacje_Magazynowe.deleteMany();
      await tx.ruchy_Magazynowe.deleteMany();
      await tx.skladniki_Receptury.deleteMany();
      await tx.zlecenia_Produkcyjne.deleteMany();
      await tx.receptury.deleteMany();
      await tx.partie_Magazynowe.deleteMany();
      await (tx as any).dokumenty_Magazynowe?.deleteMany();
      await (tx as any).kontrahenci?.deleteMany();
      await tx.asortyment.deleteMany();
      await tx.uzytkownicy.deleteMany();
    });
    res.json({ success: true, message: "Baza wyczyszczona. Odśwież stronę." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/init", async (req, res) => {
  try {
    let user = await prisma.uzytkownicy.findFirst();
    if (!user) {
      const hashed = await bcrypt.hash("admin", 10);
      user = await prisma.uzytkownicy.create({
        data: { login: "admin", haslo: hashed },
      });
    }

    const oldZlecenia = await prisma.zlecenia_Produkcyjne.findMany({
      where: {
        OR: [
          { numer_zlecenia: { startsWith: "ZLE/" } },
          { numer_zlecenia: { startsWith: "ZLE-" } }
        ]
      }
    });

    if (oldZlecenia.length > 0) {
      for (const z of oldZlecenia) {
        const newNumber = await generateZlecenieNumber(prisma);
        await prisma.zlecenia_Produkcyjne.update({
          where: { id: z.id },
          data: { numer_zlecenia: newNumber }
        });
      }
      console.log(`Zaktualizowano numerację dla ${oldZlecenia.length} starych zleceń.`);
    }

    res.json({ user, migratedZlecenia: oldZlecenia.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Błąd inicjalizacji użytkownika" });
  }
});

export default router;
