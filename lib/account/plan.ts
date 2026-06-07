export type Plan = "starter" | "growth" | "enterprise";

export type SubscriptionStatus = "active" | "inactive" | "trial";

export interface Subscription {
  plan: Plan;
  status: SubscriptionStatus;
  expiresAt?: Date | string | null;
}

type AccountUser = {
  email?: string | null;
  user_metadata?: {
    avatar_url?: string | null;
    full_name?: string | null;
    name?: string | null;
  } | null;
};

export type WorkspaceStatus = "active" | "trialing" | "attention" | "inactive";

export type AccountPlanSnapshot = {
  key: Plan;
  name: string;
  badge: string;
  includedModules: string[];
};

export type AccountSnapshot = {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isAuthenticated: boolean;
  workspaceStatus: WorkspaceStatus;
  subscriptionStatusLabel: string;
  effectivePlan: AccountPlanSnapshot;
};

const PLAN_SNAPSHOTS: Record<Plan, AccountPlanSnapshot> = {
  starter: {
    key: "starter",
    name: "Starter",
    badge: "Starter plan",
    includedModules: ["promote", "reviews", "calendar"],
  },
  growth: {
    key: "growth",
    name: "Growth",
    badge: "Growth plan",
    includedModules: ["promote", "reviews", "calendar", "spreadsheets", "outreach", "assistant", "video"],
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    badge: "Enterprise plan",
    includedModules: ["promote", "reviews", "calendar", "spreadsheets", "outreach", "assistant", "video"],
  },
};

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

function normalizeWorkspaceStatus(status?: string | null): WorkspaceStatus {
  const normalized = (status || "").toLowerCase().trim();

  if (normalized === "active") return "active";
  if (normalized === "trial" || normalized === "trialing") return "trialing";
  if (normalized === "past_due" || normalized === "past due") return "attention";
  return "inactive";
}

function subscriptionStatusLabel(status: WorkspaceStatus): string {
  if (status === "active") return "Subscription active";
  if (status === "trialing") return "Trial active";
  if (status === "attention") return "Needs attention";
  return "No active subscription";
}

function displayNameForUser(user?: AccountUser | null): string {
  const metadata = user?.user_metadata;
  const metadataName = metadata?.full_name || metadata?.name;

  if (metadataName) return metadataName;
  if (user?.email) return user.email.split("@")[0] || "SignalBoost user";
  return "SignalBoost guest";
}

export function buildAccountSnapshot(user?: AccountUser | null, plan?: string | null, status?: string | null): AccountSnapshot {
  const normalizedPlan = normalizePlan(plan);
  const workspaceStatus = user ? normalizeWorkspaceStatus(status) : "inactive";

  return {
    displayName: displayNameForUser(user),
    email: user?.email ?? null,
    avatarUrl: user?.user_metadata?.avatar_url ?? null,
    isAuthenticated: Boolean(user),
    workspaceStatus,
    subscriptionStatusLabel: subscriptionStatusLabel(workspaceStatus),
    effectivePlan: PLAN_SNAPSHOTS[normalizedPlan],
  };
}
