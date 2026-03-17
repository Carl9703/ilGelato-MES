# Domena 2: Technologia i Receptury (Master Data & BOM)

Ten moduł to "mózg" systemu. Odpowiada za definicje tego, czym operujemy i jak z surowców powstaje wyrób gotowy. Bez tego modułu produkcja nie wie, co ma robić.

## Główne założenia transakcyjne
1. **Kartoteki (Asortyment):** Rejestr wszystkich indeksów. 
   * Wymagane pole `typ_asortymentu` z wartościami: `Surowiec`, `Opakowanie`, `Wyrob_Gotowy`.
   * Sztywna `jednostka_miary` (np. szt., kg, L).
2. **Receptury (Bill of Materials - BOM):**
   * Receptura to powiązanie jednego indeksu typu `Wyrob_Gotowy` z wieloma indeksami typu `Surowiec`/`Opakowanie`.
   * Receptura nie generuje żadnego ruchu na magazynie. Jest to wyłącznie szablon (przepis).
   * **Zarządzanie jednostkami:** Jeśli mleko (Surowiec) mamy w magazynie w litrach (L), a w recepturze potrzebujemy 500 mililitrów, system (backend) musi bezbłędnie przeliczyć to w locie na 0.5 L dla przyszłego dokumentu RW.
3. **Wersjonowanie:** Zmiana ilości składnika w recepturze nie nadpisuje jej, lecz ustawia starą wersję na `czy_aktywne = false` i tworzy nową. Zapobiega to uszkodzeniu historycznych danych produkcyjnych.

## Wytyczne UI/UX dla agenta i użytkownika
* Interfejs tworzenia receptury musi pozwalać na dynamiczne dodawanie wierszy składników do tabeli (`data-testid="btn-dodaj-skladnik"`).
* Przed zapisaniem receptury, backend musi sprawdzić, czy suma procentowa składników logicznie się spina (jeśli technologia tego wymaga) i zablokować zapis w przypadku błędu.

