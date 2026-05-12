import VideoGenerator from "@/components/VideoGenerator";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-black p-10 text-white">
      <h1 className="mb-8 text-4xl font-bold">
        AI Video Generator
      </h1>

      <VideoGenerator />
    </main>
  );
}
