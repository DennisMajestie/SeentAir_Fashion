import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Outbound email boundary. A real SMTP/transactional provider (e.g. Resend,
 * SES, or Termii email) plugs in here via env config; until one is
 * provisioned, dev mode logs the message server-side so the flow is
 * testable. Reset tokens are NEVER returned in API responses.
 */
@Injectable()
export class MailAdapter {
  private readonly logger = new Logger(MailAdapter.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return (this.config.get<string>('mail.smtpHost') ?? '').length > 0;
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    if (!this.configured) {
      // Dev fallback only — production must configure a provider.
      this.logger.log(`[DEV MAIL] to=${to} subject="${subject}" body="${body}"`);
      return;
    }
    // SMTP/provider integration lands when credentials are provisioned.
    throw new Error('Mail provider integration not yet implemented');
  }
}
