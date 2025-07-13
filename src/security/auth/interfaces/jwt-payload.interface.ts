import { UserRole } from '../../../modules/users/schemas/user.schema';

export interface JwtPayload {
  sub: string; // User ID
  email: string;
  roles: UserRole[];
  sessionId: string;
  deviceFingerprint?: string;
  iat: number; // Issued at
  exp: number; // Expiry
  iss: string; // Issuer
  aud: string; // Audience
}

export interface RefreshTokenPayload {
  sub: string; // User ID
  sessionId: string;
  deviceFingerprint?: string;
  tokenVersion: number;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}
