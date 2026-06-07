export default function Pricing({ currentPlan }) {
  const plans = [
    { name: "Starter", price: "R$0/mês", features: ["Perfil básico", "Agendamento de jogos"] },
    { name: "Growth", price: "R$49/mês", features: ["Estatísticas avançadas", "Página personalizada", "Vídeos"] },
    { name: "Enterprise", price: "Sob consulta", features: ["Suporte dedicado", "Integrações customizadas"] },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold">Planos</h1>
      <div className="grid md:grid-cols-3 gap-6 mt-6">
        {plans.map(plan => (
          <div
            key={plan.name}
            className={`border rounded p-4 ${
              currentPlan === plan.name.toLowerCase()
                ? "border-green-500 shadow-lg"
                : "border-gray-300"
            }`}
          >
            <h2 className="text-xl font-semibold">{plan.name}</h2>
            <p className="text-lg">{plan.price}</p>
            <ul className="list-disc ml-4 text-sm mt-2">
              {plan.features.map(f => <li key={f}>{f}</li>)}
            </ul>
            <button
              className={`mt-4 px-4 py-2 rounded ${
                currentPlan === plan.name.toLowerCase()
                  ? "bg-gray-400 text-white cursor-not-allowed"
                  : "bg-green-600 text-white"
              }`}
            >
              {currentPlan === plan.name.toLowerCase() ? "Plano Atual" : "Assinar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
