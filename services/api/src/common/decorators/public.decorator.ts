import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks an endpoint as public (no JWT required) — e.g. /auth/login, public catalogue reads. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
