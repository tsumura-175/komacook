import "server-only";
import nodemailer from "nodemailer";

export function createMailTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!host || !Number.isInteger(port)) throw new Error("SMTP_NOT_CONFIGURED");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}
