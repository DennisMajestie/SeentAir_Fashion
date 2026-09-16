import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CarrierAdapter, ShipmentRequest } from './carrier-adapter.interface';

/**
 * GIGL — the first integrated carrier (client-specified). Requires
 * GIGL_API_KEY; endpoint shapes to be finalized against GIGL's API docs
 * when credentials are provisioned.
 */
@Injectable()
export class GiglAdapter implements CarrierAdapter {
  readonly key = 'gigl';

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string {
    return this.config.get<string>('gigl.apiKey') ?? '';
  }

  async createShipment(request: ShipmentRequest): Promise<{ trackingRef: string }> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'GIGL is not configured (GIGL_API_KEY missing) — use a manual carrier or configure keys',
      );
    }
    const baseUrl = this.config.get<string>('gigl.baseUrl');
    const response = await fetch(`${baseUrl}/shipments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference: request.orderId,
        weight: request.weightKg,
        zone: request.zone,
      }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`GIGL shipment creation failed: ${response.statusText}`);
    }
    const body = (await response.json()) as { tracking_ref?: string; trackingRef?: string };
    const trackingRef = body.tracking_ref ?? body.trackingRef;
    if (!trackingRef) {
      throw new ServiceUnavailableException('GIGL response did not include a tracking reference');
    }
    return { trackingRef };
  }
}
