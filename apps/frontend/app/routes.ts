import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/admin.tsx"),
  route("projects/:projectId", "routes/project.tsx"),
] satisfies RouteConfig;
