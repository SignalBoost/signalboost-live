// pages/dashboard.tsx
import { useState } from "react";

export default function Dashboard() {
  const [review, setReview] = useState("");
  const [graphic, setGraphic] = useState<string | null>(null);

  async function generateGraphic() {
    const res = await fetch("/api/generate-graphic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review }),
    });
    const data = await res.json();
    setGraphic(data.imageUrl);
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Dashboard</h1>
      <textarea
        placeholder="Paste customer review here..."
        value={review}
        onChange={(e) => setReview(e.target.value)}
        style={{ width: "100%", height: "100px" }}
      />
      <button onClick={generateGraphic}>Generate Graphic</button>

      {graphic && (
        <div>
          <h2>Generated Graphic:</h2>
          <img src={graphic} alt="Generated" style={{ maxWidth: "400px" }} />
        </div>
      )}
    </div>
  );
}
