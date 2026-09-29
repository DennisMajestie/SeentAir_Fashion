import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

/**
 * Marks an endpoint as usable with OR without a JWT — guest checkout, where the
 * same route serves a signed-in customer and a stranger.
 *
 * Distinct from @Public(): that skips the guard entirely, so `request.user` is
 * never populated even when the caller *did* send a valid token. Optional auth
 * still verifies a token when one is present and attaches the user, so the
 * handler can tell a signed-in customer from a guest. A token that is present
 * but invalid or expired is still rejected — a dead session is a client error,
 * not an anonymous shopper.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
