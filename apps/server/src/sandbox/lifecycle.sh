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

# Read task message from file
TASK_MESSAGE=""
if [ -f /task.txt ]; then
  TASK_MESSAGE=$(cat /task.txt)
fi

# Run aider with provided arguments, appending message from task file
echo "Starting opencode..."

# opencode run "$TASK_MESSAGE"
opencode run "Read the task description in the file /task.txt (at the root of the filesystem) and complete the task within the file. If there is an AGENTS.md file in the current directory, ensure you read it and follow its instructions closely."
OPENCODE_EXIT_CODE=$?

# Run teardown script if it exists (with 1 minute timeout)
if [ -f /code/.agent-loop/teardown.sh ]; then
  echo "Running teardown script..."
  timeout 60 bash /code/.agent-loop/teardown.sh || {
    echo "Warning: Teardown script timed out or failed, continuing..."
  }
fi

# Exit with OpenCode's exit code
exit $OPENCODE_EXIT_CODE
