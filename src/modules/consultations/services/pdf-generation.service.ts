import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as PDFDocument from 'pdfkit';

interface PrescriptionData {
  doctorName: string;
  consultationId: string;
  date: string;
  diagnosis: string;
  clinicalReasoning: string;
  confidenceScore: string;
  processingNotes: string;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
  }>;
  investigations: Array<{
    name: string;
    instructions: string;
  }>;
  treatmentPlan: {
    primaryTreatment: string;
    lifestyleModifications: string[];
    dietaryAdvice: string[];
    followUpTimeline: string;
  };
  patientEducation: string[];
  warningSigns: string[];
  disclaimer: string;
}

@Injectable()
export class PdfGenerationService {
  private readonly logger = new Logger(PdfGenerationService.name);
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
    this.logger.log(`PDF Service initialized - Production mode: ${this.isProduction}`);
  }

  async generatePdf(htmlContent: string, isDraft: boolean): Promise<Buffer> {
    this.logger.log(`Generating PDF with PDFKit... (isDraft: ${isDraft})`);
    
    try {
      // Parse HTML content to extract structured data
      const prescriptionData = this.parseHtmlContent(htmlContent);
      
      // Generate PDF using PDFKit
      const pdfBuffer = await this.generatePdfWithPDFKit(prescriptionData, isDraft);
      
      this.logger.log('PDF generated successfully with PDFKit.');
      return pdfBuffer;
    } catch (error) {
      this.logger.error('PDF generation failed:', error.message);
      throw new Error(`PDF generation failed: ${error.message}`);
    }
  }

  private async generatePdfWithPDFKit(data: PrescriptionData, isDraft: boolean): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, left: 50, right: 50, bottom: 50 }
      });
      
      const chunks: Buffer[] = [];
      
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);
      
      this.buildPdfContent(doc, data, isDraft);
      
      doc.end();
    });
  }

  private buildPdfContent(doc: any, data: PrescriptionData, isDraft: boolean): void {
    const pageWidth = doc.page.width;
    const margin = 50;
    const primaryColor = '#2C3E50'; // Dark Blue-Gray
    const accentColor = '#E8B4C8'; // Soft Rose
    const textColor = '#2C3E50'; // Dark Blue-Gray
    const lightGray = '#F8F9FA';
    const mediumGray = '#6C757D';
    
    // Add draft watermark if needed
    if (isDraft) {
      this.addCleanDraftWatermark(doc, pageWidth);
    }
    
    // Clean Header
    this.addCleanHeader(doc, pageWidth, margin, primaryColor, accentColor);
    
    // Doctor Information
    this.addCleanDoctorInfo(doc, data, margin, textColor);
    
    // Diagnosis
    this.addCleanDiagnosis(doc, data, margin, primaryColor, lightGray);
    
    // Medications
    this.addCleanMedications(doc, data.medications, margin, primaryColor, lightGray);
    
    // Investigations
    this.addCleanInvestigations(doc, data.investigations, margin, primaryColor, lightGray);
    
    // Treatment Plan
    this.addCleanTreatmentPlan(doc, data.treatmentPlan, margin, primaryColor, lightGray);
    
    // Patient Education
    this.addCleanPatientEducation(doc, data.patientEducation, margin, primaryColor, lightGray);
    
    // Warning Signs
    this.addCleanWarningSigns(doc, data.warningSigns, margin);
    
    // Disclaimer
    this.addCleanDisclaimer(doc, data.disclaimer, margin, mediumGray);
    
    // Signature
    this.addCleanSignature(doc, data.doctorName, isDraft, pageWidth, margin, primaryColor);
    
    // Footer
    this.addCleanFooter(doc, pageWidth, margin, mediumGray);
  }
  
  private addDraftWatermark(doc: any, pageWidth: number): void {
    doc.save();
    doc.rotate(-45, { origin: [pageWidth / 2, doc.page.height / 2] });
    doc.fontSize(120)
       .fillColor('#CCCCCC', 0.3)
       .text('DRAFT', pageWidth / 2 - 150, doc.page.height / 2 - 60, {
         width: 300,
         align: 'center'
       });
    doc.restore();
  }
  
  private addSection(doc: any, title: string, items: string[]): void {
    doc.moveDown(1);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('black', 1).text(title);
    doc.fontSize(12).font('Helvetica');
    
    items.forEach(item => {
      doc.text(item, { indent: 10 });
    });
  }
  
  private addMedicationsSection(doc: any, medications: any[]): void {
    doc.moveDown(1);
    doc.fontSize(16).font('Helvetica-Bold').text('Medications');
    doc.fontSize(12).font('Helvetica');
    
    if (medications && medications.length > 0) {
      medications.forEach((med, index) => {
        doc.text(`${index + 1}. ${med.name}`, { indent: 10 });
        doc.text(`   • Dosage: ${med.dosage}`, { indent: 20 });
        doc.text(`   • Frequency: ${med.frequency}`, { indent: 20 });
        doc.text(`   • Duration: ${med.duration}`, { indent: 20 });
        doc.text(`   • Instructions: ${med.instructions}`, { indent: 20 });
        doc.moveDown(0.5);
      });
    } else {
      doc.text('No medications prescribed', { indent: 10 });
    }
  }
  
  private addInvestigationsSection(doc: any, investigations: any[]): void {
    doc.moveDown(1);
    doc.fontSize(16).font('Helvetica-Bold').text('Recommended Investigations');
    doc.fontSize(12).font('Helvetica');
    
    if (investigations && investigations.length > 0) {
      investigations.forEach((inv, index) => {
        doc.text(`${index + 1}. ${inv.name}`, { indent: 10 });
        doc.text(`   Instructions: ${inv.instructions}`, { indent: 20 });
        doc.moveDown(0.5);
      });
    } else {
      doc.text('No specific investigations recommended', { indent: 10 });
    }
  }
  
  private addTreatmentSection(doc: any, treatmentPlan: any): void {
    doc.moveDown(1);
    doc.fontSize(16).font('Helvetica-Bold').text('Treatment Recommendations');
    doc.fontSize(12).font('Helvetica');
    
    if (treatmentPlan.primaryTreatment) {
      doc.text(`Primary Treatment: ${treatmentPlan.primaryTreatment}`, { indent: 10 });
    }
    
    if (treatmentPlan.lifestyleModifications?.length > 0) {
      doc.text('Lifestyle Modifications:', { indent: 10 });
      treatmentPlan.lifestyleModifications.forEach((mod: string) => {
        doc.text(`• ${mod}`, { indent: 20 });
      });
    }
    
    if (treatmentPlan.dietaryAdvice?.length > 0) {
      doc.text('Dietary Advice:', { indent: 10 });
      treatmentPlan.dietaryAdvice.forEach((advice: string) => {
        doc.text(`• ${advice}`, { indent: 20 });
      });
    }
    
    if (treatmentPlan.followUpTimeline) {
      doc.text(`Follow-up Timeline: ${treatmentPlan.followUpTimeline}`, { indent: 10 });
    }
  }
  
  private addListSection(doc: any, title: string, items: string[]): void {
    if (!items || items.length === 0) return;
    
    doc.moveDown(1);
    doc.fontSize(16).font('Helvetica-Bold').text(title);
    doc.fontSize(12).font('Helvetica');
    
    items.forEach(item => {
      doc.text(`• ${item}`, { indent: 10 });
    });
  }
  
  private addSignatureSection(doc: any, doctorName: string, isDraft: boolean, pageWidth: number, margin: number): void {
    doc.moveDown(3);
    
    const signatureX = pageWidth - margin - 200;
    doc.text('_______________________', signatureX, doc.y);
    doc.text(`Dr. ${doctorName}`, signatureX, doc.y + 5);
    doc.text('Digital Signature Applied', signatureX, doc.y + 5);
    
    if (!isDraft) {
      doc.text(`Signed on: ${new Date().toLocaleString()}`, signatureX, doc.y + 5);
    }
  }
  
  private addFooter(doc: any, pageWidth: number, margin: number): void {
    doc.fontSize(10)
       .text('This is a digitally generated prescription from Tenderly Care platform',
             margin, doc.page.height - margin - 20, 
             { align: 'center', width: pageWidth - 2 * margin });
  }
  
  private parseHtmlContent(htmlContent: string): PrescriptionData {
    // Extract data from HTML using regex patterns
    const extractText = (pattern: RegExp, defaultValue: string = 'Not specified'): string => {
      const match = htmlContent.match(pattern);
      return match ? match[1].replace(/\s+/g, ' ').trim() : defaultValue;
    };
    
    const extractList = (pattern: RegExp): string[] => {
      const matches = htmlContent.match(pattern);
      if (!matches) return [];
      
      const items = matches[0].match(/<li[^>]*>([^<]+)<\/li>/gi) || [];
      return items.map(item => item.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
    };
    
    return {
      doctorName: extractText(/\<strong\>Doctor:\<\/strong\>\s*([^\<]+)/, 'Doctor Name').replace(/Dr\.\s*/, ''),
      consultationId: extractText(/\<strong\>Consultation ID:\<\/strong\>\s*([^\<]+)/, 'N/A'),
      date: new Date().toLocaleDateString(),
      diagnosis: extractText(/\<strong\>Possible Diagnoses:\<\/strong\>\s*([^\<]+)/, 'Not specified'),
      clinicalReasoning: extractText(/\<strong\>Clinical Reasoning:\<\/strong\>\s*([^\<]+)/, 'Not specified'),
      confidenceScore: extractText(/\<strong\>Confidence Score:\<\/strong\>\s*([^\<]+)/, ''),
      processingNotes: extractText(/\<strong\>Processing Notes:\<\/strong\>\s*([^\<]+)/, ''),
      medications: this.extractMedications(htmlContent),
      investigations: this.extractInvestigations(htmlContent),
      treatmentPlan: {
        primaryTreatment: extractText(/\<strong\>Primary Treatment:\<\/strong\>\s*([^\<]+)/, 'Not specified'),
        lifestyleModifications: extractList(/\<strong\>Lifestyle Modifications:\<\/strong\>[\s\S]*?\<ul[^\>]*\>([\s\S]*?)\<\/ul\>/i),
        dietaryAdvice: extractList(/\<strong\>Dietary Advice:\<\/strong\>[\s\S]*?\<ul[^\>]*\>([\s\S]*?)\<\/ul\>/i),
        followUpTimeline: extractText(/\<strong\>Follow-up Timeline:\<\/strong\>\s*([^\<]+)/, 'Not specified')
      },
      patientEducation: extractList(/\<h3\>Patient Education\<\/h3\>[\s\S]*?\<ul[^\>]*\>([\s\S]*?)\<\/ul\>/i),
      warningSigns: extractList(/\<h3\>Warning Signs\<\/h3\>[\s\S]*?\<ul[^\>]*\>([\s\S]*?)\<\/ul\>/i),
      disclaimer: extractText(/\<div class="disclaimer"\>\s*\<p\>\s*\<em\>([^\<]+)/, 'This prescription is based on the information provided and should be used as advised.')
    };
  }
  
  private extractMedications(htmlContent: string): any[] {
    const medicationBlocks = htmlContent.match(/<div class="medication"[^>]*>([\s\S]*?)<\/div>/gi) || [];
    
    return medicationBlocks.map(block => {
      const extractMedField = (field: string): string => {
        const pattern = new RegExp(`<p>${field}:\s*([^<]+)</p>`, 'i');
        const match = block.match(pattern);
        return match ? match[1].trim() : 'As per doctor recommendation';
      };
      
      const nameMatch = block.match(/<strong>([^<]+)<\/strong>/);
      const name = nameMatch ? nameMatch[1].trim() : 'Unknown Medication';
      
      return {
        name,
        dosage: extractMedField('Dosage'),
        frequency: extractMedField('Frequency'),
        duration: extractMedField('Duration'),
        instructions: extractMedField('Instructions')
      };
    });
  }
  
  private extractInvestigations(htmlContent: string): any[] {
    const investigationBlocks = htmlContent.match(/\<div class="investigation-test"[^\>]*\>([\s\S]*?)\<\/div\>/gi) || [];
    
    return investigationBlocks.map(block => {
      const nameMatch = block.match(/\<strong\>([^\<]+)\<\/strong\>/);
      const instructionsMatch = block.match(/\<p\>Instructions:\s*([^\<]+)\<\/p\>/);
      
      return {
        name: nameMatch ? nameMatch[1].trim() : 'Investigation',
        instructions: instructionsMatch ? instructionsMatch[1].trim() : 'As recommended by doctor'
      };
    });
  }

  // Modern Design Methods
  
  private addModernDraftWatermark(doc: any, pageWidth: number): void {
    doc.save();
    doc.rotate(-45, { origin: [pageWidth / 2, doc.page.height / 2] });
    doc.fontSize(100)
       .fillColor('#FF69B4', 0.15) // Light pink watermark
       .text('DRAFT', pageWidth / 2 - 120, doc.page.height / 2 - 50, {
         width: 240,
         align: 'center'
       });
    doc.restore();
  }
  
  private addModernHeader(doc: any, pageWidth: number, margin: number, primaryColor: string, headerColor: string): void {
    // Header background
    doc.rect(0, 0, pageWidth, 100)
       .fillColor(primaryColor)
       .fill();
    
    // Logo area (decorative circle)
    doc.circle(pageWidth / 2, 35, 25)
       .fillColor(headerColor, 0.2)
       .fill();
    
    // Title
    doc.fontSize(26)
       .fillColor(headerColor)
       .font('Helvetica-Bold')
       .text('💊 Medical Prescription', margin, 20, { align: 'center', width: pageWidth - 2 * margin });
    
    // Subtitle with feminine touch
    doc.fontSize(12)
       .fillColor(headerColor, 0.9)
       .font('Helvetica')
       .text('🌸 Tenderly Care - Women\'s Health & Wellness 🌸', { align: 'center' });
    
    doc.y = 120; // Set position after header
  }
  
  private addDoctorInfoCard(doc: any, data: PrescriptionData, margin: number, secondaryColor: string, primaryColor: string): void {
    const cardY = doc.y;
    const cardHeight = 80;
    
    // Card background
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 10)
       .fillColor(secondaryColor)
       .fill();
    
    // Card border
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 10)
       .strokeColor(primaryColor, 0.3)
       .lineWidth(2)
       .stroke();
    
    // Doctor icon
    doc.fontSize(20)
       .fillColor(primaryColor)
       .text('👩‍⚕️', margin + 20, cardY + 15);
    
    // Doctor information
    doc.fontSize(14)
       .fillColor('#424242')
       .font('Helvetica-Bold')
       .text(`Dr. ${data.doctorName}`, margin + 60, cardY + 15);
    
    doc.fontSize(11)
       .font('Helvetica')
       .fillColor('#666666')
       .text(`📅 ${data.date}`, margin + 60, cardY + 35)
       .text(`🔗 ID: ${data.consultationId}`, margin + 60, cardY + 50);
    
    doc.y = cardY + cardHeight + 20;
  }
  
  private addModernDiagnosisSection(doc: any, data: PrescriptionData, margin: number, primaryColor: string, accentColor: string): void {
    this.addModernSectionHeader(doc, '🔍 Diagnosis', primaryColor, margin);
    
    // Diagnosis card
    const cardY = doc.y;
    const cardHeight = 60;
    
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .fillColor('#F8F9FA')
       .fill();
    
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .strokeColor(accentColor, 0.3)
       .lineWidth(1)
       .stroke();
    
    doc.fontSize(12)
       .fillColor('#424242')
       .font('Helvetica-Bold')
       .text('Primary Diagnosis:', margin + 15, cardY + 15);
    
    doc.fontSize(11)
       .font('Helvetica')
       .fillColor('#666666')
       .text(data.diagnosis, margin + 15, cardY + 32, { width: doc.page.width - 2 * margin - 30 });
    
    doc.y = cardY + cardHeight + 15;
  }
  
  private addModernMedicationsSection(doc: any, medications: any[], margin: number, primaryColor: string): void {
    this.addModernSectionHeader(doc, '💊 Medications', primaryColor, margin);
    
    if (!medications || medications.length === 0) {
      this.addEmptyStateCard(doc, 'No medications prescribed at this time', '💊', margin);
      return;
    }
    
    medications.forEach((med, index) => {
      const cardY = doc.y;
      const cardHeight = 90;
      
      // Medication card
      doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
         .fillColor('#FFFFFF')
         .fill();
      
      doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
         .strokeColor(primaryColor, 0.2)
         .lineWidth(1)
         .stroke();
      
      // Medication number badge
      doc.circle(margin + 20, cardY + 20, 12)
         .fillColor(primaryColor)
         .fill();
      
      doc.fontSize(10)
         .fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .text((index + 1).toString(), margin + 16, cardY + 16);
      
      // Medication name
      doc.fontSize(13)
         .fillColor('#424242')
         .font('Helvetica-Bold')
         .text(med.name, margin + 45, cardY + 12);
      
      // Medication details with icons
      const details = [
        { icon: '💊', label: 'Dosage', value: med.dosage },
        { icon: '⏰', label: 'Frequency', value: med.frequency },
        { icon: '📅', label: 'Duration', value: med.duration }
      ];
      
      let yOffset = cardY + 35;
      details.forEach(detail => {
        doc.fontSize(9)
           .fillColor('#666666')
           .font('Helvetica')
           .text(`${detail.icon} ${detail.label}: ${detail.value}`, margin + 45, yOffset);
        yOffset += 12;
      });
      
      doc.y = cardY + cardHeight + 10;
    });
  }
  
  private addModernInvestigationsSection(doc: any, investigations: any[], margin: number, accentColor: string): void {
    this.addModernSectionHeader(doc, '🔬 Recommended Tests', accentColor, margin);
    
    if (!investigations || investigations.length === 0) {
      this.addEmptyStateCard(doc, 'No specific tests recommended', '🔬', margin);
      return;
    }
    
    investigations.forEach((inv, index) => {
      const itemY = doc.y;
      
      // Test item
      doc.fontSize(11)
         .fillColor(accentColor)
         .font('Helvetica-Bold')
         .text(`🔬 ${inv.name}`, margin + 20, itemY);
      
      doc.fontSize(10)
         .fillColor('#666666')
         .font('Helvetica')
         .text(`Instructions: ${inv.instructions}`, margin + 30, itemY + 15, { width: doc.page.width - 2 * margin - 50 });
      
      doc.y = itemY + 35;
    });
    
    doc.moveDown(0.5);
  }
  
  private addModernTreatmentSection(doc: any, treatmentPlan: any, margin: number, primaryColor: string): void {
    this.addModernSectionHeader(doc, '🌸 Treatment Plan', primaryColor, margin);
    
    // Primary treatment
    if (treatmentPlan.primaryTreatment && treatmentPlan.primaryTreatment !== 'Not specified') {
      this.addTreatmentCard(doc, '💝 Primary Treatment', treatmentPlan.primaryTreatment, margin, '#E8F5E8');
    }
    
    // Lifestyle modifications
    if (treatmentPlan.lifestyleModifications?.length > 0) {
      this.addTreatmentListCard(doc, '🏃‍♀️ Lifestyle Changes', treatmentPlan.lifestyleModifications, margin, '#FFF3E0');
    }
    
    // Dietary advice
    if (treatmentPlan.dietaryAdvice?.length > 0) {
      this.addTreatmentListCard(doc, '🥗 Dietary Recommendations', treatmentPlan.dietaryAdvice, margin, '#E8F5E8');
    }
    
    // Follow-up
    if (treatmentPlan.followUpTimeline && treatmentPlan.followUpTimeline !== 'Not specified') {
      this.addTreatmentCard(doc, '📅 Follow-up Schedule', treatmentPlan.followUpTimeline, margin, '#F3E5F5');
    }
  }
  
  private addModernPatientEducation(doc: any, education: string[], margin: number, accentColor: string): void {
    if (!education || education.length === 0) return;
    
    this.addModernSectionHeader(doc, '📚 Important Information for You', accentColor, margin);
    
    const cardY = doc.y;
    const cardHeight = Math.max(60, education.length * 15 + 30);
    
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .fillColor('#E3F2FD')
       .fill();
    
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .strokeColor('#2196F3', 0.3)
       .lineWidth(1)
       .stroke();
    
    let yOffset = cardY + 20;
    education.forEach(item => {
      doc.fontSize(10)
         .fillColor('#424242')
         .font('Helvetica')
         .text(`✨ ${item}`, margin + 20, yOffset, { width: doc.page.width - 2 * margin - 40 });
      yOffset += 15;
    });
    
    doc.y = cardY + cardHeight + 15;
  }
  
  private addModernWarningSigns(doc: any, warnings: string[], margin: number): void {
    if (!warnings || warnings.length === 0) return;
    
    this.addModernSectionHeader(doc, '⚠️ When to Seek Immediate Care', '#FF6B6B', margin);
    
    const cardY = doc.y;
    const cardHeight = Math.max(60, warnings.length * 15 + 30);
    
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .fillColor('#FFEBEE')
       .fill();
    
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .strokeColor('#FF6B6B', 0.4)
       .lineWidth(2)
       .stroke();
    
    let yOffset = cardY + 20;
    warnings.forEach(warning => {
      doc.fontSize(10)
         .fillColor('#D32F2F')
         .font('Helvetica-Bold')
         .text(`🚨 ${warning}`, margin + 20, yOffset, { width: doc.page.width - 2 * margin - 40 });
      yOffset += 15;
    });
    
    doc.y = cardY + cardHeight + 15;
  }
  
  private addModernDisclaimer(doc: any, disclaimer: string, margin: number, textColor: string): void {
    doc.moveDown(1);
    
    const cardY = doc.y;
    const cardHeight = 50;
    
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .fillColor('#FAFAFA')
       .fill();
    
    doc.fontSize(9)
       .fillColor(textColor, 0.7)
       .font('Helvetica-Oblique')
       .text(disclaimer, margin + 15, cardY + 15, { 
         width: doc.page.width - 2 * margin - 30, 
         align: 'justify' 
       });
    
    doc.y = cardY + cardHeight + 20;
  }
  
  private addModernSignatureSection(doc: any, doctorName: string, isDraft: boolean, pageWidth: number, margin: number, primaryColor: string): void {
    const cardY = doc.y;
    const cardHeight = 80;
    
    // Signature card
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .fillColor('#F8F9FA')
       .fill();
    
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .strokeColor(primaryColor, 0.2)
       .lineWidth(1)
       .stroke();
    
    const signatureX = pageWidth - margin - 180;
    
    // Signature line
    doc.moveTo(signatureX, cardY + 25)
       .lineTo(signatureX + 150, cardY + 25)
       .strokeColor(primaryColor)
       .lineWidth(1)
       .stroke();
    
    // Doctor name
    doc.fontSize(12)
       .fillColor('#424242')
       .font('Helvetica-Bold')
       .text(`Dr. ${doctorName}`, signatureX, cardY + 35);
    
    // Digital signature text
    doc.fontSize(9)
       .fillColor('#666666')
       .font('Helvetica')
       .text('✅ Digitally Signed', signatureX, cardY + 50);
    
    if (!isDraft) {
      doc.text(`🕐 ${new Date().toLocaleString()}`, signatureX, cardY + 62);
    }
    
    doc.y = cardY + cardHeight + 15;
  }
  
  private addModernFooter(doc: any, pageWidth: number, margin: number, primaryColor: string): void {
    const footerY = doc.page.height - 40;
    
    // Footer background
    doc.rect(0, footerY - 10, pageWidth, 50)
       .fillColor(primaryColor, 0.05)
       .fill();
    
    // Footer text
    doc.fontSize(8)
       .fillColor('#666666')
       .font('Helvetica')
       .text('💻 Generated with care by Tenderly Care Platform | 📱 Your trusted women\'s health companion', 
             margin, footerY, 
             { align: 'center', width: pageWidth - 2 * margin });
  }
  
  // Helper methods
  
  private addModernSectionHeader(doc: any, title: string, color: string, margin: number): void {
    doc.moveDown(1);
    
    const headerY = doc.y;
    
    // Section header background
    doc.rect(margin, headerY, doc.page.width - 2 * margin, 25)
       .fillColor(color, 0.1)
       .fill();
    
    // Section title
    doc.fontSize(14)
       .fillColor(color)
       .font('Helvetica-Bold')
       .text(title, margin + 15, headerY + 6);
    
    doc.y = headerY + 35;
  }
  
  private addEmptyStateCard(doc: any, message: string, icon: string, margin: number): void {
    const cardY = doc.y;
    const cardHeight = 50;
    
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .fillColor('#F8F9FA')
       .fill();
    
    doc.fontSize(12)
       .fillColor('#999999')
       .font('Helvetica')
       .text(`${icon} ${message}`, margin + 20, cardY + 18, { align: 'center', width: doc.page.width - 2 * margin - 40 });
    
    doc.y = cardY + cardHeight + 15;
  }
  
  private addTreatmentCard(doc: any, title: string, content: string, margin: number, bgColor: string): void {
    const cardY = doc.y;
    const cardHeight = 50;
    
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .fillColor(bgColor)
       .fill();
    
    doc.fontSize(11)
       .fillColor('#424242')
       .font('Helvetica-Bold')
       .text(title, margin + 15, cardY + 12);
    
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#666666')
       .text(content, margin + 15, cardY + 28, { width: doc.page.width - 2 * margin - 30 });
    
    doc.y = cardY + cardHeight + 10;
  }
  
  private addTreatmentListCard(doc: any, title: string, items: string[], margin: number, bgColor: string): void {
    const cardY = doc.y;
    const cardHeight = Math.max(50, items.length * 12 + 25);
    
    doc.roundedRect(margin, cardY, doc.page.width - 2 * margin, cardHeight, 8)
       .fillColor(bgColor)
       .fill();
    
    doc.fontSize(11)
       .fillColor('#424242')
       .font('Helvetica-Bold')
       .text(title, margin + 15, cardY + 12);
    
    let yOffset = cardY + 28;
    items.forEach(item => {
      doc.fontSize(9)
         .fillColor('#666666')
         .font('Helvetica')
         .text(`• ${item}`, margin + 20, yOffset, { width: doc.page.width - 2 * margin - 35 });
      yOffset += 12;
    });
    
    doc.y = cardY + cardHeight + 10;
  }

  // Clean, Simple & Premium Design Methods
  
  private addCleanDraftWatermark(doc: any, pageWidth: number): void {
    doc.save();
    doc.rotate(-45, { origin: [pageWidth / 2, doc.page.height / 2] });
    doc.fontSize(80)
       .fillColor('#E8B4C8', 0.2) // Soft rose watermark
       .text('DRAFT', pageWidth / 2 - 80, doc.page.height / 2 - 30, {
         width: 160,
         align: 'center'
       });
    doc.restore();
  }
  
  private addCleanHeader(doc: any, pageWidth: number, margin: number, primaryColor: string, accentColor: string): void {
    // Simple elegant header
    doc.fontSize(28)
       .fillColor(primaryColor)
       .font('Helvetica-Bold')
       .text('Medical Prescription', margin, 60, { align: 'center', width: pageWidth - 2 * margin });
    
    // Elegant underline
    doc.moveTo(margin + 100, 95)
       .lineTo(pageWidth - margin - 100, 95)
       .strokeColor(accentColor)
       .lineWidth(2)
       .stroke();
    
    // Platform name
    doc.fontSize(12)
       .fillColor('#6C757D')
       .font('Helvetica')
       .text('Tenderly Care - Women\'s Health Platform', { align: 'center' });
    
    doc.y = 130;
  }
  
  private addCleanDoctorInfo(doc: any, data: PrescriptionData, margin: number, textColor: string): void {
    const startY = doc.y;
    const pageWidth = doc.page.width;
    
    // Doctor information in clean layout
    doc.fontSize(14)
       .fillColor(textColor)
       .font('Helvetica-Bold')
       .text('Attending Physician', margin, startY);
    
    doc.fontSize(16)
       .fillColor(textColor)
       .font('Helvetica-Bold')
       .text(`Dr. ${data.doctorName}`, margin, startY + 20);
    
    // Right side - Date and ID
    const rightX = pageWidth - margin - 150;
    doc.fontSize(11)
       .fillColor('#6C757D')
       .font('Helvetica')
       .text('Date:', rightX, startY)
       .text(data.date, rightX, startY + 15)
       .text('Consultation ID:', rightX, startY + 35)
       .text(data.consultationId, rightX, startY + 50);
    
    doc.y = startY + 80;
    this.addCleanSeparator(doc, margin);
  }
  
  private addCleanDiagnosis(doc: any, data: PrescriptionData, margin: number, primaryColor: string, lightGray: string): void {
    this.addCleanSectionTitle(doc, 'DIAGNOSIS', primaryColor, margin);
    
    // Calculate height based on content
    let contentHeight = 80;
    if (data.clinicalReasoning !== 'Not specified') {
      contentHeight += 25;
    }
    if (data.confidenceScore && data.confidenceScore !== 'Not specified') {
      contentHeight += 15;
    }
    if (data.processingNotes && data.processingNotes !== 'Not specified') {
      contentHeight += 25;
    }
    
    // Clean diagnosis box
    const boxY = doc.y;
    const boxHeight = contentHeight;
    
    doc.rect(margin, boxY, doc.page.width - 2 * margin, boxHeight)
       .fillColor(lightGray)
       .fill();
    
    let yOffset = boxY + 15;
    
    // Primary diagnosis
    doc.fontSize(13)
       .fillColor(primaryColor)
       .font('Helvetica-Bold')
       .text('Primary Diagnosis:', margin + 20, yOffset);
    
    yOffset += 20;
    doc.fontSize(12)
       .fillColor('#2C3E50')
       .font('Helvetica')
       .text(data.diagnosis, margin + 20, yOffset, { width: doc.page.width - 2 * margin - 40 });
    
    yOffset += 25;
    
    // Clinical reasoning
    if (data.clinicalReasoning !== 'Not specified') {
      doc.fontSize(11)
         .fillColor(primaryColor)
         .font('Helvetica-Bold')
         .text('Clinical Reasoning:', margin + 20, yOffset);
      
      yOffset += 15;
      doc.fontSize(10)
         .fillColor('#6C757D')
         .font('Helvetica')
         .text(data.clinicalReasoning, margin + 20, yOffset, { width: doc.page.width - 2 * margin - 40 });
      
      yOffset += 15;
    }
    
    // Confidence score
    if (data.confidenceScore && data.confidenceScore !== 'Not specified') {
      doc.fontSize(10)
         .fillColor('#6C757D')
         .font('Helvetica')
         .text(`Confidence Score: ${data.confidenceScore}`, margin + 20, yOffset);
      
      yOffset += 15;
    }
    
    // Processing notes
    if (data.processingNotes && data.processingNotes !== 'Not specified') {
      doc.fontSize(9)
         .fillColor('#999999')
         .font('Helvetica-Oblique')
         .text(`Notes: ${data.processingNotes}`, margin + 20, yOffset, { width: doc.page.width - 2 * margin - 40 });
    }
    
    doc.y = boxY + boxHeight + 20;
  }
  
  private addCleanMedications(doc: any, medications: any[], margin: number, primaryColor: string, lightGray: string): void {
    this.addCleanSectionTitle(doc, 'MEDICATIONS', primaryColor, margin);
    
    if (!medications || medications.length === 0) {
      doc.fontSize(12)
         .fillColor('#6C757D')
         .font('Helvetica')
         .text('No medications prescribed', margin + 20, doc.y);
      doc.moveDown(2);
      return;
    }
    
    medications.forEach((med, index) => {
      const medY = doc.y;
      const medHeight = 70;
      
      // Clean medication card
      doc.rect(margin, medY, doc.page.width - 2 * margin, medHeight)
         .fillColor(lightGray)
         .fill();
      
      // Medication number
      doc.circle(margin + 25, medY + 25, 15)
         .fillColor(primaryColor)
         .fill();
      
      doc.fontSize(12)
         .fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .text((index + 1).toString(), margin + 20, medY + 20);
      
      // Medication details
      doc.fontSize(14)
         .fillColor('#2C3E50')
         .font('Helvetica-Bold')
         .text(med.name, margin + 55, medY + 10);
      
      doc.fontSize(11)
         .fillColor('#6C757D')
         .font('Helvetica')
         .text(`Dosage: ${med.dosage} | Frequency: ${med.frequency}`, margin + 55, medY + 30)
         .text(`Duration: ${med.duration}`, margin + 55, medY + 45);
      
      doc.y = medY + medHeight + 10;
    });
    
    doc.moveDown(1);
  }
  
  private addCleanInvestigations(doc: any, investigations: any[], margin: number, primaryColor: string, lightGray: string): void {
    if (!investigations || investigations.length === 0) return;
    
    this.addCleanSectionTitle(doc, 'RECOMMENDED TESTS', primaryColor, margin);
    
    const boxY = doc.y;
    const boxHeight = Math.max(50, investigations.length * 20 + 20);
    
    doc.rect(margin, boxY, doc.page.width - 2 * margin, boxHeight)
       .fillColor(lightGray)
       .fill();
    
    let yOffset = boxY + 15;
    investigations.forEach((inv, index) => {
      doc.fontSize(12)
         .fillColor('#2C3E50')
         .font('Helvetica-Bold')
         .text(`${index + 1}. ${inv.name}`, margin + 20, yOffset);
      
      if (inv.instructions !== 'As recommended by doctor') {
        yOffset += 15;
        doc.fontSize(10)
           .fillColor('#6C757D')
           .font('Helvetica')
           .text(`   ${inv.instructions}`, margin + 30, yOffset, { width: doc.page.width - 2 * margin - 50 });
      }
      
      yOffset += 20;
    });
    
    doc.y = boxY + boxHeight + 20;
  }
  
  private addCleanTreatmentPlan(doc: any, treatmentPlan: any, margin: number, primaryColor: string, lightGray: string): void {
    let hasContent = false;
    
    if (treatmentPlan.primaryTreatment && treatmentPlan.primaryTreatment !== 'Not specified') {
      hasContent = true;
    }
    if (treatmentPlan.lifestyleModifications?.length > 0) {
      hasContent = true;
    }
    if (treatmentPlan.dietaryAdvice?.length > 0) {
      hasContent = true;
    }
    if (treatmentPlan.followUpTimeline && treatmentPlan.followUpTimeline !== 'Not specified') {
      hasContent = true;
    }
    
    if (!hasContent) return;
    
    this.addCleanSectionTitle(doc, 'TREATMENT PLAN', primaryColor, margin);
    
    const boxY = doc.y;
    let contentHeight = 20;
    
    // Calculate content height
    if (treatmentPlan.primaryTreatment && treatmentPlan.primaryTreatment !== 'Not specified') {
      contentHeight += 25;
    }
    if (treatmentPlan.lifestyleModifications?.length > 0) {
      contentHeight += 20 + (treatmentPlan.lifestyleModifications.length * 15);
    }
    if (treatmentPlan.dietaryAdvice?.length > 0) {
      contentHeight += 20 + (treatmentPlan.dietaryAdvice.length * 15);
    }
    if (treatmentPlan.followUpTimeline && treatmentPlan.followUpTimeline !== 'Not specified') {
      contentHeight += 25;
    }
    
    doc.rect(margin, boxY, doc.page.width - 2 * margin, contentHeight)
       .fillColor(lightGray)
       .fill();
    
    let yOffset = boxY + 15;
    
    if (treatmentPlan.primaryTreatment && treatmentPlan.primaryTreatment !== 'Not specified') {
      doc.fontSize(12)
         .fillColor('#2C3E50')
         .font('Helvetica-Bold')
         .text('Primary Treatment:', margin + 20, yOffset);
      yOffset += 15;
      doc.fontSize(11)
         .font('Helvetica')
         .text(treatmentPlan.primaryTreatment, margin + 25, yOffset, { width: doc.page.width - 2 * margin - 45 });
      yOffset += 25;
    }
    
    if (treatmentPlan.lifestyleModifications?.length > 0) {
      doc.fontSize(12)
         .fillColor('#2C3E50')
         .font('Helvetica-Bold')
         .text('Lifestyle Recommendations:', margin + 20, yOffset);
      yOffset += 15;
      treatmentPlan.lifestyleModifications.forEach(mod => {
        doc.fontSize(10)
           .font('Helvetica')
           .text(`• ${mod}`, margin + 25, yOffset, { width: doc.page.width - 2 * margin - 45 });
        yOffset += 15;
      });
      yOffset += 5;
    }
    
    if (treatmentPlan.dietaryAdvice?.length > 0) {
      doc.fontSize(12)
         .fillColor('#2C3E50')
         .font('Helvetica-Bold')
         .text('Dietary Recommendations:', margin + 20, yOffset);
      yOffset += 15;
      treatmentPlan.dietaryAdvice.forEach(advice => {
        doc.fontSize(10)
           .font('Helvetica')
           .text(`• ${advice}`, margin + 25, yOffset, { width: doc.page.width - 2 * margin - 45 });
        yOffset += 15;
      });
      yOffset += 5;
    }
    
    if (treatmentPlan.followUpTimeline && treatmentPlan.followUpTimeline !== 'Not specified') {
      doc.fontSize(12)
         .fillColor('#2C3E50')
         .font('Helvetica-Bold')
         .text('Follow-up:', margin + 20, yOffset);
      yOffset += 15;
      doc.fontSize(11)
         .font('Helvetica')
         .text(treatmentPlan.followUpTimeline, margin + 25, yOffset, { width: doc.page.width - 2 * margin - 45 });
    }
    
    doc.y = boxY + contentHeight + 20;
  }
  
  private addCleanPatientEducation(doc: any, education: string[], margin: number, primaryColor: string, lightGray: string): void {
    if (!education || education.length === 0) return;
    
    this.addCleanSectionTitle(doc, 'IMPORTANT INFORMATION', primaryColor, margin);
    
    const boxY = doc.y;
    const boxHeight = Math.max(40, education.length * 15 + 20);
    
    doc.rect(margin, boxY, doc.page.width - 2 * margin, boxHeight)
       .fillColor('#E8F4FD') // Light blue background for education
       .fill();
    
    let yOffset = boxY + 15;
    education.forEach(item => {
      doc.fontSize(11)
         .fillColor('#2C3E50')
         .font('Helvetica')
         .text(`• ${item}`, margin + 20, yOffset, { width: doc.page.width - 2 * margin - 40 });
      yOffset += 15;
    });
    
    doc.y = boxY + boxHeight + 20;
  }
  
  private addCleanWarningSigns(doc: any, warnings: string[], margin: number): void {
    if (!warnings || warnings.length === 0) return;
    
    this.addCleanSectionTitle(doc, 'URGENT - WHEN TO SEEK IMMEDIATE CARE', '#D32F2F', margin);
    
    const boxY = doc.y;
    const boxHeight = Math.max(40, warnings.length * 15 + 20);
    
    doc.rect(margin, boxY, doc.page.width - 2 * margin, boxHeight)
       .fillColor('#FFF3F3') // Light red background for warnings
       .fill();
    
    // Warning border
    doc.rect(margin, boxY, doc.page.width - 2 * margin, boxHeight)
       .strokeColor('#D32F2F')
       .lineWidth(2)
       .stroke();
    
    let yOffset = boxY + 15;
    warnings.forEach(warning => {
      doc.fontSize(11)
         .fillColor('#D32F2F')
         .font('Helvetica-Bold')
         .text(`⚠ ${warning}`, margin + 20, yOffset, { width: doc.page.width - 2 * margin - 40 });
      yOffset += 15;
    });
    
    doc.y = boxY + boxHeight + 20;
  }
  
  private addCleanDisclaimer(doc: any, disclaimer: string, margin: number, mediumGray: string): void {
    doc.moveDown(1);
    
    doc.fontSize(9)
       .fillColor(mediumGray)
       .font('Helvetica-Oblique')
       .text(disclaimer, margin, doc.y, { 
         width: doc.page.width - 2 * margin, 
         align: 'justify' 
       });
    
    doc.moveDown(2);
  }
  
  private addCleanSignature(doc: any, doctorName: string, isDraft: boolean, pageWidth: number, margin: number, primaryColor: string): void {
    const signatureY = doc.y;
    
    // Signature area
    doc.fontSize(11)
       .fillColor('#6C757D')
       .font('Helvetica')
       .text('Digitally Signed by:', pageWidth - margin - 200, signatureY);
    
    // Signature line
    doc.moveTo(pageWidth - margin - 200, signatureY + 25)
       .lineTo(pageWidth - margin - 50, signatureY + 25)
       .strokeColor(primaryColor)
       .lineWidth(1)
       .stroke();
    
    // Doctor name
    doc.fontSize(13)
       .fillColor(primaryColor)
       .font('Helvetica-Bold')
       .text(`Dr. ${doctorName}`, pageWidth - margin - 200, signatureY + 35);
    
    if (!isDraft) {
      doc.fontSize(9)
         .fillColor('#6C757D')
         .font('Helvetica')
         .text(`Signed on: ${new Date().toLocaleString()}`, pageWidth - margin - 200, signatureY + 55);
    }
    
    doc.y = signatureY + 80;
  }
  
  private addCleanFooter(doc: any, pageWidth: number, margin: number, mediumGray: string): void {
    const footerY = doc.page.height - 30;
    
    // Thin line above footer
    doc.moveTo(margin, footerY - 10)
       .lineTo(pageWidth - margin, footerY - 10)
       .strokeColor('#E8B4C8')
       .lineWidth(1)
       .stroke();
    
    // Footer text
    doc.fontSize(8)
       .fillColor(mediumGray)
       .font('Helvetica')
       .text('Generated by Tenderly Care Platform - Your trusted women\'s health partner', 
             margin, footerY, 
             { align: 'center', width: pageWidth - 2 * margin });
  }
  
  // Clean Helper Methods
  
  private addCleanSectionTitle(doc: any, title: string, color: string, margin: number): void {
    doc.moveDown(1);
    
    doc.fontSize(14)
       .fillColor(color)
       .font('Helvetica-Bold')
       .text(title, margin, doc.y);
    
    // Underline
    doc.moveTo(margin, doc.y + 5)
       .lineTo(margin + doc.widthOfString(title), doc.y + 5)
       .strokeColor(color)
       .lineWidth(1)
       .stroke();
    
    doc.moveDown(1);
  }
  
  private addCleanSeparator(doc: any, margin: number): void {
    doc.moveTo(margin, doc.y + 10)
       .lineTo(doc.page.width - margin, doc.y + 10)
       .strokeColor('#E8B4C8', 0.5)
       .lineWidth(1)
       .stroke();
    
    doc.moveDown(1);
  }
}

