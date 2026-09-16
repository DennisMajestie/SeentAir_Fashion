import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Termii SMS adapter (Nigerian delivery reliability — provider TBD between
 * Termii and Twilio; swap behind this class if Twilio wins). Keys stay
 * server-side; without a key the caller records the notification as skipped.
 */
@Injectable()
export class TermiiAdapter {
  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return (this.config.get<string>('sms.termiiApiKey') ?? '').length > 0;
  }

  async sendSms(phone: string, message: string): Promise<{ providerRef: string }> {
    if (!this.configured) {
      throw new ServiceUnavailableException('SMS provider not configured (TERMII_API_KEY missing)');
    }
    const response = await fetch(`${this.config.get<string>('sms.termiiBaseUrl')}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.config.get<string>('sms.termiiApiKey'),
        to: phone,
        from: this.config.get<string>('sms.senderId'),
        sms: message,
        type: 'plain',
        channel: 'generic',
      }),
    });
    const body = (await response.json()) as { message_id?: string; message?: string };
    if (!response.ok || !body.message_id) {
      throw new ServiceUnavailableException(`Termii send failed: ${body.message ?? response.statusText}`);
    }
    return { providerRef: body.message_id };
  }
}
