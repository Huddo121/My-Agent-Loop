# Research: Git Forge Authentication for My Agent Loop

## Executive Summary

This document outlines the research into implementing secure authentication between My Agent Loop and GitHub/GitLab forges. The goal is to enable per-project authentication for git operations (clone, push, pull) and API interactions (PRs, pipelines, issues).

## Current State Analysis

### Existing Architecture

The current My Agent Loop architecture handles git operations through:

1. **GitService Interface** (`apps/server/src/git/GitService.ts`)
   - Uses `simple-git` library for git operations
   - Currently calls git directly on the host without authentication configuration
   - Supports: clone, fetch, checkout, commit, push, merge

2. **Database Schema** (`apps/server/src/db/schema.ts`)
   - `projectsTable` stores: id, name, shortCode, repositoryUrl, workflowConfiguration
   - **No authentication fields currently exist**

3. **WorkflowExecutionService** (`apps/server/src/workflow/WorkflowExecutionService.ts`)
   - Checks out repositories using `project.repositoryUrl`
   - No authentication token passed to git operations
   - Creates task-specific branches and pushes them

4. **Project Model** (`packages/api/src/projects/projects-model.ts`)
   - Project interface: id, name, shortCode, repositoryUrl, workflowConfiguration
   - **Missing: authentication configuration**

### Current Limitations

- Relies on host-level git authentication (SSH keys, global git config)
- Cannot deploy to servers without manual authentication setup
- No per-project authentication isolation
- Cannot interact with forge APIs (PRs, pipelines, issues)
- No support for different authentication methods per project

## Research: Git Forge Authentication Methods

### GitHub Authentication Options

#### 1. Personal Access Tokens (PATs)

**Overview:**
- Classic PATs: Fine-grained permissions, long-lived
- Fine-grained PATs: Repository-specific permissions, more secure

**Pros:**
- Simple to implement
- Easy to rotate
- Well-documented
- Works with both git operations and API calls

**Cons:**
- Tied to a user account
- Classic PATs have broad permissions
- Manual creation required

**Implementation:**
```typescript
// Git operations
const authenticatedUrl = `https://x-access-token:${token}@github.com/owner/repo.git`;

// API operations (using Octokit)
import { Octokit } from "@octokit/rest";
const octokit = new Octokit({ auth: token });
```

**Required Scopes for My Agent Loop:**
- `repo`: Full control of private repositories
- `workflow`: Update GitHub Action workflow files
- `pull_requests`: Create and manage PRs (if using API)

#### 2. GitHub App Authentication

**Overview:**
- Acts as an independent entity, not tied to a user
- Can be installed on specific repositories
- Uses JWT for authentication, then exchanges for installation tokens

**Pros:**
- Not tied to a user account
- Fine-grained permissions per installation
- Can act on behalf of the app or specific users
- Better audit trail
- Automatic token rotation

**Cons:**
- More complex implementation
- Requires app registration
- Need to handle JWT generation and token exchange

**Implementation:**
```typescript
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

const auth = createAppAuth({
  appId: 123,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
  clientId: "client_id",
  clientSecret: "client_secret",
  installationId: 456, // Optional: specific installation
});

// Get installation token
const { token } = await auth({ type: "installation" });

// Use with Octokit
const octokit = new Octokit({ auth: token });

// For git operations
const authenticatedUrl = `https://x-access-token:${token}@github.com/owner/repo.git`;
```

**Required Permissions:**
- Contents: Read & Write
- Pull requests: Read & Write
- Actions: Read (for pipeline status)
- Metadata: Read (mandatory)

#### 3. OAuth App Authentication

**Overview:**
- Traditional OAuth 2.0 flow
- User authorizes the app to act on their behalf

**Pros:**
- User context is clear
- Standard OAuth implementation

**Cons:**
- Requires user interaction for authorization
- Tokens expire and need refresh
- Not ideal for server-to-server automation

**Recommendation:** Not suitable for My Agent Loop's automated use case.

### GitLab Authentication Options

#### 1. Personal Access Tokens (PATs)

**Overview:**
- Similar to GitHub PATs
- Can be created at user or group level
- Supports expiration dates

**Pros:**
- Simple to implement
- Fine-grained scopes available
- Works with both git and API

**Cons:**
- Tied to user account
- Manual creation required

**Implementation:**
```typescript
// Git operations
const authenticatedUrl = `https://oauth2:${token}@gitlab.com/owner/repo.git`;

