import { RoleName } from './enums';

/** Shape attached to request.user after JWT verification. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: RoleName;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: RoleName;
  type: 'access' | 'refresh';
  /** Refresh tokens only: id of the server-side RefreshToken row. */
  jti?: string;
}
