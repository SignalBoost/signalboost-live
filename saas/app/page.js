// saas/app/page.js

export default function Home() {
  return (
    <iframe
      src="/index.html"
      title="SignalBoost homepage"
      style={{
        width: "100%",
        height: "100vh",
        border: "none",
        display: "block",
      }}
    />
  );
}
