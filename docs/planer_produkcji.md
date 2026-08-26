# Planer produkcji

Moduł planowania turnusu produkcyjnego. Zastępuje arkusz Excel, w którym planista
rozpisywał dzień produkcji: smaki w kolejności barwnej, rozbicie na wsady i docelowe
opakowania.

Ścieżka w aplikacji: **`/planer`** (`src/pages/PlanProdukcji.tsx`).

---

## Cykl życia turnusu

```
PLAN                                    ROZLICZENIE
Sesje_Produkcji  status "Planowana"     + Ruchy_Magazynowe (RW, PW)
  └ Zlecenie etap 1 (baza)  "Planowane" + Partie_Magazynowe
  └ Zlecenie etap 2 × N     "Planowane" + Dokumenty
        wsady_json, kolejnosc           → status "Zrealizowana"
        │
        └──> wydruk karty produkcyjnej na halę
```

Plan **nie dotyka magazynu** — to sesja produkcyjna zatrzymana w statusie `Planowana`
wraz ze zleceniami w statusie `Planowane`. Dopiero rozliczenie dokłada ruchy, partie
i dokumenty.

Nie ma osobnego modelu „plan". Plan **staje się** realizacją, zamiast być do niej
kopiowany — dzięki temu nie istnieje problem synchronizacji dwóch opisów tego samego
turnusu.

---

## Model danych

Rozszerzenia istniejących modeli — bez nowych tabel:

| Model | Pole | Znaczenie |
|-------|------|-----------|
| `Asortyment` | `kolejnosc_produkcji Int?` | Kolejność barwna, wartości co 10 |
| `Receptury` | `warianty_json String?` | Typowe wsady: `[{mnoznik, id_opakowania, liczba}]` |
| `Sesje_Produkcji` | `status String` | `Planowana` \| `Zrealizowana` \| `Anulowana` |
| `Sesje_Produkcji` | `notatki String?` | Uwagi drukowane na karcie |
| `Sesje_Produkcji` | `planowana_baza_kg Float?` | Ile bazy zrobić w etapie 1 |
| `Zlecenia_Produkcyjne` | `wsady_json String?` | Rozbicie pozycji na mrożenia |
| `Zlecenia_Produkcyjne` | `kolejnosc Int?` | Pozycja w turnusie |

Kolejność co 10 pozwala wstawić smak między pozycje 30 a 40 wpisując 35, bez
przenumerowania całej listy.

---

## Mnożnik, wsad i wydajność

To jest sedno modelu i najłatwiejsze miejsce do pomyłki.

```
ilosc_wymagana      = udział masowy składnika   → suma zawsze 1,0000
wielkosc_produkcji  = masa wyrobu z mnożnika 1  → np. Malaga 1,145 kg
liczba wsadów × mnożnik = ile razy skalujemy recepturę

kg wyrobu  = suma(mnożników) × wielkosc_produkcji
kg surowca = udział × kg wyrobu
```

Przykład — Malaga, mnożnik 4:

| składnik | udział | × 4 × 1,145 |
|----------|--------|-------------|
| Mieszanka Mleczna Perpanna | 0,742358 | 3,400 kg |
| Mleko UHT 3,2% | 0,131004 | 0,600 kg |
| Anselmi ANIMA FLORIO PASTA | 0,104803 | 0,480 kg |
| Anselmi ANIMA FLORIO VARIEGATO | 0,021834 | 0,100 kg |

**`wielkosc_produkcji` to wydajność, nie rozmiar partii.** Wartości 1,0–1,2 przy
lodach mlecznych są poprawne — to przyrost masy z past i przekładek dokładanych
ponad kilogram bazy. Ustawienie ich na 1 zaniżyłoby zużycie surowców o 2–17%.

Wartości rzędu 2–6 przy wyrobach gotowych oznaczają zwykle, że ktoś wpisał tam całą
partię. Edytor receptury ostrzega o tym w zakładce **Kalkulator kosztów**.

**Zapotrzebowanie na bazę liczy się z BOM-u, nie z mnożnika.** Receptura na 1 kg
wyrobu miewa 0,8 kg bazy, więc te liczby nie są tożsame.

---

## Wsady i warianty

Rozbicie smaku na wsady nie jest kosmetyczne — wynika z ograniczeń fizycznych:

