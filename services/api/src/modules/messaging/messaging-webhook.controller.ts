import {
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { MessagingService } from './messaging.service';

interface WhatsappWebhookPayload {
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string } }[];
        messages?: {
          from?: string;
          id?: string;
          type?: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
}

/**
 * WhatsApp Cloud API webhook (Meta server-to-server). Subscribed via GET
 * challenge, inbound messages arrive POST with an HMAC-SHA256 signature.
 * Every inbound message lands in the conversation queue, so a message
 * arriving outside business hours is recorded, never dropped.
 */
@Controller('messaging/whatsapp')
export class MessagingWebhookController {
  private readonly logger = new Logger(MessagingWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly messaging: MessagingService,
  ) {}

  /** Meta subscription handshake: echo the challenge when the token matches. */
  @Public()
  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const expected = this.config.get<string>('whatsapp.verifyToken') ?? '';
    if (mode !== 'subscribe' || expected.length === 0 || verifyToken !== expected) {
      res.status(403).send('Forbidden');
      return;
    }
    res.status(200).send(challenge);
  }

  @Public()
  @Post('webhook')
  async receive(@Req() req: RawBodyRequest<Request>): Promise<{ received: boolean }> {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    this.verifySignature(rawBody, req.headers['x-hub-signature-256'] as string | undefined);
    const payload = JSON.parse(rawBody) as WhatsappWebhookPayload;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const profileName = change.value?.contacts?.[0]?.profile?.name ?? null;
        for (const message of change.value?.messages ?? []) {
          // Only plain text is routed for now; media messages are recorded as
          // an unread thread entry the staff can follow up on WhatsApp itself.
          const body = message.type === 'text' ? (message.text?.body ?? '') : '[media message]';
          if (!message.from || body.length === 0) continue;
          try {
            await this.messaging.receiveWhatsappMessage(
              message.from,
              body,
              message.id ?? null,
              profileName,
            );
          } catch (error) {
            // One bad message must not fail the whole webhook delivery - Meta
            // would otherwise retry the entire batch forever.
            this.logger.warn(`WhatsApp inbound message not recorded: ${String(error)}`);
          }
        }
      }
    }
    return { received: true };
  }

  private verifySignature(rawBody: string, signature: string | undefined): void {
    const appSecret = this.config.get<string>('whatsapp.appSecret') ?? '';
    if (appSecret.length === 0) return; // not configured: local/dev runs
    const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    if (!signature || signature !== expected) {
      throw new UnauthorizedException('Invalid WhatsApp webhook signature');
    }
  }
}
