import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
        console.warn('[Mailer] GMAIL_USER or GMAIL_APP_PASSWORD not set — emails disabled.');
        return null;
    }
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
    });
    return transporter;
}

export async function sendPasswordResetEmail(toEmail, resetToken) {
    const t = getTransporter();
    if (!t) return;

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

    await t.sendMail({
        from: `"MeoW Safety" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: '🐱 Reset your MeoW password',
        html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#fdf6ff;border-radius:12px;">
                <h2 style="color:#d946a8;margin-bottom:8px;">Password Reset</h2>
                <p style="color:#374151;">We received a request to reset the password for your MeoW account.</p>
                <a href="${resetLink}"
                   style="display:inline-block;margin:24px 0;padding:12px 28px;background:#d946a8;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:1rem;">
                    Reset Password
                </a>
                <p style="color:#6b7280;font-size:0.85rem;">This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
                <p style="color:#9ca3af;font-size:0.75rem;">MeoW — Cat Safety Network</p>
            </div>
        `,
    });
}