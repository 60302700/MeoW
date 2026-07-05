import nodemailer from 'nodemailer';
import QRCode from 'qrcode';

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

export async function sendGuardianMagicLinkEmail(toEmail, guardianName, ownerName, catNames, magicLink) {
    const t = getTransporter();
    if (!t) {
        console.warn(`[Mailer] Would send guardian link to ${toEmail} — mailer disabled`);
        return;
    }

    const catList = catNames.length ? catNames.join(', ') : 'their cats';

    await t.sendMail({
        from: `"MeoW Safety" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: `Action required: ${ownerName} needs you to look after ${catList}`,
        html: `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#f5f3ff;padding:32px 16px;">
  <div style="max-width:460px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#9d174d,#ec4899);padding:24px 28px 20px;">
      <p style="margin:0;color:rgba(255,255,255,0.7);font-size:0.7rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">MeoW Safety Network</p>
      <h1 style="margin:6px 0 0;color:#ffffff;font-size:1.4rem;font-weight:800;">Guardian Alert</h1>
    </div>
    <div style="padding:28px 28px 20px;">
      <p style="margin:0 0 6px;font-size:1rem;font-weight:700;color:#0f172a;">Hi ${guardianName},</p>
      <p style="margin:0 0 20px;font-size:0.9rem;color:#475569;line-height:1.6;">
        <strong style="color:#0f172a;">${ownerName}</strong> has marked themselves as unavailable.
        You are their next guardian for <strong style="color:#9d174d;">${catList}</strong>.
        Please acknowledge within <strong>30 minutes</strong> or the next guardian will be contacted.
      </p>
      <a href="${magicLink}"
         style="display:block;text-align:center;padding:14px;background:linear-gradient(135deg,#9d174d,#ec4899);color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:0.95rem;">
        View Cats &amp; Acknowledge
      </a>
    </div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 28px;">
      <p style="margin:0;font-size:0.72rem;color:#94a3b8;">MeoW — Cat Safety Network &nbsp;·&nbsp; This link expires in 48 hours</p>
    </div>
  </div>
</div>`,
    });
}

export async function sendWalletCardEmail(toEmail, guardianName, owner, cats, magicLink) {
    const t = getTransporter();
    if (!t) {
        console.warn(`[Mailer] Would send wallet card to ${toEmail} — mailer disabled`);
        return;
    }

    const qrBuffer = await QRCode.toBuffer(magicLink, { width: 200, margin: 2 });

    const catCards = cats.map(cat => `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;">
        <p style="margin:0 0 10px;font-size:1rem;font-weight:800;color:#0f172a;">${cat.name}${cat.breed ? ` <span style="font-weight:400;color:#64748b;font-size:0.85rem;">· ${cat.breed}</span>` : ''}${cat.age ? ` <span style="font-weight:400;color:#64748b;font-size:0.85rem;">· ${cat.age} yrs</span>` : ''}</p>
        ${cat.careInstructions?.feedingSchedule ? `<p style="margin:0 0 5px;font-size:0.82rem;color:#475569;"><strong>Feeding:</strong> ${cat.careInstructions.feedingSchedule}</p>` : ''}
        ${cat.careInstructions?.allergies ? `<p style="margin:0 0 5px;font-size:0.82rem;color:#dc2626;"><strong>Allergies:</strong> ${cat.careInstructions.allergies}</p>` : ''}
        ${cat.careInstructions?.medications ? `<p style="margin:0 0 5px;font-size:0.82rem;color:#475569;"><strong>Medications:</strong> ${cat.careInstructions.medications}</p>` : ''}
        ${cat.careInstructions?.vetName ? `<p style="margin:0;font-size:0.82rem;color:#475569;"><strong>Vet:</strong> ${cat.careInstructions.vetName}${cat.careInstructions.vetPhone ? ` · ${cat.careInstructions.vetPhone}` : ''}</p>` : ''}
      </div>`).join('');

    await t.sendMail({
        from: `"MeoW Safety" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: `Your guardian wallet card for ${owner.name}'s cats`,
        attachments: [
            { filename: 'qr.png', content: qrBuffer, cid: 'guardian-qr' },
        ],
        html: `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#f5f3ff;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.10);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#9d174d,#ec4899);padding:24px 28px 20px;">
      <p style="margin:0;color:rgba(255,255,255,0.7);font-size:0.7rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">MeoW Safety Network</p>
      <h1 style="margin:6px 0 0;color:#ffffff;font-size:1.4rem;font-weight:800;">Your Guardian Wallet Card</h1>
    </div>

    <div style="padding:24px 28px;">

      <p style="margin:0 0 20px;font-size:0.9rem;color:#475569;line-height:1.6;">
        Hi <strong style="color:#0f172a;">${guardianName}</strong>, thank you for confirming. Here is everything you need to care for the cats.
      </p>

      <!-- Owner details -->
      <div style="background:linear-gradient(135deg,#fdf2f8,#fce7f3);border:1px solid #fbcfe8;border-radius:12px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:0.7rem;font-weight:700;color:#9d174d;text-transform:uppercase;letter-spacing:0.06em;">Owner</p>
        <p style="margin:0 0 4px;font-size:1rem;font-weight:800;color:#0f172a;">${owner.name}</p>
        ${owner.phone ? `<p style="margin:0 0 2px;font-size:0.85rem;color:#475569;">Phone: ${owner.phone}</p>` : ''}
        <p style="margin:0;font-size:0.85rem;color:#475569;">Email: ${owner.email}</p>
      </div>

      <!-- Cat care cards -->
      <p style="margin:0 0 10px;font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Cats in your care</p>
      ${catCards}

      <!-- QR + link -->
      <div style="text-align:center;margin-top:20px;padding:20px;background:#f8fafc;border-radius:12px;">
        <p style="margin:0 0 12px;font-size:0.78rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Your access link</p>
        <img src="cid:guardian-qr" width="160" height="160" alt="Scan to open guardian page"
             style="border-radius:10px;border:4px solid #e2e8f0;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;">
        <p style="margin:0 0 12px;font-size:0.75rem;color:#94a3b8;">Scan or click the button below to access the full care page</p>
        <a href="${magicLink}"
           style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#9d174d,#ec4899);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:0.85rem;">
          Open Guardian Page
        </a>
      </div>
    </div>

    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 28px;">
      <p style="margin:0;font-size:0.72rem;color:#94a3b8;">MeoW — Cat Safety Network &nbsp;·&nbsp; Keep this email safe for reference</p>
    </div>
  </div>
</div>`,
    });
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