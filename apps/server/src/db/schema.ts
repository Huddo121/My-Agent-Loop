import type { ProjectId, TaskId, WorkspaceId } from "@mono/api";
import { sql } from "drizzle-orm";
import * as pg from "drizzle-orm/pg-core";
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

export const workspacesTable = pg.pgTable("workspaces", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`).$type<WorkspaceId>(),
  name: pg.text().notNull(),
  createdAt: pg.timestamp().notNull().defaultNow(),
});

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
    .notNull(),
  description: pg.text().notNull(),
  createdAt: pg.timestamp().notNull().defaultNow(),
  completedOn: pg.timestamp(),
  /** Where does this task appear in the queue? Only relevant for non-completed tasks. */
  position: pg.doublePrecision(),
});

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
