import { Router } from "express";
import { prisma } from "../db";
import QRCode from "qrcode";
import { generateDocNumber, generateSesjaNumber, generateZlecenieNumber } from "../utils/docNumbers";
import { generateDocumentHTML, generatePDF } from "../../server-pdf";

const router = Router();

router.get("/api/etykiety-dokumentu/:referencja", async (req, res) => {
    try {
      const referencja = decodeURIComponent(req.params.referencja);
      const ruchy = await prisma.ruchy_Magazynowe.findMany({
        where: { referencja_dokumentu: referencja, czy_aktywne: true },
        include: { partia: { include: { asortyment: true } } },
        orderBy: { utworzono_dnia: 'asc' }
      });
      const etykiety = ruchy.map((r, i) => ({
        lp: i + 1,
        kod_towaru: r.partia.asortyment.kod_towaru,
        nazwa: r.partia.asortyment.nazwa,
        numer_partii: r.partia.numer_partii,
        ilosc: Math.abs(r.ilosc),
        jednostka: r.partia.asortyment.jednostka_miary,
        data_produkcji: r.partia.data_produkcji,
        termin_waznosci: r.partia.termin_waznosci,
      }));
      res.json(etykiety);
    } catch (error) {
      res.status(500).json({ error: "Błąd generowania etykiet" });
    }
  });

router.get("/:numer_partii", async (req, res) => {
    try {
      const partia = await prisma.partie_Magazynowe.findUnique({
        where: { numer_partii: req.params.numer_partii },
        include: { asortyment: true }
      });
      if (!partia) return res.status(404).json({ error: "Nie znaleziono partii" });

      const qrDataUrl = await QRCode.toDataURL(partia.numer_partii, {
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
      });

      res.json({
        numer_partii: partia.numer_partii,
        nazwa_produktu: partia.asortyment.nazwa,
        kod_towaru: partia.asortyment.kod_towaru,
        data_produkcji: partia.data_produkcji,
        termin_waznosci: partia.termin_waznosci,
        jednostka: partia.asortyment.jednostka_miary,
        qr_code: qrDataUrl
      });
    } catch (error) {
      res.status(500).json({ error: "B┼é─ůd generowania etykiety" });
    }
  });

export default router;
