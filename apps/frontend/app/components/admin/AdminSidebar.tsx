import { Link, useLocation } from "react-router";
import { cn } from "~/lib/utils";

export function AdminSidebar() {
  const location = useLocation();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-gray-50">
      <div className="flex h-16 items-center border-b px-6">
        <h2 className="text-lg font-semibold">Admin Panel</h2>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        <Link
          to="/admin"
          className={cn(
            "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            location.pathname === "/admin"
              ? "bg-blue-100 text-blue-700"
              : "text-gray-700 hover:bg-gray-100",
          )}
        >
          Dashboard
        </Link>

        <Link
          to="/admin/queue"
          className={cn(
            "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            location.pathname === "/admin/queue"
              ? "bg-blue-100 text-blue-700"
              : "text-gray-700 hover:bg-gray-100",
          )}
        >
          Queue Management
        </Link>

        <Link
          to="/admin/system"
          className={cn(
            "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            location.pathname === "/admin/system"
              ? "bg-blue-100 text-blue-700"
              : "text-gray-700 hover:bg-gray-100",
          )}
        >
          System Overview
        </Link>
      </nav>
    </div>
  );
}
