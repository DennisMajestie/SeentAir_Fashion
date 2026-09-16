/**
 * Pluggable carrier boundary (appendix 14 / architecture principle):
 * GIGL first, future carriers slot in behind this interface without
 * touching order/frontend code.
 */
export interface ShipmentRequest {
  orderId: string;
  weightKg: number | null;
  zone: string | null;
}

export interface CarrierAdapter {
  /** Carrier key this adapter serves (e.g. 'gigl'). */
  readonly key: string;
  createShipment(request: ShipmentRequest): Promise<{ trackingRef: string }>;
}
