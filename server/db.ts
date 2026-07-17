import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "async_hooks";

export const prismaProdukcja = new PrismaClient({
  datasources: { db: { url: (process.env.DATABASE_URL || "file:./prod.db") + "?connection_limit=1" } },
});
export const prismaTest = new PrismaClient({
  datasources: { db: { url: (process.env.DATABASE_URL_TEST || "file:./test.db") + "?connection_limit=1" } },
});

const initDB = async () => {
  try {
    await prismaProdukcja.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await prismaProdukcja.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
    await prismaTest.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await prismaTest.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
  } catch (e) {
    console.error("Błąd ustawień PRAGMA SQLite:", e);
  }
};
initDB();
export const dbStorage = new AsyncLocalStorage<PrismaClient>();

export class AsyncMutex {
  private mutex = Promise.resolve();
  acquire() {
    let release: () => void = () => {};
    const next = new Promise<void>(resolve => { release = resolve; });
    const current = this.mutex;
    this.mutex = current.then(() => next);
    return current.then(() => release);
  }
}
export const globalTransactionMutex = new AsyncMutex();

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const db = dbStorage.getStore() ?? prismaProdukcja;
    const val = (db as any)[prop];
    return typeof val === "function" ? val.bind(db) : val;
  },
});
