export type Plan = "starter" | "growth" | "enterprise";

export type SubscriptionStatus = "active" | "inactive" | "trial";

export interface Subscription {
  plan: Plan;
  status: SubscriptionStatus;
  expiresAt?: Date | string | null;
}

export function normalizePlan(plan?: string | null): Plan {
  switch ((plan || "").toLowerCase().trim()) {
    case "starter":
    case "basic":
    case "free":
    case "launch":
      return "starter";

    case "growth":
    case "pro":
    case "paid":
    case "scale":
      return "growth";

    case "enterprise":
    case "business":
    case "command":
      return "enterprise";

    default:
      return "starter";
  }
}

export function formatPlanName(plan?: string | null): string {
  const normalized = normalizePlan(plan);

  if (normalized === "starter") return "Starter";
  if (normalized === "growth") return "Growth";
  return "Enterprise";
}

export function isActiveSubscription(subscription?: Subscription | null): boolean {
  return subscription?.status === "active" || subscription?.status === "trial";
}

export function formatSubscription(subscription?: Subscription | null): string {
  if (!subscription) return "Plano Starter inativo";

  const planName = formatPlanName(subscription.plan);

  if (subscription.status === "active") {
    const expiresAt = subscription.expiresAt
      ? new Date(subscription.expiresAt).toLocaleDateString()
      : null;

    return expiresAt
      ? `Plano ${planName} ativo até ${expiresAt}`
      : `Plano ${planName} ativo`;
  }

  if (subscription.status === "trial") {
    return `Plano ${planName} em período de teste`;
  }

  return `Plano ${planName} inativo`;
}
