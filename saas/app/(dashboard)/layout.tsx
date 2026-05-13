import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import SessionProvider from "@/components/SessionProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="flex min-h-screen bg-[#070a0f] text-gray-100">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <section className="flex-1 p-6">{children}</section>
        </main>
      </div>
    </SessionProvider>
  );
}
