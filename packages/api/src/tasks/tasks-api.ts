import { Endpoint } from "cerato";
import z from "zod";
import { isoDatetimeToDate } from "../common-codecs";
import { notFoundSchema } from "../common-schemas";
import { taskIdSchema } from "./tasks-model";

export const taskDtoSchema = z.object({
  id: taskIdSchema,
  title: z.string(),
  description: z.string(),
  completedOn: isoDatetimeToDate.nullish(),
});
export type TaskDto = z.infer<typeof taskDtoSchema>;

export const createTaskRequestSchema = taskDtoSchema.pick({
  title: true,
  description: true,
});
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

export const updateTaskRequestSchema = taskDtoSchema.pick({
  title: true,
  description: true,
});
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

export const tasksApi = Endpoint.multi({
  GET: Endpoint.get().output(200, z.array(taskDtoSchema)),
  POST: Endpoint.post()
    .input(createTaskRequestSchema)
    .output(200, taskDtoSchema),
  children: {
    ":taskId": Endpoint.multi({
      GET: Endpoint.get()
        .output(200, taskDtoSchema)
        .output(404, notFoundSchema),
      PUT: Endpoint.put()
        .input(updateTaskRequestSchema)
        .output(200, taskDtoSchema)
        .output(404, notFoundSchema),
      children: {
        complete: Endpoint.post()
          .output(200, taskDtoSchema)
          .output(404, notFoundSchema),
      },
    }),
  },
});
