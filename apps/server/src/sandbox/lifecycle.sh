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

# Run the agent (injected by the workflow via AGENT_RUN_COMMAND)
if [ -z "${AGENT_RUN_COMMAND:-}" ]; then
  echo "AGENT_RUN_COMMAND not set"
  exit 1
fi
eval "$AGENT_RUN_COMMAND"
AGENT_EXIT_CODE=$?

# Run teardown script if it exists (with 1 minute timeout)
if [ -f /code/.agent-loop/teardown.sh ]; then
  echo "Running teardown script..."
  timeout 60 bash /code/.agent-loop/teardown.sh || {
    echo "Warning: Teardown script timed out or failed, continuing..."
  }
fi

# Exit with the agent's exit code
exit $AGENT_EXIT_CODE
