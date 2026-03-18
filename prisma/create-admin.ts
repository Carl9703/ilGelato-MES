/**
 * Tworzy domyślnego użytkownika admin (jeśli nie istnieje).
 * Uruchom: npx tsx prisma/create-admin.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.uzytkownicy.upsert({
    where: { login: "admin" },
    update: {},
    create: { login: "admin", haslo: "admin" },
  });
  console.log(`✅ Użytkownik gotowy: ${user.login} (id: ${user.id})`);
}

main()
  .catch((e) => { console.error("❌ Błąd:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
