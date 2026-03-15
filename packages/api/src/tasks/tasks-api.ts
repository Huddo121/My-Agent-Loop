import { Endpoint } from "cerato";
import z from "zod";
import { isoDatetimeToDate } from "../common-codecs";
import {
  badUserInputSchema,
  notFoundSchema,
  unauthenticatedSchema,
} from "../common-schemas";
import { agentConfigSchema } from "../harnesses/harnesses-model";
import { subtaskSchema, taskIdSchema } from "./tasks-model";

export const taskDtoSchema = z.object({
  id: taskIdSchema,
  title: z.string(),
  description: z.string(),
  completedOn: isoDatetimeToDate.nullish(),
  position: z.number().nullish(),
  agentConfig: agentConfigSchema.nullable(),
  subtasks: z.array(subtaskSchema),
});
export type TaskDto = z.infer<typeof taskDtoSchema>;

export const createTaskRequestSchema = taskDtoSchema
  .pick({
    title: true,
    description: true,
  })
  .extend({
    agentConfig: agentConfigSchema.nullable().optional(),
    subtasks: z.array(subtaskSchema).optional(),
  });
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

export const updateTaskRequestSchema = taskDtoSchema
  .pick({
    title: true,
    description: true,
  })
  .extend({
    agentConfig: agentConfigSchema.nullable().optional(),
    subtasks: z.array(subtaskSchema).optional(),
  });
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

export const moveTaskRequestSchema = z.union([
  z.object({
    method: z.literal("absolute"),
    position: z.enum(["first", "last"]),
  }),
  z.object({
    method: z.literal("relative"),
    before: taskIdSchema,
    after: taskIdSchema,
  }),
]);
export type MoveTaskRequest = z.infer<typeof moveTaskRequestSchema>;

export const tasksApi = Endpoint.multi({
  GET: Endpoint.get()
    .output(200, z.array(taskDtoSchema))
    .output(401, unauthenticatedSchema)
    .output(404, notFoundSchema),
  POST: Endpoint.post()
    .input(createTaskRequestSchema)
    .output(200, taskDtoSchema)
    .output(401, unauthenticatedSchema)
    .output(404, notFoundSchema)
    .output(400, badUserInputSchema),
  children: {
    ":taskId": Endpoint.multi({
      GET: Endpoint.get()
        .output(200, taskDtoSchema)
        .output(401, unauthenticatedSchema)
        .output(404, notFoundSchema),
      PUT: Endpoint.put()
        .input(updateTaskRequestSchema)
        .output(200, taskDtoSchema)
        .output(401, unauthenticatedSchema)
        .output(400, badUserInputSchema)
        .output(404, notFoundSchema),
      children: {
        complete: Endpoint.post()
          .output(200, taskDtoSchema)
          .output(401, unauthenticatedSchema)
          .output(404, notFoundSchema),
        move: Endpoint.post()
          .input(moveTaskRequestSchema)
          .output(200, taskDtoSchema)
          .output(401, unauthenticatedSchema)
          .output(404, notFoundSchema),
      },
    }),
  },
});
