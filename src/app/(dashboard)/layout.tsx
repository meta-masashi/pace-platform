import { Suspense } from "react";
import { getCurrentStaff } from "@/lib/auth";
import DashboardSidebar from "@/components/dashboard-sidebar";

/** Async server component that fetches staff data for the sidebar. */
async function SidebarWithData() {
  const staff = await getCurrentStaff();
  return <DashboardSidebar staff={staff} />;
}

/** Skeleton shown while the sidebar data resolves. */
function SidebarSkeleton() {
  return (
    <div
      className="fixed left-0 top-0 w-60 h-screen animate-pulse p-4 space-y-4"
      style={{ backgroundColor: "#0f172a" }}
    >
      <div className="h-8 bg-slate-700 rounded w-32" />
      <div className="space-y-2 pt-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-9 bg-slate-800 rounded-md" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#f8fafc" }}>
      <Suspense fallback={<SidebarSkeleton />}>
        <SidebarWithData />
      </Suspense>
      <main className="ml-60 flex-1 p-6 min-h-screen bg-slate-50">{children}</main>
    </div>
  );
}
