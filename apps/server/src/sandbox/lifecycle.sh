#!/bin/bash

# =============================================================================
# Sandbox Lifecycle Script
#
# This script runs inside the sandbox container and orchestrates the execution
# flow. It follows a clear ownership contract between SERVER and DRIVER:
#
# SERVER (workflow execution service) owns:
#   - Creating /task.txt with the task description
#   - Mounting harness config files (from AgentHarness.files)
#   - Setting environment variables
#   - Passing harness setup commands and run command to this script
#
# LIFECYCLE (this script) owns:
#   - Running setup.sh if present (pre-driver setup)
#   - Running harness-setup.sh with setup commands from harness.prepare()
#   - Starting the driver binary
#   - Running teardown.sh if present
#
# DRIVER owns:
#   - Executing the harness command (from --harness-command CLI arg)
#   - Forwarding stdout/stderr to the host API
#   - Sending lifecycle events (harness-starting, harness-exited)
#   - Exiting with the harness result
#
# The task file (/task.txt) is created by the SERVER before the container starts.
# The driver does NOT create or manage the task file.
# =============================================================================

# Save current shell options and flags
SAVED_SHELL_OPTIONS=$(set +o)
SAVED_FLAGS="$-"

# Run setup script if it exists
if [ -f /code/.agent-loop/setup.sh ]; then
  echo "Running setup script..."
  source /code/.agent-loop/setup.sh

  SETUP_EXIT_CODE=$?

  if [ $SETUP_EXIT_CODE -ne 0 ]; then
    echo "Setup script failed with exit code $SETUP_EXIT_CODE"
    exit $SETUP_EXIT_CODE
  fi

  # Restore shell options and flags, preventing the `setup.sh` from modifying the runtime behaviour of this script (somewhat)
  eval "$SAVED_SHELL_OPTIONS"
  set -$SAVED_FLAGS
fi

set -e -x

# Run harness-specific setup commands (e.g., claude mcp add ...)
if [ -f /harness-setup.sh ]; then
  source /harness-setup.sh
fi

# Run the driver binary with CLI arguments
# The driver is the long-lived process that:
# 1. Starts the selected harness command
# 2. Forwards logs to the host API
# 3. Exits with the harness result
if [ -z "${MAL_DRIVER_BINARY_PATH:-}" ]; then
  echo "MAL_DRIVER_BINARY_PATH not set"
  exit 1
fi

if [ -z "${MAL_DRIVER_CLI_ARGS:-}" ]; then
  echo "MAL_DRIVER_CLI_ARGS not set"
  exit 1
fi

echo "Starting driver binary: $MAL_DRIVER_BINARY_PATH"

# Execute the driver binary with the provided CLI arguments
# The driver will run the harness command and forward logs until the harness exits
# Remember whether the `x` flag (xtrace) was enabled so we can restore it after running the driver
WAS_XTRACE_ENABLED=0
case "$-" in
  *x*) WAS_XTRACE_ENABLED=1 ;;
esac

set +x
set +e
eval "$MAL_DRIVER_BINARY_PATH $MAL_DRIVER_CLI_ARGS"
DRIVER_EXIT_CODE=$?
set -e

if [ "$WAS_XTRACE_ENABLED" -eq 1 ]; then
  set -x
fi

# Run teardown script if it exists (with 1 minute timeout)
if [ -f /code/.agent-loop/teardown.sh ]; then
  echo "Running teardown script..."
  timeout 60 bash /code/.agent-loop/teardown.sh || {
    echo "Warning: Teardown script timed out or failed, continuing..."
  }
fi

# Exit with the driver's exit code (which reflects the harness result)
exit $DRIVER_EXIT_CODE
