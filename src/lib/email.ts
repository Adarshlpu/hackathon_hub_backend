import nodemailer from "nodemailer";
import { logger } from "./logger.js";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    await transporter.sendMail({
      from: `"HackHub" <${process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    logger.info({ to: options.to, subject: options.subject }, "Email sent");
  } catch (err) {
    logger.error({ err, to: options.to }, "Email send failed");
    throw err;
  }
}

export function verificationEmailHtml(name: string, token: string): string {
  const url = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2>Welcome to HackHub, ${name}!</h2>
      <p>Please verify your email address by clicking the button below:</p>
      <a href="${url}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
        Verify Email
      </a>
      <p>Or copy this link: ${url}</p>
      <p>This link expires in 24 hours.</p>
    </div>
  `;
}

export function passwordResetEmailHtml(name: string, token: string): string {
  const url = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2>Reset Your Password, ${name}</h2>
      <p>You requested a password reset. Click below to set a new password:</p>
      <a href="${url}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
        Reset Password
      </a>
      <p>Or copy this link: ${url}</p>
      <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    </div>
  `;
}
