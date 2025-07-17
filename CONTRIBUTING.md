# Contributing to Pipe MCP Server

Thank you for your interest in contributing to Pipe! This document provides guidelines for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before contributing.

## How to Contribute

### Reporting Issues

1. **Check existing issues** - Before creating a new issue, check if it already exists
2. **Use issue templates** - Select the appropriate template (bug report, feature request)
3. **Provide details** - Include steps to reproduce, expected behavior, and actual behavior
4. **Include environment info** - Node.js version, OS, relevant configuration

### Suggesting Features

1. **Open a discussion** - Start with a GitHub Discussion for feature ideas
2. **Provide use cases** - Explain why the feature would be valuable
3. **Consider implementation** - If possible, suggest how it might work

### Contributing Code

#### Getting Started

1. **Fork the repository**
   ```bash
   git clone https://github.com/your-username/pipe.git
   cd pipe
   ```

2. **Set up development environment**
   ```bash
   npm install
   cp .env.example .env
   docker-compose up -d
   npm run db:migrate:dev
   ```

3. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

#### Development Process

1. **Write code** following our style guide
2. **Add tests** for new functionality
3. **Update documentation** as needed
4. **Run checks** before committing:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

#### Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Build process or tooling changes

Examples:
```
feat: add Linear platform adapter
fix: resolve OAuth token refresh issue
docs: update API reference for new endpoints
```

#### Pull Request Process

1. **Update your branch**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create Pull Request**
   - Use a clear, descriptive title
   - Reference any related issues
   - Describe what changes were made and why

4. **Code Review**
   - Address review feedback
   - Keep PR focused and atomic
   - Ensure CI passes

### Code Style Guide

#### TypeScript

- Use TypeScript strict mode
- Define interfaces for data structures
- Avoid `any` type
- Use functional programming patterns where appropriate

#### File Organization

```typescript
// 1. Imports (grouped and ordered)
import { external } from 'package';
import { internal } from '../module';
import { local } from './local';

// 2. Types and interfaces
interface MyInterface {
  property: string;
}

// 3. Constants
const CONSTANT_VALUE = 42;

// 4. Main code
export class MyClass {
  // Implementation
}

// 5. Helper functions
function helperFunction() {
  // Implementation
}
```

#### Naming Conventions

- **Files**: kebab-case (`platform-manager.ts`)
- **Classes**: PascalCase (`PlatformManager`)
- **Functions**: camelCase (`syncPlatform`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Interfaces**: PascalCase, optionally prefixed with 'I'

### Testing

#### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MyClass } from './my-class';

describe('MyClass', () => {
  let instance: MyClass;

  beforeEach(() => {
    instance = new MyClass();
  });

  it('should perform expected behavior', () => {
    const result = instance.method();
    expect(result).toBe(expectedValue);
  });
});
```

#### Test Guidelines

- Write unit tests for business logic
- Write integration tests for API endpoints
- Aim for >80% code coverage
- Use descriptive test names
- Test edge cases and error conditions

### Documentation

#### Code Documentation

```typescript
/**
 * Synchronizes data from a platform
 * @param platform - The platform to sync
 * @param options - Sync options
 * @returns Promise resolving to sync result
 * @throws {PlatformError} If platform is not connected
 */
async function syncPlatform(
  platform: PlatformType,
  options: SyncOptions
): Promise<SyncResult> {
  // Implementation
}
```

#### API Documentation

- Document all public APIs
- Include request/response examples
- Note any breaking changes
- Update relevant docs in `/docs`

### Platform Adapter Development

When adding a new platform adapter:

1. **Implement the interface**
   ```typescript
   export class MyPlatformAdapter implements PlatformAdapter {
     // Required methods
   }
   ```

2. **Add configuration**
   - Update `.env.example`
   - Add to TypeScript types
   - Document required scopes

3. **Write tests**
   - Unit tests for adapter logic
   - Integration tests for OAuth flow
   - Mock external API calls

4. **Update documentation**
   - Add to platform integration guide
   - Document webhook setup
   - Include troubleshooting tips

## Development Tips

### Debugging

- Use VS Code debugger with provided launch config
- Enable debug logging: `LOG_LEVEL=debug`
- Use `logger.debug()` for debugging output

### Performance

- Profile before optimizing
- Use caching appropriately
- Batch database operations
- Consider rate limits

### Security

- Never log sensitive data
- Validate all inputs
- Use parameterized queries
- Follow OWASP guidelines

## Getting Help

- **Discord**: Join our community for discussions
- **GitHub Discussions**: For questions and ideas
- **Documentation**: Check `/docs` for guides
- **Issues**: For bug reports and feature requests

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing to Pipe! 🚀