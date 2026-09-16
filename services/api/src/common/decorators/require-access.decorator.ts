import { SetMetadata } from '@nestjs/common';
import { AccessLevel, ModuleName } from '../enums';

export const REQUIRE_ACCESS_KEY = 'requireAccess';

export interface RequiredAccess {
  module: ModuleName;
  level: AccessLevel;
}

/**
 * Declares the module + minimum access level an endpoint needs.
 * Enforced server-side by AccessGuard against the Permission table —
 * RBAC is never only hidden in the frontend (architectural principle).
 */
export const RequireAccess = (module: ModuleName, level: AccessLevel) =>
  SetMetadata(REQUIRE_ACCESS_KEY, { module, level } satisfies RequiredAccess);
