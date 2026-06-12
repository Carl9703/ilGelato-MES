// pdf-worker.mjs — uruchamiany jako child process przez server.ts
// Czyta HTML ze stdin, generuje PDF, zwraca przez stdout
import puppeteer from 'puppeteer';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';

import crypto from 'crypto';

const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', async () => {
  const html = Buffer.concat(chunks).toString('utf-8');
  const tmpFile = path.join(os.tmpdir(), `mes-pdf-${crypto.randomUUID()}.html`);
  
  let browser;
  try {
    writeFileSync(tmpFile, html, 'utf-8');

    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.goto(`file:///${tmpFile.replace(/\\/g, '/')}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '14mm', right: '14mm', bottom: '12mm', left: '14mm' },
      printBackground: true,
      timeout: 60000,
    });

    process.stdout.write(pdf, () => {
      process.exit(0);
    });
  } catch (err) {
    process.stderr.write(String(err));
    process.exit(1);
  } finally {
    try { if (browser) await browser.close(); } catch {}
    try { unlinkSync(tmpFile); } catch {}
  }
});
