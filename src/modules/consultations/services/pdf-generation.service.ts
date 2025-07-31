import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class PdfGenerationService {
  private readonly logger = new Logger(PdfGenerationService.name);

  async generatePdf(htmlContent: string, isDraft: boolean): Promise<Buffer> {
    this.logger.log(`Generating PDF... (isDraft: ${isDraft})`);
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    if (isDraft) {
      // Add draft watermark
      await page.evaluate(() => {
        const watermark = document.createElement('div');
        watermark.style.position = 'absolute';
        watermark.style.top = '50%';
        watermark.style.left = '50%';
        watermark.style.transform = 'translate(-50%, -50%) rotate(-45deg)';
        watermark.style.fontSize = '100px';
        watermark.style.color = 'rgba(0, 0, 0, 0.1)';
        watermark.style.pointerEvents = 'none';
        watermark.style.zIndex = '1000';
        watermark.textContent = 'DRAFT';
        document.body.appendChild(watermark);
      });
    }

    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    this.logger.log('PDF generated successfully.');
    return Buffer.from(pdfBuffer);
  }
}

