import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Outbound email boundary. Uses SMTP via SMTP_HOST once credentials are
 * provisioned; until then dev mode logs the message server-side so the flow
 * is testable. Reset tokens are NEVER returned in API responses, and a
 * delivery failure is logged — never surfaced — so forgot-password keeps
 * answering identically (no user enumeration).
 */
@Injectable()
export class MailAdapter {
  private readonly logger = new Logger(MailAdapter.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return (this.config.get<string>('mail.smtpHost') ?? '').length > 0;
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    if (!this.configured) {
      // Dev fallback only — production must configure SMTP credentials.
      this.logger.log(`[DEV MAIL] to=${to} subject="${subject}" body="${body}"`);
      return;
    }
    try {
      await this.transport().sendMail({
        from: this.config.get<string>('mail.fromAddress'),
        to,
        subject,
        text: body,
      });
    } catch (err) {
      this.logger.error(`Mail send failed for "${subject}" -> ${to}: ${(err as Error).message ?? err}`);
    }
  }

  private transport(): Transporter {
    if (!this.transporter) {
      const port = this.config.get<number>('mail.smtpPort') ?? 587;
      const user = this.config.get<string>('mail.smtpUser') ?? '';
      const pass = this.config.get<string>('mail.smtpPassword') ?? '';
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('mail.smtpHost'),
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
    }
    return this.transporter;
  }
}