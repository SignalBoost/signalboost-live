<button
  style={{
    padding: "6px 12px",
    background: "#FFD700",
    color: "#000",
    borderRadius: "8px",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
  }}
  onClick={async () => {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({
        priceId: process.env.NEXT_PUBLIC_STRIPE_TOPUP_PRICE_ID,
      }),
    });
    const data = await res.json();
    window.location.href = data.url;
  }}
>
  Buy Credits
</button>