// API operations (using Gitbeaker)
import { Gitlab } from '@gitbeaker/rest';
const api = new Gitlab({
  host: 'https://gitlab.com',
  token: 'personal_token',
});

// Or using curl/axios
// Header: "PRIVATE-TOKEN: <token>"
```

**Required Scopes:**
- `api`: Full API access (or use specific scopes)
- `read_repository`, `write_repository`: For git operations
- `read_user`: For user information

#### 2. Project Access Tokens

**Overview:**
- Scoped to a specific project
- Not tied to a user account
- Can have expiration dates

**Pros:**
- Project-scoped (better security)
- Not tied to a user
- Automatic rotation support

**Cons:**
- Only available in GitLab Premium/Ultimate
- Must be created per project

**Implementation:** Same as PATs, but token is project-specific.

#### 3. Group Access Tokens

**Overview:**
- Similar to project tokens but at group level
- Can access all projects in the group

**Pros:**
- Good for managing multiple related projects
- Not tied to a user

**Cons:**
- Requires GitLab Premium/Ultimate
- Broader scope than project tokens

#### 4. OAuth2 Authentication

**Overview:**
- Standard OAuth2 flow
- Can use authorization code or client credentials flow

**Pros:**
- Standard protocol
- Refresh token support

**Cons:**
- More complex implementation
- Requires user interaction for authorization code flow

**Implementation:**
```typescript
// Client credentials flow (for server-to-server)
const tokenResponse = await fetch('https://gitlab.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'client_credentials',
    client_id: 'your_client_id',
    client_secret: 'your_client_secret',
    scope: 'api read_repository write_repository'
  })
});
```

## Recommended Approach

### Phase 1: Personal Access Tokens (Immediate)

**Rationale:**
- Quick to implement
- Works with both GitHub and GitLab
- No complex setup required
- Can be migrated to more advanced methods later

**Implementation Plan:**

1. **Database Changes**
   ```typescript
   // Add to schema.ts
   export const projectAuthTable = pg.pgTable("project_auth", {
     id: pg.uuid().primaryKey().default(sql`uuidv7()`),
     projectId: pg.uuid().references(() => projectsTable.id).notNull(),
     forgeType: pg.pgEnum("forge_type", ["github", "gitlab"]).notNull(),
     authType: pg.pgEnum("auth_type", ["pat", "app", "oauth"]).notNull(),
     // Encrypted token storage
     encryptedToken: pg.text().notNull(),
     tokenExpiresAt: pg.timestamp(),
     // For GitHub Apps
     appId: pg.text(),
     installationId: pg.text(),
     // For GitLab
     host: pg.text(), // e.g., gitlab.com or self-hosted
     createdAt: pg.timestamp().notNull().defaultNow(),
     updatedAt: pg.timestamp().notNull().defaultNow(),
   });
   ```

2. **Encryption Strategy**
   - Use AES-256-GCM for token encryption
   - Store encryption key in environment variable (not in database)
   - Consider using a key management service (KMS) for production

3. **GitService Updates**
   ```typescript
   export interface CheckoutOptions {
     repositoryUrl: string;
     targetDirectory: AbsoluteFilePath;
     branch: GitBranch;
     auth?: {
       type: 'pat' | 'app';
       token: string;
       forgeType: 'github' | 'gitlab';
     };
   }
   
   // Helper to construct authenticated URL
   private getAuthenticatedUrl(
     repositoryUrl: string, 
     auth: CheckoutOptions['auth']
   ): string {
     if (!auth) return repositoryUrl;
     
     const url = new URL(repositoryUrl);
     
     if (auth.forgeType === 'github') {
       // GitHub uses x-access-token as username
       url.username = 'x-access-token';
       url.password = auth.token;
     } else if (auth.forgeType === 'gitlab') {
       // GitLab uses oauth2 as username
       url.username = 'oauth2';
       url.password = auth.token;
     }
     
     return url.toString();
   }
   ```

4. **API Client Abstraction**
   ```typescript
   // New file: apps/server/src/forge/ForgeApiClient.ts
   
   export interface ForgeApiClient {
     // Pull Requests/Merge Requests
     createPullRequest(params: CreatePRParams): Promise<PullRequest>;
     getPullRequest(id: string): Promise<PullRequest>;
     listPullRequests(): Promise<PullRequest[]>;
     
     // Pipeline/Workflow Status
     getPipelineStatus(ref: string): Promise<PipelineStatus>;
     listPipelines(): Promise<Pipeline[]>;
     
     // Repository operations
     getRepositoryInfo(): Promise<RepositoryInfo>;
   }
   
   // GitHub implementation
   export class GitHubApiClient implements ForgeApiClient {
     private octokit: Octokit;
     
     constructor(token: string) {
       this.octokit = new Octokit({ auth: token });
     }
     
     // ... implementation
   }
   
   // GitLab implementation
   export class GitLabApiClient implements ForgeApiClient {
     private api: Gitlab;
     
     constructor(token: string, host: string = 'https://gitlab.com') {
       this.api = new Gitlab({ host, token });
     }
     
     // ... implementation
   }
   ```

### Phase 2: GitHub App & GitLab Group/Project Tokens (Future)

**Benefits:**
- Better security (not tied to users)
- Automatic token rotation
- Better audit trails
- Fine-grained permissions

**Implementation Considerations:**

1. **GitHub Apps**
   - Need to implement JWT generation
   - Handle token exchange for installation tokens
   - Store private key securely (encrypted)
   - Listen to webhook events for installation changes

2. **GitLab Project/Group Tokens**
   - Requires GitLab Premium/Ultimate
   - Similar implementation to PATs but different token source
   - May need API to create/rotate tokens automatically

## Security Considerations

### Token Storage

1. **Encryption at Rest**
   - All tokens must be encrypted before database storage
   - Use AES-256-GCM with unique IV per token
   - Store encryption key separately (environment variable or KMS)

2. **Token Rotation**
   - Track token expiration dates
   - Implement automated rotation for supported methods
   - Alert users when manual rotation is needed

3. **Access Control**
   - Only server should decrypt tokens
   - Never log tokens (even encrypted)
   - Use prepared statements to prevent SQL injection

### Network Security

1. **HTTPS Only**
   - All git operations must use HTTPS with token authentication
   - Never use HTTP or unencrypted git protocol

2. **Token Scope**
   - Request minimum required permissions
   - Document required scopes clearly
   - Validate token permissions on configuration

### Audit Trail

1. **Logging**
   - Log all authentication attempts (success and failure)
   - Log token usage (not the token itself)
   - Include project ID, timestamp, and operation type

2. **Monitoring**
   - Alert on authentication failures
   - Track unusual patterns (e.g., many failed attempts)

## Database Schema Changes

### New Tables

```typescript
// apps/server/src/db/schema.ts additions

