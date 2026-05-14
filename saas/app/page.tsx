export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 rounded-full border border-white/20 px-4 py-2 text-sm text-white/70">
          Foundation is live
        </p>

        <h1 className="max-w-3xl text-5xl font-bold tracking-tight md:text-7xl">
          SignalBoost
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-white/70 md:text-xl">
          The base app is deployed. Now we add each brick one by one.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="font-semibold">Step 1</h2>
            <p className="mt-2 text-sm text-white/60">Landing page</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="font-semibold">Step 2</h2>
            <p className="mt-2 text-sm text-white/60">Dashboard shell</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="font-semibold">Step 3</h2>
            <p className="mt-2 text-sm text-white/60">Auth + APIs</p>
          </div>
        </div>
      </section>
    </main>
  );
}
