import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("projects/:projectId", "routes/project.tsx"),
] satisfies RouteConfig;
