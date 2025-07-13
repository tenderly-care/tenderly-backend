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
      secretOrKey: configService.get<string>('security.jwt.secret') || 'fallback-secret',
    };
    super(strategyOptions);
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.userModel.findById(payload.sub).exec();
    if (!user) {
      throw new UnauthorizedException('Invalid token or user not found');
    }

    // Check if session is valid
    const sessionKey = `session:${payload.sessionId}`;
    const sessionData = await this.cacheService.get(sessionKey);
    if (!sessionData) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    // Check if there's a token version mismatch (global logout)
    const tokenVersion = await this.cacheService.get(`token_version:${payload.sub}`);
    if (tokenVersion && payload.iat * 1000 < tokenVersion) {
      throw new UnauthorizedException('Token invalidated');
    }

    // Allow users with pending MFA setup to access MFA setup endpoints
    // The endpoint-specific logic will handle MFA requirements
    if (user.requiresMFA() && !user.isMFAEnabled && user.accountStatus !== 'pending_mfa_setup') {
      throw new UnauthorizedException('MFA is required but not enabled');
    }

    return user;
  }
}

