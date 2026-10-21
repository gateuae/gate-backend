import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT || '587', 10),
        secure: parseInt(SMTP_PORT || '587', 10) === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });
      console.log('📧 SMTP transporter initialized for:', SMTP_USER);
    } catch (err) {
      console.warn('⚠️ Failed to initialize SMTP transporter:', err.message);
    }
  }

  return transporter;
}

/**
 * Sends an email notification when a new contact inquiry is submitted.
 */
export async function sendContactNotification({ name, email, branch, message }) {
  const mailer = getTransporter();
  const recipient = process.env.NOTIFICATION_EMAIL || process.env.SMTP_USER;

  if (!mailer || !recipient) {
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const info = await mailer.sendMail({
      from: `"Gate Hypermarket Website" <${process.env.SMTP_USER}>`,
      to: recipient,
      replyTo: email,
      subject: `New Customer Inquiry: ${name} [${branch || 'General'}]`,
      text: `Customer Name: ${name}\nEmail: ${email}\nBranch: ${branch || 'General'}\n\nMessage:\n${message}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a;">New Customer Inquiry</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Branch:</strong> ${branch || 'General'}</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-line; background: #f8fafc; padding: 12px; border-radius: 4px;">${message}</p>
        </div>
      `,
    });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send contact notification email:', error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Sends an email notification when a candidate applies for a job.
 */
export async function sendJobApplicationNotification({ jobTitle, applicantName, email, phone, resumeUrl }) {
  const mailer = getTransporter();
  const recipient = process.env.NOTIFICATION_EMAIL || process.env.SMTP_USER;

  if (!mailer || !recipient) {
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const info = await mailer.sendMail({
      from: `"Gate Hypermarket Careers" <${process.env.SMTP_USER}>`,
      to: recipient,
      replyTo: email,
      subject: `New Candidate Application: ${applicantName} for ${jobTitle}`,
      text: `Candidate: ${applicantName}\nPosition: ${jobTitle}\nEmail: ${email}\nPhone: ${phone}\nResume: ${resumeUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a;">New Job Application Received</h2>
          <p><strong>Position:</strong> ${jobTitle}</p>
          <p><strong>Candidate:</strong> ${applicantName}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>CV / Resume:</strong> <a href="${resumeUrl}" target="_blank">View Uploaded Resume</a></p>
        </div>
      `,
    });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send job application email:', error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Sends an email notification with password reset instructions for Admin.
 */
export async function sendAdminPasswordResetEmail({ email, username, resetLink, resetToken }) {
  const mailer = getTransporter();

  if (!mailer) {
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    const info = await mailer.sendMail({
      from: `"Gate Hypermarket Admin Security" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Gate Hypermarket Admin Password Reset Request`,
      text: `Hello ${username || 'Admin'},\n\nA password reset request was received for your Gate Hypermarket Admin Portal account.\n\nTo reset your password, visit:\n${resetLink}\n\nReset Token: ${resetToken}\n\nThis token will expire in 1 hour. If you did not request this, please disregard this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #0B1A22; margin-top: 0;">Admin Password Reset</h2>
          <p style="color: #475569; font-size: 15px;">Hello <strong>${username || 'Admin'}</strong>,</p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">A request was received to reset your password for the Gate Hypermarket Admin Portal.</p>
          <div style="margin: 24px 0;">
            <a href="${resetLink}" style="display: inline-block; background: #E65100; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14px;">
              Reset Admin Password
            </a>
          </div>
          <p style="color: #64748b; font-size: 12px;">This link will expire in <strong>1 hour</strong>. If you did not request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send admin reset email:', error.message);
    return { sent: false, error: error.message };
  }
}
