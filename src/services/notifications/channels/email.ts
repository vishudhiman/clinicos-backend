import nodemailer, { type Transporter } from "nodemailer";
import type { Notification, Patient } from "@prisma/client";
import type { NotificationChannelHandler, ChannelSendResult } from "../types.js";

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export class EmailChannel implements NotificationChannelHandler {
  async send(notification: Notification, patient: Patient): Promise<ChannelSendResult> {
    if (!patient.email) {
      return { success: false, error: "Patient has no email on file." };
    }

    const client = getTransporter();
    if (!client) {
      return {
        success: false,
        error: "Email is not configured (missing SMTP_HOST/PORT/USER/PASS in .env).",
      };
    }

    try {
      await client.sendMail({
        from: process.env.EMAIL_FROM || "ClinicOS <no-reply@clinicos.dev>",
        to: patient.email,
        subject: notification.title,
        text: notification.message,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
