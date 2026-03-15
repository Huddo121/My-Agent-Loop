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
  id: pg.text().primaryKey(),
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
      .notNull(),
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
      .notNull(),
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
      .notNull(),
    createdAt: pg.timestamp().notNull().defaultNow(),
  },
  (table) => ({
    workspaceUserUnique: pg.unique().on(table.workspaceId, table.userId),
  }),
);

export const workspaceInvitationsTable = pg.pgTable(
  "workspace_invitations",
  {
    id: pg.uuid().primaryKey().default(sql`uuidv7()`),
    workspaceId: pg
      .uuid()
      .references(() => workspacesTable.id, { onDelete: "cascade" })
      .notNull()
      .$type<WorkspaceId>(),
    inviterUserId: pg
      .text()
      .references(() => userTable.id, { onDelete: "cascade" })
      .notNull(),
    inviteeEmail: pg.text().notNull(),
    token: pg.text().notNull().unique(),
    status: pg.text().notNull().default("pending"),
    expiresAt: pg.timestamp().notNull(),
    createdAt: pg.timestamp().notNull().defaultNow(),
    acceptedAt: pg.timestamp(),
    revokedAt: pg.timestamp(),
  },
  (table) => ({
    workspaceInviteeUnique: pg
      .unique()
      .on(table.workspaceId, table.inviteeEmail),
  }),
);

export const projectsTable = pg.pgTable(
  "projects",
  {
    id: pg.uuid().primaryKey().default(sql`uuidv7()`).$type<ProjectId>(),
    workspaceId: pg
      .uuid()
      .references(() => workspacesTable.id)
      .notNull(),
    name: pg.text().notNull(),
    shortCode: pg.text().notNull(),
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
  }),
);

export const projectForgeSecretsTable = pg.pgTable("project_forge_secrets", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`),
  projectId: pg
    .uuid()
    .references(() => projectsTable.id)
    .notNull()
    .unique(),
  encryptedToken: pg.text().notNull(),
});

export const tasksTable = pg.pgTable("tasks", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`).$type<TaskId>(),
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
});

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
      .notNull(),
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
