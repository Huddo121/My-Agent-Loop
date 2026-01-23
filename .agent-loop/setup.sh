#! /bin/bash

# Download and install nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# in lieu of restarting the shell
\. "$HOME/.nvm/nvm.sh"

nvm install
nvm use

# Verify the Node.js version:
node -v # Should print "v24.13.0".

# Download and install pnpm:
npm i -g pnpm

# Verify pnpm version:
pnpm -v

pnpm install --frozen-lockfile
