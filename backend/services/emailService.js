/**
 * services/emailService.js
 * Sends transactional emails via nodemailer.
 *
 * For local dev we use Ethereal (fake SMTP — emails are captured at
 * https://ethereal.email and never actually delivered).
 *
 * For production, set EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASS
 * in your .env to point at a real provider (SendGrid, Mailgun, etc.).
 */

const nodemailer = require('nodemailer');

/* ── Build transporter ──────────────────────────────────────────────────── */
let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  if (process.env.EMAIL_HOST) {
    // Production path — real SMTP credentials in .env
    _transporter = nodemailer.createTransport({
      host:   process.env.EMAIL_HOST,
      port:   parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    // Dev path — auto-create a free Ethereal test account
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host:   'smtp.ethereal.email',
      port:   587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log(`📧 Ethereal test account: ${testAccount.user}`);
  }

  return _transporter;
}

/* ── Send farmer invite ───────────────────────────────────────────────────
   Called by POST /api/supervisor/invite-farmer
   ──────────────────────────────────────────────────────────────────────── */
async function sendFarmerInvite({ toEmail, toName, supervisorName, inviteUrl }) {
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: `"AgriSense" <no-reply@agrisense.app>`,
    to:   `"${toName}" <${toEmail}>`,
    subject: `${supervisorName} has invited you to AgriSense 🌱`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background:#f7faf8; margin:0; padding:0; }
          .wrap { max-width:520px; margin:40px auto; background:#fff; border-radius:16px;
                  border:1px solid #e2ece8; overflow:hidden; box-shadow:0 4px 24px rgba(27,58,45,.08); }
          .header { background:linear-gradient(135deg,#4a9470,#2d6649); padding:32px 36px; color:#fff; }
          .header h1 { margin:0 0 6px; font-size:1.4rem; letter-spacing:-.02em; }
          .header p  { margin:0; opacity:.85; font-size:.9rem; }
          .body { padding:32px 36px; }
          .body p { color:#3d5a4f; line-height:1.7; margin:0 0 16px; }
          .btn { display:inline-block; padding:14px 32px; background:linear-gradient(135deg,#4a9470,#2d6649);
                 color:#fff; text-decoration:none; border-radius:10px; font-weight:700;
                 font-size:.95rem; margin:8px 0 20px; }
          .note { font-size:.78rem; color:#7a9b8b; border-top:1px solid #e2ece8; padding-top:16px; margin-top:8px; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="header">
            <h1>🌱 Welcome to AgriSense</h1>
            <p>Your farm management platform</p>
          </div>
          <div class="body">
            <p>Hi <strong>${toName}</strong>,</p>
            <p>
              <strong>${supervisorName}</strong> has added you as a farmer on
              <strong>AgriSense</strong> — the platform that helps you track your
              crops, receive field visit reports, and stay connected with your supervisor.
            </p>
            <p>Click the button below to set your password and activate your account:</p>
            <a href="${inviteUrl}" class="btn">Activate My Account →</a>
            <p>This link will expire in <strong>48 hours</strong>.</p>
            <div class="note">
              If you didn't expect this invitation, you can safely ignore this email.
              The link will expire automatically.
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hi ${toName},\n\n${supervisorName} has invited you to AgriSense.\n\nActivate your account here:\n${inviteUrl}\n\nThis link expires in 48 hours.`,
  });

  // In dev, log the Ethereal preview URL so you can see the email
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`📧 Preview invite email → ${previewUrl}`);
  }

  return info;
}

module.exports = { sendFarmerInvite };
