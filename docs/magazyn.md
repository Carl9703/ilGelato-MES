# Domena 1: Gospodarka Magazynowa i Śledzenie (Traceability)

Ten moduł zarządza fizycznym przepływem towarów. System nie obsługuje sprzedaży ani kontrahentów. Służy wyłącznie do śledzenia ilościowego: co weszło do zakładu, co z tego wyprodukowano i co zakład opuściło.

## Główne założenia transakcyjne
1. **Zasada bezwzględnej partii:** Żaden ruch magazynowy nie może się odbyć bez wskazania konkretnego `numer_partii`. To fundament śledzenia "od pola do stołu".
2. **Typy Dokumentów Magazynowych (Czysto Ilościowe):**
   * **PZ (Przyjęcie Zewnętrzne):** Rejestruje wejście surowców/opakowań do zakładu. System nadaje wewnętrzny `numer_partii` i zapisuje datę ważności.
   * **PW (Przyjęcie Wewnętrzne - Z produkcji):** Zwiększa stan wyrobów gotowych (lodów). Dokument generowany AUTOMATYCZNIE po zamknięciu Zlecenia Produkcyjnego.
   * **RW (Rozchód Wewnętrzny - Na produkcję):** Zmniejsza stan surowców. Dokument generowany AUTOMATYCZNIE po zamknięciu Zlecenia Produkcyjnego, zdejmując z magazynu zużyte partie.
   * **WZ (Wydanie Zewnętrzne / Rozchód):** Zmniejsza stan wyrobów gotowych. Służy wyłącznie do ilościowego zdjęcia lodów z magazynu, gdy fizycznie opuszczają zakład, aby stany się zgadzały. Brak powiązań z klientami czy cenami.
3. **Kontrola FEFO (First Expired, First Out):** System przy dokumentach rozchodowych (WZ, RW) musi domyślnie sugerować pobranie tych partii z magazynu, którym najszybciej kończy się data ważności.

## Wytyczne UI/UX dla agenta i użytkownika
* Widoki muszą zawierać zintegrowany skaner kodów partii (`data-testid="input-skaner-partii"`). Skanowanie kodu partii jest podstawową metodą wprowadzania danych na hali.
* Ekran "Stan Magazynu" musi być prostą, płaską tabelą grupującą zasoby, która w każdej chwili odpowiada na pytanie: "Ile litrów śmietany z partii X mamy obecnie fizycznie w chłodni?".

