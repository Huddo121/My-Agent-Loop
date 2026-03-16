#!/bin/bash

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
echo "Driver CLI args: $MAL_DRIVER_CLI_ARGS"

# Execute the driver binary with the provided CLI arguments
# The driver will run the harness command and forward logs until the harness exits
eval "$MAL_DRIVER_BINARY_PATH $MAL_DRIVER_CLI_ARGS"
DRIVER_EXIT_CODE=$?

# Run teardown script if it exists (with 1 minute timeout)
if [ -f /code/.agent-loop/teardown.sh ]; then
  echo "Running teardown script..."
  timeout 60 bash /code/.agent-loop/teardown.sh || {
    echo "Warning: Teardown script timed out or failed, continuing..."
  }
fi

# Exit with the driver's exit code (which reflects the harness result)
exit $DRIVER_EXIT_CODE
