import type {
  AgentHarnessId,
  ProjectId,
  Subtask,
  TaskId,
  WorkspaceId,
} from "@mono/api";
import { sql } from "drizzle-orm";
import * as pg from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/pg-core";
import type { UserId } from "../auth/UserId";
import type { RunId } from "../runs/RunId";
import type { WorkflowConfiguration } from "../workflow/Workflow";

export const queueStateEnum = pg.pgEnum("queue_state", [
  "idle",
  "processing-single",
  "processing-loop",
  "stopping",
  "failed",
]);

export const forgeTypeEnum = pg.pgEnum("forge_type", ["gitlab", "github"]);

export const userTable = pg.pgTable("user", {
  id: pg.text().primaryKey().$type<UserId>(),
  name: pg.text().notNull(),
  email: pg.text().notNull().unique(),
  emailVerified: pg.boolean().notNull().default(false),
  image: pg.text(),
  createdAt: pg.timestamp().notNull(),
  updatedAt: pg.timestamp().notNull(),
});

export const sessionTable = pg.pgTable(
  "session",
  {
    id: pg.text().primaryKey(),
    expiresAt: pg.timestamp().notNull(),
    token: pg.text().notNull().unique(),
    createdAt: pg.timestamp().notNull(),
    updatedAt: pg.timestamp().notNull(),
    ipAddress: pg.text(),
    userAgent: pg.text(),
    userId: pg
      .text()
      .references(() => userTable.id, { onDelete: "cascade" })
      .notNull()
      .$type<UserId>(),
  },
  (table) => ({
    userIdIdx: pg.index().on(table.userId),
  }),
);

export const accountTable = pg.pgTable(
  "account",
  {
    id: pg.text().primaryKey(),
    accountId: pg.text().notNull(),
    providerId: pg.text().notNull(),
    userId: pg
      .text()
      .references(() => userTable.id, { onDelete: "cascade" })
      .notNull()
      .$type<UserId>(),
    accessToken: pg.text(),
    refreshToken: pg.text(),
    idToken: pg.text(),
    accessTokenExpiresAt: pg.timestamp(),
    refreshTokenExpiresAt: pg.timestamp(),
    scope: pg.text(),
    password: pg.text(),
    createdAt: pg.timestamp().notNull(),
    updatedAt: pg.timestamp().notNull(),
  },
  (table) => ({
    userIdIdx: pg.index().on(table.userId),
    providerAccountUnique: pg.unique().on(table.providerId, table.accountId),
  }),
);

export const verificationTable = pg.pgTable(
  "verification",
  {
    id: pg.text().primaryKey(),
    identifier: pg.text().notNull(),
    value: pg.text().notNull(),
    expiresAt: pg.timestamp().notNull(),
    createdAt: pg.timestamp().notNull(),
    updatedAt: pg.timestamp().notNull(),
  },
  (table) => ({
    identifierIdx: pg.index().on(table.identifier),
  }),
);

/** JWKS rows for the Better Auth `jwt()` plugin (OAuth provider mode). */
export const jwksTable = pg.pgTable("jwks", {
  id: pg.text().primaryKey(),
  publicKey: pg.text().notNull(),
  privateKey: pg.text().notNull(),
  createdAt: pg.timestamp().notNull(),
  expiresAt: pg.timestamp(),
});

/** Registered OAuth/OIDC clients (`@better-auth/oauth-provider`). */
export const oauthClientTable = pg.pgTable("oauth_client", {
  id: pg.text().primaryKey(),
  clientId: pg.text().notNull().unique(),
  clientSecret: pg.text(),
  disabled: pg.boolean().default(false),
  skipConsent: pg.boolean(),
  enableEndSession: pg.boolean(),
  subjectType: pg.text(),
  scopes: pg.text().array(),
  userId: pg
    .text()
    .references(() => userTable.id, { onDelete: "cascade" })
    .$type<UserId>(),
  createdAt: pg.timestamp(),
  updatedAt: pg.timestamp(),
  name: pg.text(),
  uri: pg.text(),
  icon: pg.text(),
  contacts: pg.text().array(),
  tos: pg.text(),
  policy: pg.text(),
  softwareId: pg.text(),
  softwareVersion: pg.text(),
  softwareStatement: pg.text(),
  redirectUris: pg.text().array().notNull(),
  postLogoutRedirectUris: pg.text().array(),
  tokenEndpointAuthMethod: pg.text(),
  grantTypes: pg.text().array(),
  responseTypes: pg.text().array(),
  public: pg.boolean(),
  type: pg.text(),
  requirePKCE: pg.boolean(),
  referenceId: pg.text(),
  metadata: pg.jsonb(),
});

