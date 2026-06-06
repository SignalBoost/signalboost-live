export type SubscriptionTier = "free" | "pro" | "enterprise";
export type VideoAccessStatus = "demo" | "full" | "blocked";
export type BillingProvider = "stripe" | "paypal" | "manual";

export type VideoUsageSnapshot = {
  accountId: string;
  subscriptionTier: SubscriptionTier;
  quotaMb: number;
  usedMb: number;
  overageCharges: number;
};

export type VideoAccessInput = {
  usage: VideoUsageSnapshot;
  uploadSizeMb: number;
  durationSec?: number | null;
  overageAccepted?: boolean;
  billingProvider?: BillingProvider;
};

export type VideoBillingDecision = {
  provider: BillingProvider;
  chargeRequired: boolean;
  chargeAccepted: boolean;
  overageMb: number;
  billableGb: number;
  billableMinutes: number;
  ratePerGb: number;
  ratePerMinute: number;
  chargeAmount: number;
  currency: "USD";
  reason: string;
};

export type VideoAccessDecision = {
  accountId: string;
  subscriptionTier: SubscriptionTier;
  status: VideoAccessStatus;
  playbackMode: "demo" | "full" | "blocked";
  storageMode: "demo" | "full" | "blocked";
  maxDemoDurationSec: number;
  maxDemoSizeMb: number;
  allowedPlaybackSeconds: number | null;
  uploadSizeMb: number;
  projectedUsedMb: number;
  quotaMb: number;
  usedMb: number;
  remainingMb: number;
  billing: VideoBillingDecision;
  messageKey: string;
};

export const DEMO_VIDEO_LIMITS = {
  maxDurationSec: 30,
  maxSizeMb: 10,
} as const;

export const VIDEO_QUOTAS_MB: Record<SubscriptionTier, number> = {
  free: 10,
  pro: 10_240,
  enterprise: 102_400,
};

export const VIDEO_OVERAGE_RATES = {
  perGbUsd: 0.18,
  perMinuteUsd: 0.03,
} as const;

export function normalizeSubscriptionTier(
  plan?: string | null,
): SubscriptionTier {
  const normalized = String(plan || "free").toLowerCase();
  if (normalized === "enterprise" || normalized === "business")
    return "enterprise";
  if (normalized === "pro" || normalized === "starter" || normalized === "paid")
    return "pro";
  return "free";
}

export function defaultVideoQuotaMb(tier: SubscriptionTier): number {
  return VIDEO_QUOTAS_MB[tier];
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function evaluateVideoAccess(
  input: VideoAccessInput,
): VideoAccessDecision {
  const { usage, uploadSizeMb, durationSec = null } = input;
  const tier = usage.subscriptionTier;
  const quotaMb = Math.max(usage.quotaMb || defaultVideoQuotaMb(tier), 0);
  const usedMb = Math.max(usage.usedMb || 0, 0);
  const projectedUsedMb = usedMb + Math.max(uploadSizeMb, 0);
  const remainingMb = Math.max(quotaMb - usedMb, 0);
  const overageMb = Math.max(projectedUsedMb - quotaMb, 0);
  const billableGb = overageMb / 1024;
  const billableMinutes = Math.max(durationSec || 0, 0) / 60;
  const chargeAmount = cents(
    billableGb * VIDEO_OVERAGE_RATES.perGbUsd +
      (overageMb > 0 ? billableMinutes * VIDEO_OVERAGE_RATES.perMinuteUsd : 0),
  );
  const billingProvider = input.billingProvider ?? "stripe";

  const baseBilling: VideoBillingDecision = {
    provider: billingProvider,
    chargeRequired: overageMb > 0,
    chargeAccepted: Boolean(input.overageAccepted && overageMb > 0),
    overageMb: cents(overageMb),
    billableGb: cents(billableGb),
    billableMinutes: cents(billableMinutes),
    ratePerGb: VIDEO_OVERAGE_RATES.perGbUsd,
    ratePerMinute: VIDEO_OVERAGE_RATES.perMinuteUsd,
    chargeAmount,
    currency: "USD",
    reason: overageMb > 0 ? "quota_exceeded" : "within_quota",
  };

  if (tier === "free") {
    const exceedsDemoUpload = uploadSizeMb > DEMO_VIDEO_LIMITS.maxSizeMb;
    const exceedsDemoDuration =
      typeof durationSec === "number" &&
      durationSec > DEMO_VIDEO_LIMITS.maxDurationSec;

    return {
      accountId: usage.accountId,
      subscriptionTier: tier,
      status: exceedsDemoUpload ? "blocked" : "demo",
      playbackMode: exceedsDemoUpload ? "blocked" : "demo",
      storageMode: exceedsDemoUpload ? "blocked" : "demo",
      maxDemoDurationSec: DEMO_VIDEO_LIMITS.maxDurationSec,
      maxDemoSizeMb: DEMO_VIDEO_LIMITS.maxSizeMb,
      allowedPlaybackSeconds: exceedsDemoUpload
        ? 0
        : DEMO_VIDEO_LIMITS.maxDurationSec,
      uploadSizeMb: cents(uploadSizeMb),
      projectedUsedMb: cents(projectedUsedMb),
      quotaMb,
      usedMb,
      remainingMb,
      billing: {
        ...baseBilling,
        chargeRequired: false,
        chargeAccepted: false,
        chargeAmount: 0,
        reason:
          exceedsDemoUpload || exceedsDemoDuration
            ? "free_demo_limit"
            : "free_demo",
      },
      messageKey: exceedsDemoUpload
        ? "video.access.freeBlocked"
        : "video.access.freeDemo",
    };
  }

  if (overageMb > 0 && !input.overageAccepted) {
    return {
      accountId: usage.accountId,
      subscriptionTier: tier,
      status: "blocked",
      playbackMode: "blocked",
      storageMode: "blocked",
      maxDemoDurationSec: DEMO_VIDEO_LIMITS.maxDurationSec,
      maxDemoSizeMb: DEMO_VIDEO_LIMITS.maxSizeMb,
      allowedPlaybackSeconds: 0,
      uploadSizeMb: cents(uploadSizeMb),
      projectedUsedMb: cents(projectedUsedMb),
      quotaMb,
      usedMb,
      remainingMb,
      billing: baseBilling,
      messageKey: "video.access.overQuotaBlocked",
    };
  }

  return {
    accountId: usage.accountId,
    subscriptionTier: tier,
    status: "full",
    playbackMode: "full",
    storageMode: "full",
    maxDemoDurationSec: DEMO_VIDEO_LIMITS.maxDurationSec,
    maxDemoSizeMb: DEMO_VIDEO_LIMITS.maxSizeMb,
    allowedPlaybackSeconds: null,
    uploadSizeMb: cents(uploadSizeMb),
    projectedUsedMb: cents(projectedUsedMb),
    quotaMb,
    usedMb,
    remainingMb,
    billing: { ...baseBilling, chargeAccepted: overageMb > 0 ? true : false },
    messageKey:
      overageMb > 0 ? "video.access.overQuotaCharged" : "video.access.full",
  };
}
