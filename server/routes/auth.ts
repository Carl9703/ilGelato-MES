import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma, prismaProdukcja, prismaTest } from "../db";
import { JWT_SECRET, JWT_EXPIRES } from "../config";
import { generateZlecenieNumber } from "../utils/docNumbers";

const router = Router();

router.post("/login", async (req, res) => {
  const { login, haslo, baza } = req.body;
  if (!login || !haslo) {
    return res.status(400).json({ error: "Podaj login i hasło" });
  }
  const selectedBaza: "prod" | "test" = baza === "test" ? "test" : "prod";
  const db = selectedBaza === "test" ? prismaTest : prismaProdukcja;
  try {
    const user = await db.uzytkownicy.findUnique({ where: { login } });
    if (!user) {
      return res.status(401).json({ error: "Nieprawidłowy login lub hasło" });
    }
    if (!user.czy_aktywne) {
      return res.status(401).json({ error: "Konto zostało zablokowane" });
    }
    let valid = false;
    if (user.haslo.startsWith("$2b$") || user.haslo.startsWith("$2a$")) {
      valid = await bcrypt.compare(haslo, user.haslo);
    } else {
      valid = user.haslo === haslo;
      if (valid) {
        const hashed = await bcrypt.hash(haslo, 10);
        await db.uzytkownicy.update({ where: { id: user.id }, data: { haslo: hashed } });
      }
    }
    if (!valid) {
      return res.status(401).json({ error: "Nieprawidłowy login lub hasło" });
    }
    const token = jwt.sign({ userId: user.id, login: user.login, baza: selectedBaza }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, login: user.login, baza: selectedBaza });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/me", (req, res) => {
  res.json({ userId: (req as any).userId, login: (req as any).userLogin });
});

router.get("/pdf-token", (req, res) => {
  const token = jwt.sign(
    { userId: (req as any).userId, login: (req as any).userLogin, baza: (req as any).baza, scope: "pdf" },
    JWT_SECRET,
    { expiresIn: "1m" }
  );
  res.json({ token });
});

router.post("/change-password", async (req, res) => {
  const { stare_haslo, nowe_haslo } = req.body;
  if (!stare_haslo || !nowe_haslo) {
    return res.status(400).json({ error: "Podaj stare i nowe hasło" });
  }
  if (nowe_haslo.length < 4) {
    return res.status(400).json({ error: "Nowe hasło musi mieć co najmniej 4 znaki" });
  }
  try {
    const user = await prisma.uzytkownicy.findUnique({ where: { id: (req as any).userId } });
    if (!user) return res.status(404).json({ error: "Użytkownik nie znaleziony" });
    let valid = false;
    if (user.haslo.startsWith("$2b$") || user.haslo.startsWith("$2a$")) {
      valid = await bcrypt.compare(stare_haslo, user.haslo);
    } else {
      valid = user.haslo === stare_haslo;
    }
    if (!valid) return res.status(401).json({ error: "Stare hasło jest nieprawidłowe" });
    const hashed = await bcrypt.hash(nowe_haslo, 10);
    await prisma.uzytkownicy.update({ where: { id: user.id }, data: { haslo: hashed } });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/users", async (req, res) => {
  try {
    const users = await prisma.uzytkownicy.findMany({
      select: { id: true, login: true, czy_aktywne: true, utworzono_dnia: true }
    });
    res.json(users);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/users", async (req, res) => {
  const { login, haslo } = req.body;
  if (!login || !haslo) return res.status(400).json({ error: "Podaj login i hasło" });
  if (haslo.length < 4) return res.status(400).json({ error: "Hasło musi mieć co najmniej 4 znaki" });
  
  try {
    const existing = await prisma.uzytkownicy.findUnique({ where: { login } });
    if (existing) return res.status(400).json({ error: "Użytkownik o tym loginie już istnieje" });
    
    const hashed = await bcrypt.hash(haslo, 10);
    const user = await prisma.uzytkownicy.create({
      data: { login, haslo: hashed, czy_aktywne: true }
    });
    res.json({ id: user.id, login: user.login, czy_aktywne: user.czy_aktywne });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/users/:id", async (req, res) => {
  const { login, haslo, czy_aktywne } = req.body;
  try {
    const updateData: any = {};
    
    if (login) {
      const existing = await prisma.uzytkownicy.findUnique({ where: { login } });
      if (existing && existing.id !== req.params.id) {
        return res.status(400).json({ error: "Ten login jest już zajęty przez innego użytkownika" });
      }
      updateData.login = login;
    }
    
    if (haslo) {
      if (haslo.length < 4) return res.status(400).json({ error: "Hasło musi mieć co najmniej 4 znaki" });
      updateData.haslo = await bcrypt.hash(haslo, 10);
    }
    if (czy_aktywne !== undefined) {
      updateData.czy_aktywne = czy_aktywne;
    }
    
    if (Object.keys(updateData).length === 0) return res.json({ success: true });
    
    const user = await prisma.uzytkownicy.update({
      where: { id: req.params.id },
      data: updateData
    });
    res.json({ id: user.id, login: user.login, czy_aktywne: user.czy_aktywne });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const count = await prisma.uzytkownicy.count();
    if (count <= 1) return res.status(400).json({ error: "Nie można usunąć jedynego użytkownika" });
    
    // Zamiast usuwania, wyłącz (ze względu na relacje do dokumentów)
    await prisma.uzytkownicy.update({
      where: { id: req.params.id },
      data: { czy_aktywne: false }
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
