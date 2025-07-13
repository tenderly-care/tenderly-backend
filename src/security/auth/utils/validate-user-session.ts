import { Request } from 'express';
import { UserDocument, AccountStatus } from '../../../modules/users/schemas/user.schema';

export async function ValidateUserSession(req: Request, user: UserDocument): Promise<void> {
  // Extract device information from request
  const userAgent = req.headers['user-agent'] || '';
  const ipAddress = req.ip || req.connection.remoteAddress || '';
  
  // Check if account is locked
  if (user.isAccountLocked()) {
    throw new Error('Account is temporarily locked');
  }

  // Check account status
  if (user.accountStatus !== AccountStatus.ACTIVE) {
    throw new Error(`Account status: ${user.accountStatus}`);
  }

  // Update last activity
  user.lastLoginAt = new Date();
  user.lastLoginIP = ipAddress;
  user.lastLoginUserAgent = userAgent;
  
  // Don't await this save to avoid blocking the request
  user.save().catch(err => {
    console.error('Failed to update user last activity:', err);
  });
}