// Authentication methods enum
export const forgeTypeEnum = pg.pgEnum("forge_type", ["github", "gitlab"]);
export const authMethodEnum = pg.pgEnum("auth_method", [
  "personal_access_token",
  "github_app", 
  "gitlab_project_token",
  "gitlab_group_token",
  "oauth"
]);

// Project authentication configuration
export const projectAuthTable = pg.pgTable("project_auth", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`),
  projectId: pg
    .uuid()
    .references(() => projectsTable.id, { onDelete: "cascade" })
    .notNull()
    .unique(), // One auth config per project
  forgeType: forgeTypeEnum().notNull(),
  authMethod: authMethodEnum().notNull(),
  
  // Encrypted credentials
  encryptedCredentials: pg.jsonb().notNull(),
  
  // Token metadata
  tokenExpiresAt: pg.timestamp(),
  lastUsedAt: pg.timestamp(),
  
  // For GitHub Apps
  appId: pg.text(),
  installationId: pg.text(),
  
  // For GitLab self-hosted
  hostUrl: pg.text(), // e.g., https://gitlab.company.com
  
  createdAt: pg.timestamp().notNull().defaultNow(),
  updatedAt: pg.timestamp().notNull().defaultNow(),
});

// Audit log for authentication events
export const authAuditLogTable = pg.pgTable("auth_audit_log", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`),
  projectId: pg.uuid().references(() => projectsTable.id).notNull(),
  eventType: pg.pgEnum("auth_event_type", [
    "token_created",
    "token_rotated",
    "token_used",
    "auth_success",
    "auth_failure",
    "token_expired"
  ]).notNull(),
  details: pg.jsonb(), // Non-sensitive metadata
  createdAt: pg.timestamp().notNull().defaultNow(),
});
```

### Encrypted Credentials Structure

```typescript
interface EncryptedCredentials {
  // AES-256-GCM encrypted
  ciphertext: string;
  // Base64 encoded IV
  iv: string;
  // Base64 encoded auth tag
  tag: string;
  // Version for future migrations
  version: number;
}

