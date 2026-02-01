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


## State management

This project uses React Query and Zustand, which are both different kinds of state manager. The primary purpose of React Query is to manage data fetching, and this includes caching to ensure the app is pretty snappy in the majority of cases. Zustand is a state management library that focuses in having a simple API.

In this application there's a split between what data should be in Zustand and what data should be in React Query. In short, if the data is fetched over the network, it should be saved and managed in React Query. If the data is owned by the frontend (e.g. UI state) then Zustand may be a suitable home for it.

As an example of the split, let's consider Projects. Projects are created, retrieved, and updated on the backend, and so React Query is used to manage our caches of projects. However, the "currently selected" project is simply UI state, it's not data that is persisted on the backend.

In order to make consuming these different states convenient, we can package up all of the necessary values and functions in to a single place for use throughout the majority of the application. In the case of Projects, this is passed around using React Contexts, but this is not a hard requirement, it's just what makes sense in that case.
