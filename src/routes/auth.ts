import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AuthService } from '../auth/auth-service';
import { ValidationError } from '../utils/errors';

export function authRouter(authService: AuthService): Router {
  const router = Router();

  // Login endpoint
  router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      const result = await authService.authenticate(email, password);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Register endpoint
  router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, name } = req.body;

      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      const result = await authService.register(email, password, name);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  // Refresh token endpoint
  router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new ValidationError('Refresh token is required');
      }

      const tokens = await authService.refreshTokens(refreshToken);
      res.json(tokens);
    } catch (error) {
      next(error);
    }
  });

  // Logout endpoint
  router.post(
    '/logout',
    passport.authenticate('jwt', { session: false }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { refreshToken } = req.body;
        const user = req.user as any;

        if (refreshToken) {
          await authService.logout(user.userId, refreshToken);
        }

        res.json({ message: 'Logged out successfully' });
      } catch (error) {
        next(error);
      }
    }
  );

  // OAuth routes
  router.get('/github', passport.authenticate('github', { scope: ['user:email', 'read:user'] }));

  router.get(
    '/github/callback',
    passport.authenticate('github', { session: false, failureRedirect: '/auth/failure' }),
    async (req: Request, res: Response) => {
      // Generate tokens for OAuth user
      const user = req.user as any;
      const tokens = await authService.generateTokens(user);

      // Redirect to frontend with tokens
      const redirectUrl = new URL(
        process.env.FRONTEND_URL || 'http://localhost:3000/auth/callback'
      );
      redirectUrl.searchParams.set('access_token', tokens.accessToken);
      redirectUrl.searchParams.set('refresh_token', tokens.refreshToken);

      res.redirect(redirectUrl.toString());
    }
  );

  router.get('/failure', (req: Request, res: Response) => {
    res.status(401).json({ error: 'Authentication failed' });
  });

  // Get current user
  router.get(
    '/me',
    passport.authenticate('jwt', { session: false }),
    async (req: Request, res: Response) => {
      const user = req.user as any;
      res.json({
        id: user.userId,
        email: user.email,
        teamId: user.teamId,
      });
    }
  );

  return router;
}
