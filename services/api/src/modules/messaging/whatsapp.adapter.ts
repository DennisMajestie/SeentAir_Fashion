import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * WhatsApp Cloud API adapter (Meta Graph). Mirrors the Termii SMS adapter:
 * keys stay server-side, and without credentials the caller records the
 * message in-thread with no providerRef instead of pretending it was sent.
 */
@Injectable()
export class WhatsAppAdapter {
  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return (
      (this.config.get<string>('whatsapp.token') ?? '').length > 0 &&
      (this.config.get<string>('whatsapp.phoneNumberId') ?? '').length > 0
    );
  }

  async sendText(toPhone: string, message: string): Promise<{ providerRef: string }> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'WhatsApp provider not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing)',
      );
    }
    const url = `${this.config.get<string>('whatsapp.baseUrl')}/${this.config.get<string>(
      'whatsapp.graphVersion',
    )}/${this.config.get<string>('whatsapp.phoneNumberId')}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.get<string>('whatsapp.token')}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: false, body: message },
      }),
    });
    const body = (await response.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    const providerRef = body.messages?.[0]?.id;
    if (!response.ok || !providerRef) {
      throw new ServiceUnavailableException(
        `WhatsApp send failed: ${body.error?.message ?? response.statusText}`,
      );
    }
    return { providerRef };
  }
}
