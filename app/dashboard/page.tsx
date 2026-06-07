import { formatSubscription, type Subscription } from "@/lib/account/plan";

type DashboardUser = {
  name: string;
  subscription: Subscription;
};

const demoUser: DashboardUser = {
  name: "Luis",
  subscription: {
    plan: "starter",
    status: "active",
  },
};

export default function DashboardPage() {
  const user = demoUser;
  const subscription = user.subscription;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold">Bem-vindo, {user.name}</h1>

      <p className="text-gray-600">
        {formatSubscription(subscription)}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded bg-white p-4 shadow">
          <h2 className="font-semibold">Onboarding</h2>
          <ul className="ml-4 list-disc text-sm">
            <li>Cadastrar time</li>
            <li>Procurar adversário</li>
            <li>Explorar campeonatos</li>
          </ul>
        </div>

        <div className="rounded bg-white p-4 shadow">
          <h2 className="font-semibold">Atividade Recente</h2>
          <p className="text-sm text-gray-500">
            Nenhuma atividade ainda.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded border border-green-200 bg-green-50 p-4">
          <h3 className="font-semibold">Plano Atual</h3>
          <p className="text-sm">{subscription.plan.toUpperCase()}</p>
        </div>

        <div className="rounded border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-semibold">Ferramentas Incluídas</h3>
          <p className="text-sm">Dashboard, Times, Campeonatos</p>
        </div>

        <div className="rounded border border-yellow-200 bg-yellow-50 p-4">
          <h3 className="font-semibold">Próxima Ação</h3>
          <p className="text-sm">Complete seu perfil de time</p>
        </div>
      </div>
    </div>
  );
}
