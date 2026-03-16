import z from "zod";
import { parseDriverInvocation } from "./cli";
import { runDriver } from "./runtime";

async function main(): Promise<void> {
  const invocation = parseDriverInvocation(process.argv.slice(2));
  await runDriver(invocation);
}

main().catch((error: unknown) => {
  if (error instanceof z.ZodError) {
    console.error("Invalid driver invocation:");
    for (const issue of error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "argument";
      console.error(`- ${path}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error("Driver failed with an unknown error.");
  process.exitCode = 1;
});
