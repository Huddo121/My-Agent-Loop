import { AdminDashboard } from "~/components/admin/AdminDashboard";

export function meta() {
  return [
    { title: "My Agent Loop - Admin" },
    {
      name: "description",
      content: "System administration dashboard for job queue management",
    },
  ];
}

export default function AdminRoute() {
  return <AdminDashboard />;
}
