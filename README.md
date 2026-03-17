# ilGelato MES

System MES/ERP dla małej manufaktury lodów rzemieślniczych. Zarządzanie produkcją, magazynem i recepturami.

## Stack technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Frontend | React + Vite + TypeScript + TailwindCSS |
| Backend | Node.js + Express + TypeScript |
| Baza danych | SQLite (via Prisma ORM) |
| Uruchomienie | `npx tsx server.ts` + `npm run dev` |

## Uruchomienie lokalne

**Wymagania:** Node.js 18+

```bash
# 1. Zainstaluj zależności
npm install

# 2. Utwórz zmienne środowiskowe
cp .env.example .env

# 3. Zainicjalizuj bazę danych
npx prisma migrate dev

# 4. (Opcjonalnie) Załaduj dane testowe
curl -X POST http://localhost:3001/api/init

# 5. Uruchom serwer API (terminal 1)
npx tsx server.ts

# 6. Uruchom frontend (terminal 2)
npm run dev
```

Frontend: http://localhost:3000  
API: http://localhost:3001

## Moduły

- **Pulpit** — metryki, alerty stanów magazynowych, skrzynka zleceń
- **Asortyment** — kartoteka surowców, opakowań, półproduktów, wyrobów gotowych
- **Receptury** — BOM (Bill of Materials), punkty kontrolne HACCP/QC
- **Produkcja** — zlecenia produkcyjne, rezerwacja surowców, realizacja z QC
- **Dokumenty** — PZ (Przyjęcie Zewnętrzne), PW (Przyjęcie Wewnętrzne), WZ, RW
- **Traceability** — genealogia partii, śledzenie surowców → wyroby gotowe

## Konwencje

Szczegóły: patrz `agents.md` (zasady projektu), `strukturabazy.md` (schemat DB), `ui/ux_wytyczne.md` (wzorce UI).
