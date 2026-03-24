#!/bin/sh
# backup.sh — kopia zapasowa bazy danych ilGelato MES
#
# Użycie:
#   ./scripts/backup.sh
#
# Zalecane: uruchamiać codziennie przez Synology Task Scheduler:
#   Zadanie: User-defined script
#   Harmonogram: codziennie o 02:00
#   Polecenie: /volume1/docker/ilgelato/scripts/backup.sh
#
# Zmienne — dostosuj do środowiska:
DB_PATH="/volume1/docker/ilgelato/data/gelato.db"
BACKUP_DIR="/volume1/docker/ilgelato/backups"
KEEP_DAYS=30

# ─────────────────────────────────────────────
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
BACKUP_FILE="${BACKUP_DIR}/gelato_${TIMESTAMP}.db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "[ERROR] Baza danych nie istnieje: $DB_PATH" >&2
  exit 1
fi

# SQLite safe copy — użyj .backup zamiast cp żeby nie złapać mid-write state
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
else
  cp "$DB_PATH" "$BACKUP_FILE"
fi

echo "[OK] Backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Usuń kopie starsze niż KEEP_DAYS dni
find "$BACKUP_DIR" -name "gelato_*.db" -mtime +$KEEP_DAYS -delete
echo "[OK] Stare kopie (>$KEEP_DAYS dni) usunięte."
