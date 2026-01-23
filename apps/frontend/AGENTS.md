# My Agent Loop Frontend

This is the frontend for My Agent Loop. The goal with this part of the project is to give humans the ability to set up Projects and Tasks, reorder their priority, and to also observe the progress that AI Agents are making as they work on individual Tasks.

## Tech Stack

- React Query for fetching data from the network
- Cerato for end-to-end typesafe network requests
  - Check the docs inside the package in `node_modules` for usage guidelines
- React and React Router for the rendering and routing. App operates in SPA mode for simplicity.
- Shadcn for components
- Tailwind for styles
- [dnd-kit](https://dndkit.com/) for drag and drop interactivity

## Developing this project

- Prefer using existing components to solve problems. If you feel like you need a new component, if shadcn has it, use their cli to add it (`pnpm shadcn add <component>`).
  - If there's a component that replaces or extends an existing HTML element (e.g. button/Button), use the component rather than the element.
- Due to the difficulty of properly managing caches when using a combination of queries and mutations with React Query, prefer to wrap up common operations with hooks
- Prefer functional components and hooks
- When constructing UI, split the pure rendering component and the 'connected' component which manages the data lifecycle (e.g. fetch, refetch, update, etc.)
- Cerato is used to define the HTTP API, you can find the actual api definition in the `packages/api` package.
