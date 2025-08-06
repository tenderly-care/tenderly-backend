import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class MFASetupGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('No user found in request');
    }

    // Check if this is an MFA setup token
    if (!(user as any).isMFASetupToken) {
      throw new UnauthorizedException(
        'MFA setup endpoints require a temporary MFA setup token',
      );
    }

    // Ensure user is in the correct state for MFA setup
    if (user.accountStatus !== 'pending_mfa_setup') {
      throw new UnauthorizedException('User account not in MFA setup state');
    }

    if (!user.requiresMFA()) {
      throw new UnauthorizedException('MFA is not required for this user role');
    }

    if (user.isMFAEnabled) {
      throw new UnauthorizedException('MFA is already enabled for this user');
    }

    return true;
  }
}