// Decrypted structure (never stored)
interface DecryptedCredentials {
  // For PATs
  token?: string;
  
  // For GitHub Apps
  privateKey?: string;
  clientSecret?: string;
  
  // For OAuth
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}
```

## API Design

### New Endpoints

```typescript
// packages/api/src/projects/projects-api.ts additions

// Configure authentication for a project
export const configureProjectAuth = async (
  projectId: ProjectId,
  config: AuthConfiguration
): Promise<ProjectAuth> => {
  // Validate token permissions
  // Encrypt and store credentials
  // Return auth configuration (without sensitive data)
};

// Get project auth status
export const getProjectAuthStatus = async (
  projectId: ProjectId
): Promise<AuthStatus> => {
  // Return: configured, not_configured, expired, invalid
};

// Rotate token
export const rotateProjectToken = async (
  projectId: ProjectId,
  newCredentials: AuthCredentials
): Promise<ProjectAuth> => {
  // Validate new token
  // Update encrypted credentials
  // Log rotation event
};

// Test authentication
export const testProjectAuth = async (
  projectId: ProjectId
): Promise<TestResult> => {
  // Try to access repo via API
  // Return success/failure with details
};
```

### Auth Configuration Types

```typescript
// packages/api/src/auth/auth-types.ts

export type AuthConfiguration = 
  | GitHubPATConfig
  | GitHubAppConfig
  | GitLabPATConfig
  | GitLabProjectTokenConfig;

export interface GitHubPATConfig {
  type: 'github_pat';
  token: string;
  scopes: string[];
}

export interface GitHubAppConfig {
  type: 'github_app';
  appId: string;
  installationId: string;
  privateKey: string;
  clientId?: string;
  clientSecret?: string;
}

export interface GitLabPATConfig {
  type: 'gitlab_pat';
  host: string; // gitlab.com or self-hosted
  token: string;
  scopes: string[];
}

