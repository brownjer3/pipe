import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { AuthService } from './auth-service';
import { JWTPayload } from '../types/auth';

export function configurePassport(authService: AuthService) {
  // JWT Strategy
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: process.env.JWT_SECRET!,
        issuer: 'Pipe',
      },
      async (payload: JWTPayload, done) => {
        try {
          const authContext = await authService.validateToken(payload as any);
          if (authContext) {
            return done(null, authContext);
          }
          return done(null, false);
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );

  // Local Strategy (email/password)
  passport.use(
    new LocalStrategy(
      {
        usernameField: 'email',
        passwordField: 'password',
      },
      async (email, password, done) => {
        try {
          const result = await authService.authenticate(email, password);
          return done(null, result.user as any);
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );

  // GitHub OAuth Strategy
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: '/auth/github/callback',
        },
        async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const user = await authService.findOrCreateOAuthUser(profile);

            // Store GitHub access token for platform integration
            // This would be encrypted and stored in platform_connections table

            return done(null, user);
          } catch (error) {
            return done(error, false);
          }
        }
      )
    );
  }

  // Don't serialize/deserialize for stateless JWT auth
  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user as any);
  });
}
