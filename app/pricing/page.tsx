import { normalizePlan, type Plan } from "@/lib/account/plan";

type PricingPageProps = {
  currentPlan?: Plan;
};

const plans: {
  key: Plan;
  name: string;
  price: string;
  features: string[];
}[] = [
  {
    key: "starter",
    name: "Starter",
    price: "R$0/mês",
    features: ["Perfil básico", "Agendamento de jogos"],
  },
  {
    key: "growth",
    name: "Growth",
    price: "R$49/mês",
    features: ["Estatísticas avançadas", "Página personalizada", "Vídeos"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Sob consulta",
    features: ["Suporte dedicado", "Integrações customizadas"],
  },
];

export default function PricingPage({ currentPlan = "starter" }: PricingPageProps) {
  const activePlan = normalizePlan(currentPlan);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">Planos</h1>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrentPlan = activePlan === plan.key;

          return (
            <div
              key={plan.key}
              className={`rounded border p-4 ${
                isCurrentPlan
                  ? "border-green-500 shadow-lg"
                  : "border-gray-300"
              }`}
            >
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className="text-lg">{plan.price}</p>

              <ul className="ml-4 mt-2 list-disc text-sm">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              {isCurrentPlan ? (
                <button
                  type="button"
                  disabled
                  className="mt-4 cursor-not-allowed rounded bg-gray-400 px-4 py-2 text-white"
                >
                  Plano Atual
                </button>
              ) : (
                <button
                  type="button"
                  className="mt-4 rounded bg-green-600 px-4 py-2 text-white"
                >
                  Assinar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
