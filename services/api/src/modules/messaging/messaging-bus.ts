import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface ConversationChange {
  conversationId: string;
  at: string;
}

/**
 * In-process fan-out of conversation activity to the realtime gateway.
 *
 * Same design constraints as OrderStatusBus: every writer runs inside this API
 * process, so a plain Subject is enough; if messaging ever moves behind a
 * worker or the WhatsApp webhook lands in a second process, this must become a
 * Redis-backed bus. `emit` is fire-and-forget and must never break a send.
 */
@Injectable()
export class MessagingBus {
  private readonly changes = new Subject<ConversationChange>();

  events(): Observable<ConversationChange> {
    return this.changes.asObservable();
  }

  emit(conversationId: string): void {
    this.changes.next({ conversationId, at: new Date().toISOString() });
  }
}
