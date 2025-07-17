import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AuthContext } from '../types/auth';
import { UnauthorizedError } from '../utils/errors';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthContext;
    }
  }
}

// JWT authentication middleware
export function authenticate(req: Request, res: Response, next: NextFunction) {
  passport.authenticate('jwt', { session: false }, (err: any, user: AuthContext | false) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    req.user = user;
    next();
  })(req, res, next);
}

// Optional authentication - doesn't fail if no token
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  passport.authenticate('jwt', { session: false }, (err: any, user: AuthContext | false) => {
    if (err) {
      return next(err);
    }

    if (user) {
      req.user = user;
    }

    next();
  })(req, res, next);
}

// WebSocket authentication
export async function authenticateWebSocket(
  token: string,
  authService: any
): Promise<AuthContext | null> {
  if (!token) {
    return null;
  }

  // Remove 'Bearer ' prefix if present
  const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

  try {
    return await authService.validateToken(cleanToken);
  } catch (error) {
    return null;
  }
}

// Team membership check
export function requireTeamMember(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const teamId = req.params.teamId || req.body.teamId;

  if (!teamId) {
    return next(new Error('Team ID required'));
  }

  // In a real implementation, check if user is member of the team
  // For now, we'll check if it matches their current team
  if (req.user.teamId !== teamId) {
    return next(new UnauthorizedError('Not a member of this team'));
  }

  next();
}
