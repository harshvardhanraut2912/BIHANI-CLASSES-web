// SAVE THIS FILE AT: lib/invoice.js  (new file)
//
// Builds a simple one-page invoice PDF as a Buffer using pdfkit.
// No external template/service needed -- everything is drawn in code.
//
// npm install pdfkit

import PDFDocument from 'pdfkit';

/**
 * @param {Object} params
 * @param {string} params.invoiceNo        e.g. razorpay payment id
 * @param {string} params.studentEmail
 * @param {string} params.courseName
 * @param {number} params.amount           final amount paid, in INR
 * @param {string} params.purchaseTimeIST  pre-formatted display string
 * @param {string} [params.couponCode]
 * @param {number} [params.originalPrice]
 * @returns {Promise<Buffer>}
 */
export function generateInvoicePdf({
    invoiceNo,
    studentEmail,
    courseName,
    amount,
    purchaseTimeIST,
    couponCode,
    originalPrice,
}) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // ---- Header ----
            doc.fontSize(20).fillColor('#111').text('Y N Classes', { continued: false });
            doc.fontSize(10).fillColor('#555').text('Payment Invoice / Receipt');
            doc.moveDown(1.5);

            // ---- Invoice meta ----
            doc.fontSize(10).fillColor('#111');
            doc.text(`Invoice No: ${invoiceNo}`);
            doc.text(`Date: ${purchaseTimeIST}`);
            doc.text(`Billed To: ${studentEmail}`);
            doc.moveDown(1);

            // ---- Divider ----
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
            doc.moveDown(1);

            // ---- Table header ----
            const tableTop = doc.y;
            doc.fontSize(10).fillColor('#111');
            doc.text('Description', 50, tableTop, { width: 320 });
            doc.text('Amount (INR)', 400, tableTop, { width: 145, align: 'right' });
            doc.moveDown(0.5);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
            doc.moveDown(0.5);

            // ---- Line item(s) ----
            const rowY = doc.y;
            doc.text(courseName, 50, rowY, { width: 320 });
            doc.text(
                `${(originalPrice ?? amount).toFixed(2)}`,
                400,
                rowY,
                { width: 145, align: 'right' }
            );

            if (couponCode && originalPrice != null && originalPrice > amount) {
                doc.moveDown(0.5);
                const discY = doc.y;
                doc.fillColor('#555').text(`Coupon applied: ${couponCode}`, 50, discY, { width: 320 });
                doc.text(`- ${(originalPrice - amount).toFixed(2)}`, 400, discY, { width: 145, align: 'right' });
                doc.fillColor('#111');
            }

            doc.moveDown(1);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
            doc.moveDown(0.5);

            // ---- Total ----
            const totalY = doc.y;
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('Total Paid', 50, totalY, { width: 320 });
            doc.text(`Rs. ${amount.toFixed(2)}`, 400, totalY, { width: 145, align: 'right' });
            doc.font('Helvetica');

            doc.moveDown(3);
            doc.fontSize(9).fillColor('#777').text(
                'This is a system-generated invoice for a payment made via Razorpay. ' +
                'For any questions, contact +91 96194 15869 or ynclassses2016@gmail.com.',
                { width: 495 }
            );

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}