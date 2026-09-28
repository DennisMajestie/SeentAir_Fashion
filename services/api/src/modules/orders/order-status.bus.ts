import { Injectable, MessageEvent } from '@nestjs/common';
import { merge, Observable, Subject, filter, interval, map, startWith } from 'rxjs';

export interface OrderStatusChange {
  orderId: string;
  status: string;
  at: string;
}

/** Comment-frame cadence. Long enough to be cheap, short enough that idle
 *  connections survive typical proxy/LB timeouts (nginx default is 60s). */
const HEARTBEAT_MS = 25000;

/**
 * In-process fan-out of order status changes to SSE subscribers.
 *
 * Deliberately a Subject rather than Redis pub/sub: every writer of an
 * OrderStatusEvent (staff status advance, Paystack webhook, offline payment,
 * fulfilment) runs inside the API process, so there is no cross-process hop to
 * miss. If that ever changes — e.g. a BullMQ worker starts writing status
 * events — this must become a Redis-backed bus, or subscribers will silently
 * miss those updates. `emit` is fire-and-forget: a failed or absent subscriber
 * must never break a status change.
 */
@Injectable()
export class OrderStatusBus {
  private readonly changes = new Subject<OrderStatusChange>();

  emit(orderId: string, status: string): void {
    this.changes.next({ orderId, status, at: new Date().toISOString() });
  }

  /**
   * Per-order stream. The payload is a *notification*, never the tracking data
   * itself: the subscriber re-fetches GET /orders/:id/tracking over normal
   * authenticated HTTP. That keeps one code path for the tracking shape, and
   * means an access token expiring mid-connection degrades the stream only.
   */
  stream(orderId: string): Observable<MessageEvent> {
    const changes$ = this.changes.pipe(
      filter((change) => change.orderId === orderId),
      map((change) => ({ type: 'status', data: JSON.stringify(change) }) satisfies MessageEvent),
    );

    // Tells the client the stream is live so it can back off its polling.
    const opened$ = changes$.pipe(
      startWith({ type: 'open', data: JSON.stringify({ orderId }) } satisfies MessageEvent),
    );

    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map(() => ({ type: 'heartbeat', data: '' }) satisfies MessageEvent),
    );

    return merge(opened$, heartbeat$);
  }
}
