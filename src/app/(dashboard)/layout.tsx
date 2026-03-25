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
      className="fixed left-0 top-0 w-60 h-screen animate-pulse p-4 space-y-4 bg-white border-r border-slate-200"
    >
      <div className="h-9 bg-slate-100 rounded-lg w-32" />
      <div className="space-y-3 pt-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-slate-50 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface-base">
      <Suspense fallback={<SidebarSkeleton />}>
        <SidebarWithData />
      </Suspense>
      {/* ml-60 for expanded, ml-[72px] for collapsed — handled via CSS transition in sidebar */}
      <main className="ml-60 flex-1 p-6 min-h-screen transition-all duration-200">{children}</main>
    </div>
  );
}
