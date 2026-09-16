import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../modules/audit/audit.service';
import { AuthenticatedUser } from '../interfaces';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const REDACTED_KEYS = new Set(['password', 'passwordHash', 'currentPassword', 'newPassword']);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        REDACTED_KEYS.has(k) ? [k, '[REDACTED]'] : [k, redact(v)],
      ),
    );
  }
  return value;
}

/**
 * Global audit interceptor — every successful mutating request writes an
 * AuditLogEntry automatically. Features never call the audit log manually,
 * so coverage cannot have gaps (architectural principle #4).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    if (!MUTATING_METHODS.has(request.method)) return next.handle();

    // Never audit-log credentials flows' payloads beyond the action itself.
    const user: AuthenticatedUser | undefined = request.user;

    return next.handle().pipe(
      tap((responseBody) => {
        void this.auditService
          .record({
            actorId: user?.id ?? null,
            action: `${request.method} ${request.route?.path ?? request.url}`,
            beforeState: redact(request.body ?? null),
            afterState: redact(responseBody ?? null),
          })
          .catch(() => {
            /* audit failures must never break the request; monitored separately */
          });
      }),
    );
  }
}
