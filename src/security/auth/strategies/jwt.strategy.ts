import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../../modules/users/schemas/user.schema';
import { Request } from 'express';
import { CacheService } from '../../../core/cache/cache.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private cacheService: CacheService,
  ) {
    const strategyOptions: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('security.jwt.secret') || 'fallback-secret',
    };
    super(strategyOptions);
  }

  async validate(payload: any): Promise<User> {
    const user = await this.userModel.findById(payload.sub).exec();
    if (!user) {
      throw new UnauthorizedException('Invalid token or user not found');
    }

    // Handle MFA setup tokens
    if (payload.type === 'mfa_setup') {
      // Check if MFA setup session is valid
      const setupSessionKey = `mfa_setup_session:${payload.sessionId}`;
      const setupSessionData = await this.cacheService.get(setupSessionKey);
      if (!setupSessionData) {
        throw new UnauthorizedException('MFA setup session expired or invalid');
      }

      // Ensure user actually needs MFA setup
      if (!user.requiresMFA() || user.isMFAEnabled) {
        throw new UnauthorizedException('MFA setup not required for this user');
      }

      if (user.accountStatus !== 'pending_mfa_setup') {
        throw new UnauthorizedException('User account not in MFA setup state');
      }

      // Add flag to indicate this is an MFA setup token
      (user as any).isMFASetupToken = true;
      return user;
    }

    // Handle regular access tokens
    // Check if session is valid
    const sessionKey = `session:${payload.sessionId}`;
    const sessionData = await this.cacheService.get(sessionKey);
    if (!sessionData) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    // Check if there's a token version mismatch (global logout)
    const tokenVersion = await this.cacheService.get(
      `token_version:${payload.sub}`,
    );
    if (tokenVersion && payload.iat * 1000 < tokenVersion) {
      throw new UnauthorizedException('Token invalidated');
    }

    // Allow users with pending MFA setup to access MFA setup endpoints
    // The endpoint-specific logic will handle MFA requirements
    if (
      user.requiresMFA() &&
      !user.isMFAEnabled &&
      user.accountStatus !== 'pending_mfa_setup'
    ) {
      throw new UnauthorizedException('MFA is required but not enabled');
    }

    return user;
  }
}
