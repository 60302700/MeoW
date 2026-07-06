import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import sharp from 'sharp';

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

function xmlEsc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function trunc(s, max) {
    s = String(s || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function buildWalletCardSvg(guardianName, owner, cats, qrDataUri) {
    const W = 560;
    const HEADER_H = 80;
    const BODY_PAD_X = 28;
    const BODY_PAD_Y = 28;
    const QR_SIZE = 160;
    const DIV_X = BODY_PAD_X + QR_SIZE + 24;
    const RIGHT_X = DIV_X + 20;
    const FOOTER_H = 48;

    // Pre-calculate right column height (no icon)
    let rightH = 0;
    rightH += 20;                            // "OWNER" label
    rightH += 24;                            // owner name
    if (owner.phone) rightH += 22;
    rightH += 22;                            // email
    rightH += 32;                            // separator with spacing
    rightH += 20;                            // "CATS" label
    for (const cat of cats) {
        rightH += 20;                        // cat name
        if (cat.breed || cat.age) rightH += 18;
        rightH += 6;
    }

    const qrColH = QR_SIZE + 22;
    const BODY_H = Math.max(qrColH, rightH) + BODY_PAD_Y * 2;
    const TOTAL_H = HEADER_H + BODY_H + FOOTER_H;

    const p = [];
    p.push(`<defs>
    <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="#9d174d"/>
      <stop offset="55%" stop-color="#db2777"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
    <clipPath id="cc"><rect width="${W}" height="${TOTAL_H}" rx="20"/></clipPath>
  </defs>`);

    p.push(`<g clip-path="url(#cc)">`);
    p.push(`<rect width="${W}" height="${TOTAL_H}" fill="white"/>`);

    // Header
    p.push(`<rect width="${W}" height="${HEADER_H}" fill="url(#hg)"/>`);
    p.push(`<text x="24" y="52" font-family="Helvetica,Arial,sans-serif" font-size="28" font-weight="900" fill="white">MeoW</text>`);

    const PW = 132, PH = 28, PX = W - 24 - PW, PY = (HEADER_H - PH) / 2;
    p.push(`<rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="${PH / 2}" fill="rgba(255,255,255,0.18)" stroke="white" stroke-width="1.5"/>`);
    p.push(`<text x="${PX + PW / 2}" y="${PY + 18.5}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="9.5" font-weight="700" fill="white" letter-spacing="1.2">GUARDIAN CARD</text>`);

    // Body
    const BY = HEADER_H + BODY_PAD_Y;
    const QX = BODY_PAD_X;
    const QY = BY;

    // QR code with border
    p.push(`<rect x="${QX - 8}" y="${QY - 8}" width="${QR_SIZE + 16}" height="${QR_SIZE + 16}" rx="12" fill="white" stroke="#e2e8f0" stroke-width="1.5"/>`);
    p.push(`<image x="${QX}" y="${QY}" width="${QR_SIZE}" height="${QR_SIZE}" href="${qrDataUri}"/>`);
    p.push(`<text x="${QX + QR_SIZE / 2}" y="${QY + QR_SIZE + 20}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="8.5" font-weight="700" fill="#94a3b8" letter-spacing="1.4">SCAN IN EMERGENCY</text>`);

    // Vertical divider
    p.push(`<line x1="${DIV_X}" y1="${HEADER_H + 18}" x2="${DIV_X}" y2="${HEADER_H + BODY_H - 18}" stroke="#e2e8f0" stroke-width="1.5"/>`);

    // Right column — clean, no icon
    let ry = BY;

    // "OWNER" label then owner name with clear separation
    p.push(`<text x="${RIGHT_X}" y="${ry}" font-family="Helvetica,Arial,sans-serif" font-size="8.5" font-weight="700" fill="#94a3b8" letter-spacing="1.2">OWNER</text>`);
    ry += 20;
    p.push(`<text x="${RIGHT_X}" y="${ry}" font-family="Helvetica,Arial,sans-serif" font-size="17" font-weight="800" fill="#0f172a">${xmlEsc(trunc(owner.name, 22))}</text>`);
    ry += 24;

    if (owner.phone) {
        p.push(`<text x="${RIGHT_X}" y="${ry}" font-family="Helvetica,Arial,sans-serif" font-size="12.5" fill="#475569">${xmlEsc(trunc(owner.phone, 24))}</text>`);
        ry += 22;
    }
    p.push(`<text x="${RIGHT_X}" y="${ry}" font-family="Helvetica,Arial,sans-serif" font-size="11.5" fill="#475569">${xmlEsc(trunc(owner.email, 26))}</text>`);
    ry += 22;

    // Separator
    ry += 14;
    p.push(`<line x1="${RIGHT_X}" y1="${ry}" x2="${W - 24}" y2="${ry}" stroke="#e2e8f0" stroke-width="1"/>`);
    ry += 18;

    // "CATS" label then cat names with clear separation
    p.push(`<text x="${RIGHT_X}" y="${ry}" font-family="Helvetica,Arial,sans-serif" font-size="8.5" font-weight="700" fill="#94a3b8" letter-spacing="1.2">CATS</text>`);
    ry += 20;

    for (const cat of cats) {
        const meta = [cat.breed, cat.age ? `${cat.age} yrs` : null].filter(Boolean).join(', ');
        p.push(`<text x="${RIGHT_X}" y="${ry}" font-family="Helvetica,Arial,sans-serif" font-size="13" font-weight="700" fill="#0f172a">${xmlEsc(trunc(cat.name, 20))}</text>`);
        ry += 20;
        if (meta) {
            p.push(`<text x="${RIGHT_X}" y="${ry}" font-family="Helvetica,Arial,sans-serif" font-size="10.5" fill="#64748b">${xmlEsc(trunc(meta, 24))}</text>`);
            ry += 18;
        }
        ry += 6;
    }

    // Footer
    const FY = HEADER_H + BODY_H;
    p.push(`<line x1="0" y1="${FY}" x2="${W}" y2="${FY}" stroke="#e2e8f0" stroke-width="1"/>`);
    p.push(`<text x="${W / 2}" y="${FY + 30}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="10.5" fill="#94a3b8">MeoW Emergency Network  ·  Protected ✓</text>`);

    p.push(`</g>`);

    return `<svg width="${W}" height="${TOTAL_H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  ${p.join('\n  ')}
</svg>`;
}

export async function sendWalletCardEmail(toEmail, guardianName, owner, cats, magicLink) {
    const t = getTransporter();
    if (!t) {
        console.warn(`[Mailer] Would send wallet card to ${toEmail} — mailer disabled`);
        return;
    }

    const qrBuffer = await QRCode.toBuffer(magicLink, { width: 160, margin: 1 });
    const qrDataUri = `data:image/png;base64,${qrBuffer.toString('base64')}`;

    const svg = buildWalletCardSvg(guardianName, owner, cats, qrDataUri);
    // density:144 renders at 2× resolution for crisp text on all displays
    const cardPng = await sharp(Buffer.from(svg, 'utf8'), { density: 144 }).png().toBuffer();

    await t.sendMail({
        from: `"MeoW Safety" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: `Your guardian wallet card for ${owner.name}'s cats`,
        attachments: [
            { filename: 'wallet-card.png', content: cardPng, cid: 'wallet-card', contentDisposition: 'inline' },
            { filename: 'MeoW-WalletCard.png', content: cardPng, contentDisposition: 'attachment' },
        ],
        html: `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#f5f3ff;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="margin:0 0 16px;font-size:0.9rem;color:#475569;">
      Hi <strong style="color:#0f172a;">${xmlEsc(guardianName)}</strong>, thank you for confirming.
      Your wallet card with all care details is shown below — you can also save it from the attachment.
    </p>
    <img src="cid:wallet-card" alt="Guardian Wallet Card"
         style="display:block;width:100%;max-width:560px;border-radius:20px;box-shadow:0 8px 32px rgba(0,0,0,0.12);">
    <div style="margin:20px 0;text-align:center;">
      <a href="${magicLink}"
         style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,#9d174d,#ec4899);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:0.95rem;">
        Open Guardian Page
      </a>
      <p style="margin:12px 0 0;font-size:0.78rem;color:#64748b;">
        Can't scan the QR? Use this link:<br>
        <a href="${magicLink}" style="color:#9d174d;word-break:break-all;">${magicLink}</a>
      </p>
    </div>
    <p style="margin:0;text-align:center;font-size:0.72rem;color:#94a3b8;">
      MeoW — Cat Safety Network &nbsp;·&nbsp; Keep this email safe for reference
    </p>
  </div>
</div>`,
    });
}

