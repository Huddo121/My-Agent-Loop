export function isSeaInjectionRequired(env = process.env) {
  return env.DRIVER_SEA_INJECTION_REQUIRED === "1";
}

export function handleSeaInjectionFailure({
  bundleFile,
  seaBlobFile,
  seaExeFile,
  error,
  injectionRequired,
}) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (injectionRequired) {
    throw new Error(
      `Failed to inject SEA blob into executable at ${seaExeFile}: ${errorMessage}`,
    );
  }

  console.log("Warning: Could not inject SEA blob into executable.");
  console.log(
    "This is expected when cross-compiling or on platforms without the sentinel.",
  );
  console.log("Injection error:", errorMessage);
  console.log("");
  console.log("Bundle created at:", bundleFile);
  console.log("Blob created at:", seaBlobFile);
}
