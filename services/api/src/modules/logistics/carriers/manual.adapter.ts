import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CarrierAdapter, ShipmentRequest } from './carrier-adapter.interface';

/**
 * Manual carriers — dispatch riders, transport companies, and any logistics
 * partner without an API. Staff record and update these legs by hand;
 * a local tracking reference is generated for the customer.
 */
@Injectable()
export class ManualCarrierAdapter implements CarrierAdapter {
  readonly key = 'manual';

  async createShipment(_request: ShipmentRequest): Promise<{ trackingRef: string }> {
    return { trackingRef: `SNTR-${randomUUID().slice(0, 8).toUpperCase()}` };
  }
}
