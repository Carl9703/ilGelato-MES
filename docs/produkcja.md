# Domena 3: Realizacja Produkcji (MES)

Moduł spinający domenę technologii z domeną magazynu. Obsługuje fizyczny proces powstawania lodów za pomocą Zleceń Produkcyjnych.

## Główne założenia transakcyjne
1. **Cykl życia Zlecenia Produkcyjnego:**
   * **Planowane:** Użytkownik wybiera recepturę i planowaną ilość do wyprodukowania.
   * **W toku:** Zlecenie jest realizowane. W tym momencie system blokuje (rezerwuje) odpowiednie ilości partii surowców na magazynie, aby nikt inny ich nie wydał.
   * **Zrealizowane (Zamknięcie zlecenia):** KRYTYCZNA TRANSAKCJA BAZONADANOWA. Wymaga operacji typu ACID.
2. **Rozliczenie (Generowanie dokumentów):**
   * Zamknięcie zlecenia automatycznie generuje w tle dokument **RW** dla zużytych surowców, zmniejszając ich stan (ściągając rezerwację).
   * Jednocześnie w tej samej transakcji system generuje dokument **PW** przyjmując gotowe lody na stan z nowo wygenerowanym, unikalnym `numer_partii` i obliczoną datą przydatności.
3. **Identyfikowalność (Traceability):** Zlecenie musi trwale zapisać w bazie, z jakich dokładnie numerów partii mleka, cukru i opakowań wyprodukowano nową partię lodów.

## Wytyczne UI/UX dla agenta i użytkownika
* Pracownik produkcyjny na tablecie widzi listę zleceń ze statusem "Planowane".
* Kliknięcie `data-testid="btn-rozpocznij-produkcje"` zmienia status zlecenia.
* W widoku zamykania zlecenia, pracownik skanuje partie surowców, które faktycznie wrzucił do maszyny. System musi zwalidować, czy zeskanowane partie zgadzają się z tymi, które podpowiedział algorytm FEFO z magazynu.

## 3. Generowanie Etykiet (Traceability)
* Zamknięcie Zlecenia Produkcyjnego (i wygenerowanie PW) musi automatycznie zwracać wygenerowaną etykietę w formacie PDF (lub komendę ZPL do drukarki).
* Etykieta musi zawierać: nazwę produktu, datę produkcji, wyliczoną datę ważności oraz wygenerowany w tej samej transakcji kod QR.
* Kod QR musi po zeskanowaniu zwracać dokładnie ciąg znaków odpowiadający `numer_partii` w bazie danych, niezbędny do późniejszych operacji wydania (WZ).
* Do generowania kodu QR użyj standardowych, sprawdzonych bibliotek (np. `qrcode` dla Node.js/Python).

