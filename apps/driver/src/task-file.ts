import { readFile, writeFile } from "node:fs/promises";
import { type Subtask, subtaskSchema } from "@mono/api";
import z from "zod";
import type { Result } from "./result";

const driverTaskFileSchema = z.object({
  title: z.string(),
  description: z.string(),
  subtasks: z.array(subtaskSchema),
});

export type DriverTaskFile = z.infer<typeof driverTaskFileSchema>;

const SUBTASKS_HEADER = "## Subtasks";

export async function loadTaskFile(
  taskFilePath: string,
): Promise<Result<DriverTaskFile, Error>> {
  try {
    const contents = await readFile(taskFilePath, "utf8");
    return parseTaskFile(contents);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error : new Error("Failed to read task file."),
    };
  }
}

export async function saveTaskFile(
  taskFilePath: string,
  taskFile: DriverTaskFile,
): Promise<Result<void, Error>> {
  try {
    await writeFile(taskFilePath, formatTaskFile(taskFile), "utf8");
    return { success: true, value: undefined };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error
          : new Error("Failed to write task file."),
    };
  }
}

export function formatTaskFile(taskFile: DriverTaskFile): string {
  let content = `# ${taskFile.title}\n\n${taskFile.description}\n`;

  if (taskFile.subtasks.length > 0) {
    const subtasksBlock = taskFile.subtasks
      .map((subtask) => {
        const lines = [
          `- id: ${toYamlString(subtask.id)}`,
          `  title: ${toYamlString(subtask.title)}`,
        ];

        if (subtask.description !== undefined) {
          lines.push(`  description: ${toYamlString(subtask.description)}`);
        }

        lines.push(`  status: ${toYamlString(subtask.state)}`);
        return lines.join("\n");
      })
      .join("\n");

    content += `\n${SUBTASKS_HEADER}\n\n${subtasksBlock}\n`;
  }

  return content;
}

export function parseTaskFile(contents: string): Result<DriverTaskFile, Error> {
  const lines = contents.split(/\r?\n/);

  const titleLine = lines[0]?.trim();
  if (titleLine === undefined || !titleLine.startsWith("# ")) {
    return {
      success: false,
      error: new Error("Task file must start with a markdown h1 title."),
    };
  }

  const subtaskHeaderIndex = lines.findIndex((line, index) => {
    if (index === 0) {
      return false;
    }

    return line.trim() === SUBTASKS_HEADER;
  });

  const descriptionLines =
    subtaskHeaderIndex === -1
      ? lines.slice(1)
      : lines.slice(1, subtaskHeaderIndex);

  const taskFileCandidate = {
    title: titleLine.slice(2).trim(),
    description: trimEmptyOuterLines(descriptionLines).join("\n"),
    subtasks:
      subtaskHeaderIndex === -1
        ? []
        : parseSubtasks(lines.slice(subtaskHeaderIndex + 1)),
  };

  const parsed = driverTaskFileSchema.safeParse(taskFileCandidate);
  if (!parsed.success) {
    return {
      success: false,
      error: new Error(
        parsed.error.issues.map((issue) => issue.message).join("; "),
      ),
    };
  }

  return { success: true, value: parsed.data };
}

function parseSubtasks(lines: readonly string[]): Subtask[] {
  const trimmedLines = trimEmptyOuterLines(lines);
  if (trimmedLines.length === 0) {
    return [];
  }

  const subtasks: Subtask[] = [];
  let current: Record<string, string> | undefined;

  for (const rawLine of trimmedLines) {
    const line = rawLine.trimEnd();

    if (line.trim().length === 0) {
      continue;
    }

    if (line.startsWith("- ")) {
      if (current !== undefined) {
        subtasks.push(parseSubtaskRecord(current));
      }

      current = {};
      assignSubtaskField(current, line.slice(2));
      continue;
    }

    if (current === undefined) {
      throw new Error("Subtask block must start with a list item.");
    }

    assignSubtaskField(current, line.trim());
  }

  if (current !== undefined) {
    subtasks.push(parseSubtaskRecord(current));
  }

  return subtasks;
}

function parseSubtaskRecord(record: Record<string, string>): Subtask {
  const parsed = subtaskSchema.parse({
    id: record.id,
    title: record.title,
    description: record.description,
    state: record.status,
  });

  return parsed;
}

function assignSubtaskField(
  record: Record<string, string>,
  line: string,
): void {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) {
    throw new Error(`Invalid subtask field: ${line}`);
  }

  const key = line.slice(0, separatorIndex).trim();
  const rawValue = line.slice(separatorIndex + 1).trim();
  record[key] = fromYamlString(rawValue);
}

function trimEmptyOuterLines(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]?.trim().length === 0) {
    start += 1;
  }

  while (end > start && lines[end - 1]?.trim().length === 0) {
    end -= 1;
  }

  return lines.slice(start, end);
}

function toYamlString(value: string): string {
  return JSON.stringify(value);
}

function fromYamlString(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value) as string;
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}
