import { Reflector } from '@nestjs/core';
import { AccessLevel, ModuleName } from '../../common/enums';
import { REQUIRE_ACCESS_KEY } from '../../common/decorators/require-access.decorator';
import { ApprovalsController } from './approvals.controller';

describe('ApprovalsController access control (decorator metadata)', () => {
  const reflector = new Reflector();

  it('POST /approvals (create) requires APPROVALS_AUDIT:VIEW so customers/wholesalers are blocked by the guard', () => {
    const required = reflector.get<{ module: ModuleName; level: AccessLevel }>(
      REQUIRE_ACCESS_KEY,
      ApprovalsController.prototype.create,
    );
    expect(required).toEqual({ module: ModuleName.APPROVALS_AUDIT, level: AccessLevel.VIEW });
  });

  it('GET /approvals/pending requires APPROVALS_AUDIT:APPROVE', () => {
    const required = reflector.get<{ module: ModuleName; level: AccessLevel }>(
      REQUIRE_ACCESS_KEY,
      ApprovalsController.prototype.findPending,
    );
    expect(required).toEqual({ module: ModuleName.APPROVALS_AUDIT, level: AccessLevel.APPROVE });
  });

  it('GET /approvals requires APPROVALS_AUDIT:APPROVE', () => {
    const required = reflector.get<{ module: ModuleName; level: AccessLevel }>(
      REQUIRE_ACCESS_KEY,
      ApprovalsController.prototype.findAll,
    );
    expect(required).toEqual({ module: ModuleName.APPROVALS_AUDIT, level: AccessLevel.APPROVE });
  });

  it('POST /approvals/:id/decide requires APPROVALS_AUDIT:APPROVE', () => {
    const required = reflector.get<{ module: ModuleName; level: AccessLevel }>(
      REQUIRE_ACCESS_KEY,
      ApprovalsController.prototype.decide,
    );
    expect(required).toEqual({ module: ModuleName.APPROVALS_AUDIT, level: AccessLevel.APPROVE });
  });
});
