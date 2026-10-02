// lib/email.js

import { Resend } from 'resend';

let resendClient = null;
function getResend() {
    if (resendClient) return resendClient;
    if (!process.env.RESEND_API_KEY) return null;
    resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
}

/**
 * Tries to import and run generateInvoicePdf.
 * Returns a Buffer on success, null on any failure (pdfkit bundling issues, etc.)
 */
async function tryGenerateInvoice(params) {
    try {
        const { generateInvoicePdf } = await import('./invoice.js');
        const pdf = await generateInvoicePdf(params);
        console.log('[email] Invoice PDF generated OK, size:', pdf?.length);
        return pdf;
    } catch (err) {
        console.error('[email] Invoice PDF generation failed (email will still send without attachment):', err?.message || err);
        return null;
    }
}

/**
 * @param {Object} params
 * @param {string} params.studentEmail
 * @param {string} params.courseName
 * @param {number} params.amount            final amount paid, in INR
 * @param {string} params.paymentId         razorpay_payment_id, used as invoice no.
 * @param {string} [params.couponCode]
 * @param {number} [params.originalPrice]
 */
export async function sendPurchaseEmail({
    studentEmail,
    courseName,
    amount,
    paymentId,
    couponCode,
    originalPrice,
}) {
    console.log('[email] sendPurchaseEmail called for:', studentEmail, '| course:', courseName, '| amount:', amount);

    const resend = getResend();
    if (!resend) {
        console.error('[email] FAILED: RESEND_API_KEY is not set in .env.local');
        return;
    }
    if (!process.env.EMAIL_FROM) {
        console.error('[email] FAILED: EMAIL_FROM is not set in .env.local');
        return;
    }

    console.log('[email] Using FROM:', process.env.EMAIL_FROM);

    const purchaseTimeIST = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    // PDF is best-effort — email always sends even without it
    const invoicePdf = await tryGenerateInvoice({
        invoiceNo: paymentId,
        studentEmail,
        courseName,
        amount,
        purchaseTimeIST,
        couponCode,
        originalPrice,
    });

    const couponLine = couponCode && originalPrice && originalPrice > amount
        ? `<li><strong>Coupon Applied:</strong> ${couponCode} (–₹${(originalPrice - amount).toFixed(2)})</li>`
        : '';

    const html = `
        <div style="font-family: Arial, sans-serif; font-size: 15px; color: #111; line-height: 1.6;">
            <p>Hello! 🎉 Welcome to Y N Classes.</p>
            <p>We have received your payment for <strong>${courseName}</strong>.</p>
            <ul>
                <li><strong>Amount Paid:</strong> ₹${amount.toFixed(2)}</li>
                ${couponLine}
                <li><strong>Account email:</strong> ${studentEmail}</li>
                <li><strong>Purchased at:</strong> ${purchaseTimeIST} IST</li>
                <li><strong>Payment ID:</strong> ${paymentId}</li>
            </ul>
            <p>Your learning journey starts now! Log in at
            <a href="https://ynclasses.in.net">ynclasses.in.net</a> to access your course.</p>
            <p>If you have any questions, call us at
            <a href="tel:+919619415869">+91 96194 15869</a> or email
            <a href="mailto:ynclasses2016@gmail.com">ynclasses2016@gmail.com</a>.</p>
        </div>
    `;

    const text =
        `Welcome to Y N Classes!\n\n` +
        `We have received your payment for ${courseName}.\n\n` +
        `Amount Paid: Rs. ${amount.toFixed(2)}\n` +
        (couponCode && originalPrice && originalPrice > amount
            ? `Coupon Applied: ${couponCode} (-Rs. ${(originalPrice - amount).toFixed(2)})\n`
            : '') +
        `Account email: ${studentEmail}\n` +
        `Purchased at: ${purchaseTimeIST} IST\n` +
        `Payment ID: ${paymentId}\n\n` +
        `Log in at https://ynclasses.in.net to access your course.\n\n` +
        `Questions? Call +91 96194 15869 or email ynclasses2016@gmail.com`;

    const attachments = invoicePdf
        ? [{ filename: `invoice_${paymentId}.pdf`, content: invoicePdf.toString('base64') }]
        : [];

    console.log('[email] Sending via Resend... attachments:', attachments.length > 0 ? 'invoice PDF' : 'none (PDF skipped)');

    try {
        const { data, error } = await resend.emails.send({
            from: `Y N Classes <${process.env.EMAIL_FROM}>`,
            to: studentEmail,
            subject: `Payment Received – ${courseName} | Y N Classes`,
            text,
            html,
            attachments,
        });

        if (error) {
            console.error('[email] Resend API returned error:', JSON.stringify(error));
        } else {
            console.log('[email] Email sent successfully. Resend ID:', data?.id);
        }
    } catch (err) {
        console.error('[email] Resend threw an exception:', err?.message || err);
    }
}