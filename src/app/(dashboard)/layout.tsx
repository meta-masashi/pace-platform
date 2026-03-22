import { getCurrentStaff } from "@/lib/auth";
import DashboardSidebar from "@/components/dashboard-sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff();

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar staff={staff} />
      <main className="ml-60 flex-1 p-6 min-h-screen">{children}</main>
    </div>
  );
}
