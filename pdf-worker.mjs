// pdf-worker.mjs — uruchamiany jako child process przez server.ts
// Czyta HTML ze stdin, generuje PDF, zwraca przez stdout
import puppeteer from 'puppeteer';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';

const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', async () => {
  const html = Buffer.concat(chunks).toString('utf-8');
  const tmpFile = path.join(os.tmpdir(), `mes-pdf-${Date.now()}.html`);
  
  try {
    writeFileSync(tmpFile, html, 'utf-8');

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(`file:///${tmpFile.replace(/\\/g, '/')}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '14mm', right: '14mm', bottom: '12mm', left: '14mm' },
      printBackground: true,
    });

    await browser.close();
    process.stdout.write(pdf);
    process.exit(0);
  } catch (err) {
    process.stderr.write(String(err));
    process.exit(1);
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
});