export const oauthRefreshTokenTable = pg.pgTable("oauth_refresh_token", {
  id: pg.text().primaryKey(),
  token: pg.text().notNull(),
  clientId: pg
    .text()
    .notNull()
    .references(() => oauthClientTable.clientId, { onDelete: "cascade" }),
  sessionId: pg.text().references(() => sessionTable.id, {
    onDelete: "set null",
  }),
  userId: pg
    .text()
    .references(() => userTable.id, { onDelete: "cascade" })
    .notNull()
    .$type<UserId>(),
  referenceId: pg.text(),
  expiresAt: pg.timestamp().notNull(),
  createdAt: pg.timestamp().notNull(),
  revoked: pg.timestamp(),
  authTime: pg.timestamp(),
  scopes: pg.text().array().notNull(),
});

export const oauthAccessTokenTable = pg.pgTable("oauth_access_token", {
  id: pg.text().primaryKey(),
  token: pg.text().notNull().unique(),
  clientId: pg
    .text()
    .notNull()
    .references(() => oauthClientTable.clientId, { onDelete: "cascade" }),
  sessionId: pg.text().references(() => sessionTable.id, {
    onDelete: "set null",
  }),
  userId: pg
    .text()
    .references(() => userTable.id, { onDelete: "cascade" })
    .$type<UserId>(),
  referenceId: pg.text(),
  refreshId: pg.text().references(() => oauthRefreshTokenTable.id, {
    onDelete: "cascade",
  }),
  expiresAt: pg.timestamp().notNull(),
  createdAt: pg.timestamp().notNull(),
  scopes: pg.text().array().notNull(),
});

export const oauthConsentTable = pg.pgTable("oauth_consent", {
  id: pg.text().primaryKey(),
  clientId: pg
    .text()
    .notNull()
    .references(() => oauthClientTable.clientId, { onDelete: "cascade" }),
  userId: pg
    .text()
    .references(() => userTable.id, { onDelete: "cascade" })
    .$type<UserId>(),
  referenceId: pg.text(),
  scopes: pg.text().array().notNull(),
  createdAt: pg.timestamp().notNull(),
  updatedAt: pg.timestamp().notNull(),
});

export const workspacesTable = pg.pgTable("workspaces", {
  id: pg.uuid().primaryKey().defaultRandom().$type<WorkspaceId>(),
  name: pg.text().notNull(),
  createdAt: pg.timestamp().notNull().defaultNow(),
});

export const workspaceMembershipsTable = pg.pgTable(
  "workspace_memberships",
  {
    id: pg.uuid().primaryKey().default(sql`uuidv7()`),
    workspaceId: pg
      .uuid()
      .references(() => workspacesTable.id, { onDelete: "cascade" })
      .notNull()
      .$type<WorkspaceId>(),
    userId: pg
      .text()
      .references(() => userTable.id, { onDelete: "cascade" })
      .notNull()
      .$type<UserId>(),
    createdAt: pg.timestamp().notNull().defaultNow(),
  },
  (table) => ({
    workspaceUserUnique: pg.unique().on(table.workspaceId, table.userId),
  }),
);

