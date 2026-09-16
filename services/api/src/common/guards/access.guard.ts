import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_RANK, AccessLevel } from '../enums';
import { REQUIRE_ACCESS_KEY, RequiredAccess } from '../decorators/require-access.decorator';
import { AuthenticatedUser } from '../interfaces';
import { PermissionsService } from '../../modules/users/permissions.service';

/**
 * Enforces the role/permission matrix (docs/project/05-Role-Permission-Matrix.md)
 * server-side. Endpoints declare needs via @RequireAccess(module, level).
 * Least privilege: no permission row means NO access.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredAccess | undefined>(
      REQUIRE_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true; // endpoint declares no module requirement (e.g. auth/me)

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) throw new ForbiddenException('No authenticated user');

    const granted = await this.permissions.getAccessLevel(user.role, required.module);
    if (ACCESS_RANK[granted] < ACCESS_RANK[required.level]) {
      throw new ForbiddenException(
        `Role '${user.role}' lacks '${required.level}' access to module '${required.module}'`,
      );
    }

    // 'own' level grants access only to the caller's own records; services use
    // this flag to scope queries to the current user.
    request.accessScope = granted === AccessLevel.OWN ? 'own' : 'all';
    return true;
  }
}
