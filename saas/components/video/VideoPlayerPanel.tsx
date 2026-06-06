"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/components/i18n/useTranslation";
import type {
  VideoAccessDecision,
  VideoUsageSnapshot,
} from "@/lib/video/tieredAccess";

type VideoPlayerPanelProps = {
  videoUrl?: string;
  fileName?: string;
  durationSec?: number;
  access?: VideoAccessDecision | null;
  onUploadClick?: () => void;
  syncStatus?: "healthy" | "syncing" | "offline";
};

type UsageResponse = {
  usage?: VideoUsageSnapshot;
  decision?: VideoAccessDecision;
};

function formatMb(value: number) {
  return `${Math.round(value).toLocaleString()} MB`;
}

function statusColor(status: string) {
  if (status === "full") return "#31d67b";
  if (status === "demo") return "#ffc300";
  return "#ff6b6b";
}

function UploadVideoButton({ onUploadClick }: { onUploadClick?: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="sb-button-primary" onClick={onUploadClick}>
      {t("video.player.upload", "Upload video")}
    </button>
  );
}

function PlaybackView({
  access,
  videoUrl,
  fileName,
}: {
  access: VideoAccessDecision;
  videoUrl?: string;
  fileName?: string;
}) {
  const { t } = useTranslation();
  const demoSuffix =
    access.playbackMode === "demo" ? `#t=0,${access.maxDemoDurationSec}` : "";
  const src = videoUrl ? `${videoUrl}${demoSuffix}` : "";

  if (access.playbackMode === "blocked") {
    return (
      <div
        className="sb-card"
        style={{ padding: 18, borderColor: "rgba(255,107,107,.35)" }}
      >
        <strong style={{ color: "#ffb4b4" }}>
          {t("video.player.blockedTitle", "Playback blocked")}
        </strong>
        <p className="sb-body" style={{ marginBottom: 0 }}>
          {t(
            "video.player.blockedBody",
            "Approve overage billing or upgrade your plan to restore video playback and storage.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="sb-card" style={{ padding: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <strong>
          {fileName || t("video.player.defaultTitle", "SignalBoost video")}
        </strong>
        <span style={{ color: statusColor(access.status), fontWeight: 800 }}>
          {access.playbackMode === "demo"
            ? t("video.player.demoBadge", "Demo playback")
            : t("video.player.fullBadge", "Full playback")}
        </span>
      </div>
      {src ? (
        <video
          controls
          preload="metadata"
          src={src}
          style={{ width: "100%", borderRadius: 16, background: "#050505" }}
        />
      ) : (
        <div
          style={{
            border: "1px dashed rgba(255,255,255,.18)",
            borderRadius: 16,
            padding: 24,
            color: "var(--text-muted)",
          }}
        >
          {t(
            "video.player.noVideo",
            "Upload a video to preview playback access.",
          )}
        </div>
      )}
      {access.playbackMode === "demo" && (
        <p className="sb-caption" style={{ marginTop: 10 }}>
          {t(
            "video.player.demoLimit",
            "Free/demo accounts can preview the first 30 seconds only and store clips up to 10 MB.",
          )}
        </p>
      )}
    </div>
  );
}

function QuotaStatusBar({ access }: { access: VideoAccessDecision }) {
  const { t } = useTranslation();
  const percent =
    access.quotaMb > 0
      ? Math.min(100, Math.round((access.usedMb / access.quotaMb) * 100))
      : 0;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <strong>{t("video.player.quota", "Video quota")}</strong>
        <span className="sb-caption">
          {formatMb(access.usedMb)} / {formatMb(access.quotaMb)}
        </span>
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: "rgba(255,255,255,.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: statusColor(access.status),
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

function BillingBanner({ access }: { access: VideoAccessDecision }) {
  const { t } = useTranslation();
  if (!access.billing.chargeRequired) return null;

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        border: "1px solid rgba(255,195,0,.35)",
        background: "rgba(255,195,0,.1)",
      }}
    >
      <strong>{t("video.player.overageTitle", "Overage billing")}</strong>
      <p className="sb-body" style={{ margin: "6px 0 0" }}>
        {access.billing.chargeAccepted
          ? t(
              "video.player.overageCharged",
              "Overage accepted. Extra video storage/playback will be added to billing.",
            )
          : t(
              "video.player.overageApproval",
              "This upload exceeds your quota. Approve Stripe or PayPal overage billing to continue.",
            )}{" "}
        {access.billing.chargeAmount > 0
          ? `$${access.billing.chargeAmount.toFixed(2)} ${access.billing.currency}`
          : ""}
      </p>
    </div>
  );
}

function Footer({
  access,
  syncStatus,
}: {
  access: VideoAccessDecision;
  syncStatus: "healthy" | "syncing" | "offline";
}) {
  const { t } = useTranslation();
  return (
    <div
      className="sb-caption"
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span>
        {t("video.player.status", "Status")}:{" "}
        {t(`video.status.${access.status}`, access.status)}
      </span>
      <span>
        {t("video.player.sync", "Sync health")}:{" "}
        {t(`video.sync.${syncStatus}`, syncStatus)}
      </span>
    </div>
  );
}

export default function VideoPlayerPanel({
  videoUrl,
  fileName,
  durationSec,
  access,
  onUploadClick,
  syncStatus = "healthy",
}: VideoPlayerPanelProps) {
  const { t } = useTranslation();
  const [remoteAccess, setRemoteAccess] = useState<VideoAccessDecision | null>(
    null,
  );

  useEffect(() => {
    if (access) return;
    let cancelled = false;
    fetch("/api/video/access")
      .then((response) => response.json())
      .then((data: UsageResponse) => {
        if (!cancelled && data.decision) setRemoteAccess(data.decision);
      })
      .catch(() => {
        if (!cancelled) setRemoteAccess(null);
      });
    return () => {
      cancelled = true;
    };
  }, [access]);

  const activeAccess = useMemo(
    () => access ?? remoteAccess,
    [access, remoteAccess],
  );

  if (!activeAccess) {
    return (
      <section
        className="sb-card"
        style={{ padding: 20, display: "grid", gap: 14 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="sb-eyebrow">
              {t("video.player.eyebrow", "SaaS Station video")}
            </p>
            <h3 className="sb-h3">
              {t("video.player.title", "Tiered Video Player")}
            </h3>
          </div>
          <UploadVideoButton onUploadClick={onUploadClick} />
        </div>
        <p className="sb-body">
          {t(
            "video.player.loadingUsage",
            "Loading video quota and playback access...",
          )}
        </p>
      </section>
    );
  }

  return (
    <section
      className="sb-card"
      style={{ padding: 20, display: "grid", gap: 16 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p className="sb-eyebrow">
            {t("video.player.eyebrow", "SaaS Station video")}
          </p>
          <h3 className="sb-h3">
            {t("video.player.title", "Tiered Video Player")}
          </h3>
          {typeof durationSec === "number" && (
            <p className="sb-caption">
              {t("video.player.duration", "Duration")}: {durationSec}s
            </p>
          )}
        </div>
        <UploadVideoButton onUploadClick={onUploadClick} />
      </div>
      <PlaybackView
        access={activeAccess}
        videoUrl={videoUrl}
        fileName={fileName}
      />
      <QuotaStatusBar access={activeAccess} />
      <BillingBanner access={activeAccess} />
      <Footer access={activeAccess} syncStatus={syncStatus} />
    </section>
  );
}
