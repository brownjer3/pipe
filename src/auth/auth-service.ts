import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { AuthContext, AuthResult, JWTPayload, SafeUser, TokenPair } from '../types/auth';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import { EncryptionService } from '../utils/encryption';
import { Logger } from '../utils/logger';

export class AuthService {
  private jwtSecret: string;
  private refreshSecret: string;
  private encryptionService: EncryptionService;
  private logger: Logger;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    logger: Logger
  ) {
    this.jwtSecret = process.env.JWT_SECRET!;
    this.refreshSecret = process.env.REFRESH_SECRET!;

    if (!this.jwtSecret || !this.refreshSecret) {
      throw new Error('JWT_SECRET and REFRESH_SECRET must be set');
    }

    this.encryptionService = new EncryptionService();
    this.logger = logger.child({ service: 'AuthService' });
  }

  async authenticate(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { currentTeam: true },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is inactive');
    }

    const tokens = await this.generateTokens(user);

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        teamId: user.currentTeamId,
        action: 'auth.login',
        metadata: {
          method: 'password',
        },
      },
    });

    this.logger.info('User authenticated', { userId: user.id, email: user.email });

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async register(email: string, password: string, name?: string): Promise<AuthResult> {
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email format');
    }

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    // Validate password strength
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user and default team in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create team
      const team = await tx.team.create({
        data: {
          name: name ? `${name}'s Team` : 'My Team',
          slug: await this.generateTeamSlug(email),
        },
      });

      // Create user
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          currentTeamId: team.id,
        },
        include: { currentTeam: true },
      });

      // Create team membership
      await tx.teamMember.create({
        data: {
          userId: user.id,
          teamId: team.id,
          role: 'owner',
        },
      });

      return user;
    });

    const tokens = await this.generateTokens(result);

    this.logger.info('User registered', { userId: result.id, email: result.email });

    return {
      user: this.sanitizeUser(result),
      ...tokens,
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = jwt.verify(refreshToken, this.refreshSecret) as { userId: string };

      // Check if refresh token exists in Redis
      const exists = await this.redis.get(`refresh:${payload.userId}:${refreshToken}`);
      if (!exists) {
        throw new UnauthorizedError('Invalid refresh token');
      }

      // Get user
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        include: { currentTeam: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedError('User not found or inactive');
      }

      // Revoke old refresh token
      await this.redis.del(`refresh:${payload.userId}:${refreshToken}`);

      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.redis.del(`refresh:${userId}:${refreshToken}`);

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'auth.logout',
      },
    });
  }

  async validateToken(token: string): Promise<AuthContext | null> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JWTPayload;

      // Optional: Check if user still exists and is active
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, isActive: true },
      });

      if (!user || !user.isActive) {
        return null;
      }

      return {
        userId: payload.userId,
        teamId: payload.teamId,
        email: payload.email,
      };
    } catch (error) {
      return null;
    }
  }

  async generateTokens(user: any): Promise<TokenPair> {
    const payload: JWTPayload = {
      userId: user.id,
      teamId: user.currentTeamId,
      email: user.email,
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: '15m',
      issuer: 'Pipe',
    });

    const refreshToken = jwt.sign({ userId: user.id }, this.refreshSecret, {
      expiresIn: '7d',
    });

    // Store refresh token in Redis
    await this.redis.setex(
      `refresh:${user.id}:${refreshToken}`,
      7 * 24 * 60 * 60, // 7 days
      '1'
    );

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      currentTeamId: user.currentTeamId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async generateTeamSlug(email: string): Promise<string> {
    const baseSlug = email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    let slug = baseSlug;
    let counter = 1;

    while (await this.prisma.team.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  // OAuth methods
  async findOrCreateOAuthUser(profile: any, provider: string): Promise<any> {
    const email = profile.emails?.[0]?.value || profile.email;
    if (!email) {
      throw new ValidationError('No email provided by OAuth provider');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { currentTeam: true },
    });

    if (user) {
      // Update user info from OAuth
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          name: user.name || profile.displayName || profile.name,
          avatarUrl: user.avatarUrl || profile.photos?.[0]?.value,
        },
      });
      return user;
    }

    // Create new user with OAuth
    return this.prisma.$transaction(async (tx) => {
      // Create team
      const team = await tx.team.create({
        data: {
          name: `${profile.displayName || profile.name || 'My'} Team`,
          slug: await this.generateTeamSlug(email),
        },
      });

      // Create user
      const newUser = await tx.user.create({
        data: {
          email,
          name: profile.displayName || profile.name,
          avatarUrl: profile.photos?.[0]?.value,
          currentTeamId: team.id,
        },
        include: { currentTeam: true },
      });

      // Create team membership
      await tx.teamMember.create({
        data: {
          userId: newUser.id,
          teamId: team.id,
          role: 'owner',
        },
      });

      return newUser;
    });
  }
}