export const projectsTable = pg.pgTable(
  "projects",
  {
    id: pg.uuid().primaryKey().default(sql`uuidv7()`).$type<ProjectId>(),
    workspaceId: pg
      .uuid()
      .references(() => workspacesTable.id)
      .notNull()
      .$type<WorkspaceId>(),
    name: pg.text().notNull(),
    shortCode: pg.text().notNull(),
    nextTaskNumber: pg.integer().notNull().default(1),
    repositoryUrl: pg.text().notNull(),
    workflowConfiguration: pg.jsonb().notNull().$type<WorkflowConfiguration>(),
    queueState: queueStateEnum().notNull().default("idle"),
    forgeType: forgeTypeEnum().notNull(),
    forgeBaseUrl: pg.text().notNull(),
  },
  (table) => ({
    workspaceShortCodeUnique: pg
      .unique()
      .on(table.workspaceId, table.shortCode),
    nextTaskNumberPositive: check(
      "projects_next_task_number_positive",
      sql`${table.nextTaskNumber} > 0`,
    ),
  }),
);

export const projectForgeSecretsTable = pg.pgTable("project_forge_secrets", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`),
  projectId: pg
    .uuid()
    .references(() => projectsTable.id)
    .notNull()
    .$type<ProjectId>()
    .unique(),
  encryptedToken: pg.text().notNull(),
});

export const tasksTable = pg.pgTable(
  "tasks",
  {
    id: pg.uuid().primaryKey().default(sql`uuidv7()`).$type<TaskId>(),
    taskNumber: pg.integer().notNull(),
    title: pg.text().notNull(),
    projectId: pg
      .uuid()
      .references(() => projectsTable.id)
      .notNull()
      .$type<ProjectId>(),
    description: pg.text().notNull(),
    subtasks: pg.jsonb().notNull().default(sql`'[]'::jsonb`).$type<Subtask[]>(),
    createdAt: pg.timestamp().notNull().defaultNow(),
    completedOn: pg.timestamp(),
    /** Where does this task appear in the queue? Only relevant for non-completed tasks. */
    position: pg.doublePrecision(),
  },
  (table) => ({
    projectTaskNumberUnique: pg.unique().on(table.projectId, table.taskNumber),
    taskNumberPositive: check(
      "tasks_task_number_positive",
      sql`${table.taskNumber} > 0`,
    ),
  }),
);

/** One row per workspace, project, or task. Exactly one of the FKs is non-null. */
export const agentHarnessConfigurationTable = pg.pgTable(
  "agent_harness_configuration",
  {
    id: pg.uuid().primaryKey().default(sql`uuidv7()`),
    workspaceId: pg
      .uuid()
      .references(() => workspacesTable.id)
      .unique()
      .$type<WorkspaceId>(),
    projectId: pg
      .uuid()
      .references(() => projectsTable.id)
      .unique()
      .$type<ProjectId>(),
    taskId: pg
      .uuid()
      .references(() => tasksTable.id)
      .unique()
      .$type<TaskId>(),
    agentHarnessId: pg.text().notNull().$type<AgentHarnessId>(),
    agentModelId: pg.text().$type<string>(),
  },
  (table) => ({
    exactlyOneTarget: check(
      "agent_harness_config_exactly_one_target",
      sql`(num_nonnulls(${table.workspaceId}, ${table.projectId}, ${table.taskId}) = 1)`,
    ),
  }),
);

export const runStateEnum = pg.pgEnum("run_state", [
  /** The run record is created, but not yet picked up for processing by a worker */
  "pending",
  /** The run is now being processed by a worker */
  "in_progress",
  /** The run has been completed successfully */
  "completed",
  /** The run has failed */
  "failed",
]);

export const runsTable = pg.pgTable(
  "runs",
  {
    id: pg.uuid().primaryKey().default(sql`uuidv7()`).$type<RunId>(),
    taskId: pg
      .uuid()
      .references(() => tasksTable.id)
      .notNull()
      .$type<TaskId>(),
    startedAt: pg.timestamp().notNull().defaultNow(),
    state: runStateEnum().notNull().default("pending"),
    completedAt: pg.timestamp(),
  },
  (table) => ({
    oneActiveRunPerTask: pg
      .uniqueIndex()
      .on(table.taskId, table.state)
      .where(sql`state IN ('pending', 'in_progress')`),
  }),
);
