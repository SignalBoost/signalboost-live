# saas/mining/databricks/cos_mining_job.py
#
# EXTERNAL scale-out mining job for COS. This does NOT run on Vercel — it is the Azure /
# Databricks offload target that mirrors the in-stack TypeScript pipeline
# (saas/lib/cos/mining/*) for large data volumes.
#
# Live path today  : Vercel cron -> lib/cos/mining/pipeline.ts -> Supabase.
# Scale path (this) : Databricks notebook/job reads raw events from Azure Data Lake (or a
#                     Supabase export), computes the SAME feature set + KMeans + Apriori,
#                     and writes features back to Cosmos DB (or Supabase).
#
# Credentials come from the Databricks secret scope / Azure Key Vault — never hard-coded.
#
# Deps (Databricks runtime): pandas, scikit-learn, mlxtend
#   %pip install mlxtend scikit-learn pandas

import os
import datetime as dt
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder

TXN_TYPES = {"deposit", "transfer", "transaction"}
DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
DEVICE_CODE = {"unknown": 0, "mobile": 1, "desktop": 2, "tablet": 3}


def load_events(spark=None) -> pd.DataFrame:
    """Read raw events. Replace the body with your Data Lake / Cosmos read.

    Expected columns: user_id, event_type, provider, amount_cents, device_type, occurred_at
    """
    path = os.environ.get("COS_EVENTS_PATH")  # e.g. abfss://lake@acct.dfs.core.windows.net/cos_events/
    if spark is not None and path:
        return spark.read.parquet(path).toPandas()
    raise RuntimeError("Configure COS_EVENTS_PATH (Data Lake) or wire a Cosmos/Supabase reader.")


def extract_features(df: pd.DataFrame, now: dt.datetime) -> pd.DataFrame:
    df = df.copy()
    df["occurred_at"] = pd.to_datetime(df["occurred_at"], utc=True, errors="coerce")
    df = df.dropna(subset=["user_id", "occurred_at"])
    rows = []
    for uid, g in df.groupby("user_id"):
        times = g["occurred_at"]
        span_days = max(1.0, (times.max() - times.min()).total_seconds() / 86400) if len(g) > 1 else 1.0
        txns = g[g["event_type"].isin(TXN_TYPES)]
        deposits = g[(g["event_type"] == "deposit") & g["amount_cents"].notna()]
        transfers = g[(g["event_type"] == "transfer") & g["amount_cents"].notna()]
        device = g["device_type"].fillna("unknown").mode()
        device = device.iloc[0] if len(device) else "unknown"
        pref_hour = int(txns["occurred_at"].dt.hour.mode().iloc[0]) if len(txns) else 0
        recency_days = max(0.0, (now - times.max()).total_seconds() / 86400)
        ts = now.isoformat()
        feats = {
            "event_frequency_per_day": len(g) / span_days,
            "transaction_count": float(len(txns)),
            "avg_deposit_cents": float(deposits["amount_cents"].mean()) if len(deposits) else 0.0,
            "avg_transfer_cents": float(transfers["amount_cents"].mean()) if len(transfers) else 0.0,
            "preferred_txn_hour": float(pref_hour),
            "dominant_device_code": float(DEVICE_CODE.get(device, 0)),
            "campaign_engagement_rate": (g["event_type"] == "campaign").mean() if len(g) else 0.0,
            "recency_days": recency_days,
        }
        for name, value in feats.items():
            rows.append({"user_id": str(uid), "feature_name": name, "value": float(value), "timestamp": ts})
    return pd.DataFrame(rows)


def segment_users(features: pd.DataFrame, k: int = 5) -> pd.DataFrame:
    wide = features.pivot_table(index="user_id", columns="feature_name", values="value", fill_value=0.0)
    if len(wide) < k:
        return pd.DataFrame(columns=["user_id", "segment"])
    X = StandardScaler().fit_transform(wide.values)
    labels = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(X)
    return pd.DataFrame({"user_id": wide.index.astype(str), "segment": labels})


def mine_rules(df: pd.DataFrame, min_support=0.05, min_conf=0.5) -> pd.DataFrame:
    df = df.copy()
    df["occurred_at"] = pd.to_datetime(df["occurred_at"], utc=True, errors="coerce")
    baskets = []
    for _uid, g in df.groupby("user_id"):
        tokens = set()
        for _, e in g.iterrows():
            if e["event_type"] in TXN_TYPES and pd.notna(e["occurred_at"]):
                tokens.add(f"{e['event_type']}@{DOW[e['occurred_at'].weekday()]}")
            if e["event_type"] == "campaign":
                tokens.add("campaign")
        tokens.add(f"device:{e.get('device_type') or 'unknown'}")
        baskets.append(list(tokens))
    if not baskets:
        return pd.DataFrame()
    te = TransactionEncoder()
    arr = te.fit_transform(baskets)
    onehot = pd.DataFrame(arr, columns=te.columns_)
    freq = apriori(onehot, min_support=min_support, use_colnames=True, max_len=3)
    if freq.empty:
        return pd.DataFrame()
    return association_rules(freq, metric="confidence", min_threshold=min_conf)


def write_back(features: pd.DataFrame, segments: pd.DataFrame, rules: pd.DataFrame) -> None:
    """Persist to Cosmos DB / Supabase. Implement with azure-cosmos or supabase-py."""
    raise NotImplementedError("Wire write-back to Cosmos DB or Supabase using Key Vault creds.")


if __name__ == "__main__":
    now = dt.datetime.now(dt.timezone.utc)
    events = load_events()
    features = extract_features(events, now)
    segments = segment_users(features)
    rules = mine_rules(events)
    print(f"features={len(features)} users={features['user_id'].nunique()} "
          f"segments={len(segments)} rules={len(rules)}")
    write_back(features, segments, rules)
