import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export interface PaystackInitResult {
  authorizationUrl: string;
  reference: string;
}

/**
 * Paystack adapter — the only place Paystack is spoken to. Keys live
 * server-side only (security requirement); frontends receive the
 * authorization URL, never credentials.
 */
@Injectable()
export class PaystackService {
  constructor(private readonly config: ConfigService) {}

  private get secretKey(): string {
    return this.config.get<string>('paystack.secretKey') ?? '';
  }

  get configured(): boolean {
    return this.secretKey.length > 0;
  }

  async initializeTransaction(
    email: string,
    amountMajor: number,
    reference: string,
  ): Promise<PaystackInitResult> {
    this.assertConfigured();
    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        // Paystack expects the minor unit (kobo for NGN).
        amount: Math.round(amountMajor * 100),
        reference,
      }),
    });
    const body = (await response.json()) as {
      status: boolean;
      message?: string;
      data?: { authorization_url: string; reference: string };
    };
    if (!response.ok || !body.status || !body.data) {
      throw new ServiceUnavailableException(
        `Paystack initialization failed: ${body.message ?? response.statusText}`,
      );
    }
    return { authorizationUrl: body.data.authorization_url, reference: body.data.reference };
  }

  /** Webhook signature check: HMAC-SHA512 of the raw body with the secret key. */
  verifyWebhookSignature(rawBody: string, signature: string | undefined): void {
    this.assertConfigured();
    const expected = createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    if (!signature || signature !== expected) {
      throw new UnauthorizedException('Invalid Paystack webhook signature');
    }
  }

  private get baseUrl(): string {
    return this.config.get<string>('paystack.baseUrl') ?? 'https://api.paystack.co';
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Paystack is not configured (PAYSTACK_SECRET_KEY missing) — use an offline payment method or configure keys',
      );
    }
  }
}
