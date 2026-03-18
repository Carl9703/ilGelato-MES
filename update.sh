#!/bin/bash
set -e

# === KONFIGURACJA ===
GITHUB_REPO="Carl9703/ilGelato-MES"
GITHUB_BRANCH="main"
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR="/tmp/ilgelato_update_$$"
# ====================

ZIP_URL="https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip"
ZIP_FILE="${TMP_DIR}/update.zip"
REPO_DIRNAME="${GITHUB_REPO##*/}-${GITHUB_BRANCH}"

echo "==> Pobieranie aktualizacji z ${ZIP_URL}"
mkdir -p "$TMP_DIR"
curl -fsSL "$ZIP_URL" -o "$ZIP_FILE"

echo "==> Rozpakowywanie..."
python3 -c "
import zipfile, sys
with zipfile.ZipFile('${ZIP_FILE}', 'r') as z:
    z.extractall('${TMP_DIR}')
"

EXTRACT_DIR="${TMP_DIR}/${REPO_DIRNAME}"
if [ ! -d "$EXTRACT_DIR" ]; then
  echo "BŁĄD: Nie znaleziono katalogu ${EXTRACT_DIR} po rozpakowaniu." >&2
  ls "$TMP_DIR"
  exit 1
fi

echo "==> Kopiowanie plików do ${INSTALL_DIR}"
# Kopiuj wszystko oprócz danych i lokalnych konfiguracji
rsync -a --exclude='prisma/dev.db' \
         --exclude='prisma/data/' \
         --exclude='.env' \
         --exclude='node_modules/' \
         "${EXTRACT_DIR}/" "${INSTALL_DIR}/"

echo "==> Przebudowywanie i uruchamianie kontenerów..."
cd "$INSTALL_DIR"
docker compose up -d --build

echo "==> Czyszczenie plików tymczasowych..."
rm -rf "$TMP_DIR"

echo ""
echo "Aktualizacja zakończona pomyślnie."
