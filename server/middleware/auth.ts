import express from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { dbStorage } from "../db";
import { JWT_SECRET } from "../config";

const prismaProdukcja = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || "file:./prod.db" } },
});
const prismaTest = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST || "file:./test.db" } },
});

export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = req.headers["authorization"];
  const tokenFromQuery = typeof req.query.token === "string" ? req.query.token : null;
  const isPdfEndpoint = req.path.endsWith("/pdf");
  
  let rawToken = null;
  let isQueryToken = false;

  if (auth?.startsWith("Bearer ")) {
    rawToken = auth.slice(7);
  } else if (isPdfEndpoint && tokenFromQuery) {
    rawToken = tokenFromQuery;
    isQueryToken = true;
  }

  if (!rawToken) {
    return res.status(401).json({ error: "Wymagane logowanie" });
  }
  try {
    const payload = jwt.verify(rawToken, JWT_SECRET) as any;
    if (isQueryToken && payload.scope !== "pdf") {
      return res.status(403).json({ error: "Nieprawidłowy zakres tokena" });
    }
    (req as any).userId = payload.userId;
    (req as any).userLogin = payload.login;
    (req as any).baza = payload.baza;
    const db = payload.baza === "test" ? prismaTest : prismaProdukcja;
    dbStorage.run(db, next);
  } catch {
    res.status(401).json({ error: "Sesja wygasła — zaloguj się ponownie" });
  }
}
