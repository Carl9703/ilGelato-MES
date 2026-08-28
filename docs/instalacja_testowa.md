# Instalacja testowa (staging) obok produkcji

Cel: móc sprawdzić nowe zmiany z `main` na NAS-ie **bez ruszania instalacji
produkcyjnej** — osobne kontenery, osobny port, osobna baza danych.

## Zasada rozdziału

| element              | PRODUKCJA                                | TESTOWA                                       |
|----------------------|-----------------------------------------|----------------------------------------------|
| katalog na NAS       | `/volume1/docker/ilgelato`              | `/volume1/docker/ilgelato-test`              |
| plik compose         | `docker-compose.yml`                    | `docker-compose.test.yml`                    |
| nazwa projektu Docker| `ilgelato` (z nazwy katalogu)           | `ilgelato-test` (klucz `name:` w pliku)      |
| port WWW             | `8080`                                  | `8081`                                       |
| katalog danych (DB)  | `/volume1/docker/ilgelato/data`         | `/volume1/docker/ilgelato-test/data`         |
| kontenery            | `ilgelato-backend`, `ilgelato-frontend` | `ilgelato-test-backend`, `ilgelato-test-frontend` |

Backend nie jest publikowany na zewnątrz (tylko sieć wewnętrzna), więc port `5000`
w obu stackach nie koliduje. Rozwiązywanie nazwy `backend` w `nginx.conf` działa
per-projekt, więc frontend testowy trafia do backendu testowego.

## Pierwsze postawienie (SSH na NAS)

```bash
# 1. Katalog instalacji + katalog na dane
sudo mkdir -p /volume1/docker/ilgelato-test/data
cd /volume1/docker/ilgelato-test

# 2. Pobierz kod z gałęzi main
curl -fsSL https://github.com/Carl9703/ilGelato-MES/archive/refs/heads/main.zip -o src.zip
python3 -c "import zipfile; zipfile.ZipFile('src.zip').extractall('.')"
cp -r ilGelato-MES-main/. .
rm -rf ilGelato-MES-main src.zip

# 3. (opcjonalnie) .env — potrzebny tylko dla funkcji AI / endpointu resetu
#    Jeśli produkcja go ma:  cp /volume1/docker/ilgelato/.env .
#    W przeciwnym razie pomiń — aplikacja działa bez niego.

# 4a. WARIANT A — testy na kopii realnych danych:
sudo cp /volume1/docker/ilgelato/data/gelato.db /volume1/docker/ilgelato-test/data/gelato.db

# 4b. WARIANT B — czysta baza:
#    nic nie kopiuj; entrypoint sam założy schemat + konto admina

# 5. Start
docker compose -f docker-compose.test.yml up -d --build
```

Aplikacja testowa: `http://ADRES-NAS:8081`. Produkcja bez zmian na `:8080`.

> Jeśli Docker na NAS jest starszy i nie zna klucza `name:`, dodaj jawnie projekt:
> `docker compose -p ilgelato-test -f docker-compose.test.yml up -d --build`

## Aktualizacja instalacji testowej (nowe zmiany z main)

```bash
cd /volume1/docker/ilgelato-test
curl -fsSL https://github.com/Carl9703/ilGelato-MES/archive/refs/heads/main.zip -o src.zip
python3 -c "import zipfile; zipfile.ZipFile('src.zip').extractall('.')"
rsync -a --exclude='.env' --exclude='node_modules/' --exclude='data/' \
      ilGelato-MES-main/ ./
rm -rf ilGelato-MES-main src.zip
docker compose -f docker-compose.test.yml up -d --build
```

Katalog `data/` jest wykluczony z nadpisania — baza testowa zostaje nietknięta.

## Reset bazy testowej do stanu produkcji

```bash
cd /volume1/docker/ilgelato-test
docker compose -f docker-compose.test.yml down
sudo cp /volume1/docker/ilgelato/data/gelato.db ./data/gelato.db
sudo rm -f ./data/test.db ./data/*.db-wal ./data/*.db-shm
docker compose -f docker-compose.test.yml up -d
```

## Usunięcie instalacji testowej

```bash
cd /volume1/docker/ilgelato-test
docker compose -f docker-compose.test.yml down -v
cd .. && sudo rm -rf /volume1/docker/ilgelato-test
```

Produkcja (`/volume1/docker/ilgelato`, port `8080`) nie jest w żaden sposób dotykana.

## Czego pilnować, żeby się nie pomieszało

- **Zawsze podawaj `-f docker-compose.test.yml`** w katalogu testowym. Bez tego
  `docker compose` złapie `docker-compose.yml` (produkcyjny) leżący obok w tym
  samym repo i postawi drugą produkcję.
- **Nigdy nie uruchamiaj poleceń `docker compose` z katalogu produkcyjnego z flagą
  `-f` wskazującą plik testowy** i odwrotnie.
- Bind mount danych w `docker-compose.test.yml` musi wskazywać
  `/volume1/docker/ilgelato-test/data`. Jeśli przez pomyłkę zostanie ścieżka
  produkcyjna — oba stacki piszą do jednej bazy.
- `update.sh` z repo jest przeznaczony dla **produkcji** (robi `docker compose up`
  bez `-f`). W katalogu testowym używaj sekcji „Aktualizacja" z tego dokumentu,
  nie `./update.sh`.
- Port `8081` musi być wolny na NAS. Jeśli zajęty — zmień lewą liczbę w
  `ports: - "8081:80"` (np. `8082:80`).