export interface GitLabProjectTokenConfig {
  type: 'gitlab_project_token';
  host: string;
  token: string;
  projectId: string;
}
```

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

1. **Database Migration**
   - Create `project_auth` table
   - Create `auth_audit_log` table
   - Add encryption utilities

2. **Encryption Service**
   - Implement AES-256-GCM encryption/decryption
   - Key management (environment variable)
   - Secure credential handling

3. **API Endpoints**
   - Configure auth endpoint
   - Test auth endpoint
   - Get auth status endpoint

### Phase 2: Git Integration (Week 2-3)

1. **GitService Updates**
   - Add authentication to checkoutRepository
   - Add authentication to pushRepository
   - Support HTTPS with embedded tokens

2. **Workflow Integration**
   - Fetch project auth in WorkflowExecutionService
   - Pass auth to GitService operations
   - Handle auth failures gracefully

### Phase 3: API Clients (Week 3-4)

1. **Forge API Abstraction**
   - Create ForgeApiClient interface
   - Implement GitHubApiClient with Octokit
   - Implement GitLabApiClient with Gitbeaker

2. **API Operations**
   - Pull request creation
   - Pipeline status checking
   - Repository metadata retrieval

### Phase 4: UI & Management (Week 4-5)

1. **Frontend Components**
   - Auth configuration form
   - Token status display
   - Test connection button

2. **Token Management**
   - Rotation UI
   - Expiration warnings
   - Audit log viewer

### Phase 5: Advanced Features (Future)

1. **GitHub App Support**
   - JWT generation
   - Installation token exchange
   - Webhook handling

2. **Automated Rotation**
   - Background job for token refresh
   - Email notifications for expiration
   - Automatic GitLab project token renewal

## Testing Strategy

### Unit Tests

1. **Encryption/Decryption**
   - Test AES-256-GCM implementation
   - Verify IV uniqueness
   - Test error handling for corrupted data

2. **GitService with Auth**
   - Mock git operations with authentication
   - Test URL construction with tokens
   - Test error handling for invalid tokens

3. **API Clients**
   - Mock Octokit and Gitbeaker
   - Test all API operations
   - Test error handling

### Integration Tests

1. **End-to-End Git Operations**
   - Clone private repository
   - Push to private repository
   - Verify authentication headers

2. **API Operations**
   - Create PR via API
   - Check pipeline status
   - Verify correct permissions

### Security Tests

1. **Token Security**
   - Verify tokens never logged
   - Test database encryption
   - Verify memory clearing after use

2. **Access Control**
   - Test unauthorized access attempts
   - Verify project isolation
   - Test token scope enforcement

## Dependencies

### New NPM Packages

```json
{
  "@octokit/rest": "^20.0.0",      // GitHub API client
  "@octokit/auth-app": "^6.0.0",   // GitHub App authentication
  "@gitbeaker/rest": "^40.0.0",    // GitLab API client
  "simple-git": "^3.20.0"          // Already in use, verify HTTPS support
}
```

## Risks and Mitigations

### Risk: Token Exposure

**Mitigation:**
- Encrypt all tokens at rest
- Use HTTPS only for git operations
- Never log tokens
- Clear tokens from memory after use

### Risk: Token Expiration

**Mitigation:**
- Track expiration dates
- Implement notification system
- Support automatic rotation where possible
- Graceful degradation when auth fails

### Risk: Scope Creep

**Mitigation:**
- Document minimum required scopes
- Validate scopes on configuration
- Regular security audits

### Risk: Database Breach

**Mitigation:**
- Strong encryption (AES-256-GCM)
- Separate encryption key storage
- Regular security audits
- Consider KMS integration

## Conclusion

This research provides a comprehensive plan for implementing secure authentication with GitHub and GitLab forges in My Agent Loop. The recommended approach starts with Personal Access Tokens for immediate functionality, with a clear path to more advanced authentication methods like GitHub Apps in the future.

Key deliverables:
1. Encrypted token storage in PostgreSQL
2. Updated GitService with authentication support
3. Forge API clients for PR and pipeline operations
4. Management UI for configuration and monitoring
5. Comprehensive audit logging

The implementation prioritizes security while maintaining flexibility for different authentication methods and forge providers.
