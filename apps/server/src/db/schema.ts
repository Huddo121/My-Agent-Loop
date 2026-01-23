import type { ProjectId, RunId, TaskId } from "@mono/api";
import { sql } from "drizzle-orm";
import * as pg from "drizzle-orm/pg-core";

export const projectsTable = pg.pgTable("projects", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`).$type<ProjectId>(),
  name: pg.text().notNull(),
  shortCode: pg.text().notNull().unique(),
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
});

export const runsTable = pg.pgTable("runs", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`).$type<RunId>(),
  taskId: pg
    .uuid()
    .references(() => tasksTable.id)
    .notNull(),
  startedAt: pg.timestamp().notNull().defaultNow(),
  completedAt: pg.timestamp(),
});