- maszyna bierze **maksymalnie 10 kg** na raz,
- kuweta i pozzetti **nie mieszczą się razem w szokówce**, więc idą osobnymi mrożeniami.

Dlatego wsad zawsze wiąże się z docelowym opakowaniem. Typowe pary zapisuje się przy
recepturze (zakładka **Warianty wsadu**), a na planie dodaje jednym kliknięciem:

```
⠿ 3 · Malaga                                     14 kg
      [ ×4 kuweta ]  [ ×10 2× pozzetti ]  [ + inny wsad ]
        ×4    kuweta            4,58 kg
        ×10   2× pozzetti      11,45 kg
```

Warianty są **per receptura**, nie globalne — każdy smak robi się w swoim zestawie
rozmiarów, a cremino wymaga innego mnożnika na tę samą kuwetę niż lody zwykłe.

Planer ostrzega, gdy wsad przekracza 10 kg.

---

## Rozliczenie

Ten sam ekran w trybie „Rozlicz turnus": wsady rozwijają się na pojedyncze opakowania
z polem wagi, przepisywanym z kartki. Dostępne są:

- **opakowanie ponadplanowe** — gdy z 10 kg wyszły 3 pozzetti zamiast 2,
- **Niewykonane** — smak, który nie powstał; jego zlecenie zostaje `Anulowane`,
- **rzeczywista ilość bazy** — reszta niewykorzystanej bazy trafia na `Strata`.

Partie surowców dobierane są **automatycznie metodą FIFO** po stronie serwera
(`auto_fifo: true`) — operator nie wskazuje ich ręcznie. Bez wpisanych wag pozycja
przyjmuje wartość planowaną, co pozwala domknąć turnus mimo braku ważenia.

Turnus da się rozliczyć tylko raz — próba powtórzenia zwraca błąd.

---

## Endpointy

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| `GET` | `/api/produkcja/plany` | Lista turnusów (`?status=Planowana`) |
| `GET` | `/api/produkcja/plany/:id` | Jeden turnus z pozycjami |
| `POST` | `/api/produkcja/plany` | Nowy plan — bez ruchów magazynowych |
| `PUT` | `/api/produkcja/plany/:id` | Zapis planu (różnicowo, numery zleceń zachowane) |
| `DELETE` | `/api/produkcja/plany/:id` | Usunięcie planu (tylko `Planowana`) |
| `POST` | `/api/produkcja/plany/:id/rozlicz` | Rozliczenie — RW, PW, partie |
| `PUT` | `/api/asortyment/kolejnosc-produkcji` | Zbiorczy zapis kolejności barwnej |
| `PUT` | `/api/receptury/:id/warianty` | Warianty wsadu przy recepturze |

Rozliczenie i bezpośrednia realizacja (`POST /api/produkcja/sesja`, używana przez
wizard w `Produkcja.tsx`) dzielą jedną funkcję `wykonajSesjeProdukcji()`. Różnią się
tylko tym, czy sesja i zlecenia już istnieją.

---

## Wydruk karty produkcyjnej

`src/utils/printKartaProdukcji.ts`, przez `downloadPdfFromHtml()`. Układ odwzorowuje
arkusz: blok na smak, wiersz na każde opakowanie, pusta kolumna „waga końcowa"
i dwa wiersze zapasowe na wypadek, gdy wyjdzie więcej opakowań niż zaplanowano.

`budujKarteHtml()` jest wydzielone i czyste — da się je wywołać poza przeglądarką,
np. do sprawdzenia układu wydruku.

---

## Świadome pominięcia

Zakres celowo nie obejmuje:

- automatycznego układania kolejności ani przydziału maszyn (to decyzja człowieka),
- klonowania turnusów,
- panelu zapotrzebowania i braków surowcowych (surowce są zawsze dostępne),
- listy otwartych kuwet,
- numerów frezerów, równoległych linii i przypisania operatora,
- składników „wedle uznania" (`w.u.`) — w aplikacji wszystkie składniki mają konkretne ilości.

Konsekwencja ostatniego punktu: waga końcowa bywa wyższa od planu, bo przekładki
dokładane na oko nie są ewidencjonowane. Różnicę traktujemy jako uzysk, nie jako
zysk magazynowy.
