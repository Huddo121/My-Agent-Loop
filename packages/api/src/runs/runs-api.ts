import { Endpoint } from "cerato";
import z from "zod";
import { isoDatetimeToDate } from "../common-codecs";
import { notFoundSchema } from "../common-schemas";
import { taskIdSchema } from "../tasks/tasks-model";
import { runIdSchema } from "./runs-model";

export const runDtoSchema = z.object({
  id: runIdSchema,
  taskId: taskIdSchema,
  startedAt: isoDatetimeToDate,
  completedAt: isoDatetimeToDate.nullish(),
});

export const runsApi = {
  ":runId": Endpoint.get()
    .output(200, runDtoSchema)
    .output(404, notFoundSchema),
};
