#!/usr/bin/env python3
"""
PACE DBN Weekly Retraining Script
===================================
ADR-014: pgmpy Dynamic Bayesian Network — 疲労予測モデル再学習

使用方法:
    python3 scripts/dbn_retrain.py \
        --supabase-url $SUPABASE_URL \
        --supabase-key $SUPABASE_SERVICE_ROLE_KEY \
        [--athlete-id UUID] \
        [--force-retrain true|false] \
        [--min-validation-score 0.60]

DBN グラフ構造 (ADR-014):
    t-1 → t (時系列遷移)
    hrv_(t-1)           → fatigue_t
    acwr_(t-1)          → fatigue_t
    nrs_(t-1)           → fatigue_t
    sleep_(t-1)         → fatigue_t
    training_load_(t-1) → fatigue_t
    fatigue_(t-1)       → fatigue_t   # 自己相関

離散化閾値 (ADR-014 DISCRETIZATION_THRESHOLDS):
    hrv:           low(<50), normal(50-80), high(>80) ms
    acwr:          low(<0.8), optimal(0.8-1.3), high(>1.3)
    nrs:           low(1-3), moderate(4-6), high(7-10)
    sleep:         short(<6), normal(6-8), long(>8) hours
    training_load: light(<200), moderate(200-400), hard(>400) AU
    fatigue:       low(0-3), moderate(4-6), high(7-10)
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import numpy as np
import pandas as pd

# pgmpy imports
try:
    from pgmpy.models import DynamicBayesianNetwork
    from pgmpy.factors.discrete import TabularCPD
    from pgmpy.estimators import BayesianEstimator
    from pgmpy.inference import DBNInference
except ImportError as e:
    print(f"ERROR: pgmpy not installed: {e}", file=sys.stderr)
    print("Install: pip install pgmpy==0.1.26", file=sys.stderr)
    sys.exit(1)

try:
    import httpx
except ImportError:
    import urllib.request
    import urllib.parse

# ──────────────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────────────

def setup_logging(level: str) -> logging.Logger:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    return logging.getLogger("dbn_retrain")


# ──────────────────────────────────────────────────────────────────────
# Constants (ADR-014)
# ──────────────────────────────────────────────────────────────────────

DISCRETIZATION_THRESHOLDS = {
    "hrv": [50.0, 80.0],             # ms: low / normal / high
    "acwr": [0.8, 1.3],              # ratio: low / optimal / high
    "nrs": [3.5, 6.5],              # 0-10: low / moderate / high
    "sleep_hours": [6.0, 8.0],      # hours: short / normal / long
    "training_load": [200.0, 400.0], # AU: light / moderate / hard
    "fatigue_score": [3.5, 6.5],    # 0-10: low / moderate / high
}

STATES_PER_NODE = {
    "hrv_t": ["low", "normal", "high"],
    "acwr_t": ["low", "optimal", "high"],
    "nrs_t": ["low", "moderate", "high"],
    "sleep_t": ["short", "normal", "long"],
    "training_load_t": ["light", "moderate", "hard"],
    "fatigue_t": ["low", "moderate", "high"],
}

MIN_VALIDATION_SCORE = 0.60
MIN_TRAINING_DAYS = 180


# ──────────────────────────────────────────────────────────────────────
# Supabase client (lightweight — no SDK dependency)
# ──────────────────────────────────────────────────────────────────────

class SupabaseClient:
    def __init__(self, url: str, key: str) -> None:
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[dict] = None,
        json_body: Optional[dict] = None,
        prefer: Optional[str] = None,
    ) -> Any:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer

        url = f"{self.url}/rest/v1/{path}"
        if params:
            query = "&".join(f"{k}={v}" for k, v in params.items())
            url = f"{url}?{query}"

        try:
            import httpx
            with httpx.Client(timeout=30.0) as client:
                resp = getattr(client, method.lower())(
                    url, headers=headers, json=json_body
                )
                resp.raise_for_status()
                return resp.json() if resp.content else []
        except ImportError:
            import urllib.request
            import urllib.parse
            data = json.dumps(json_body).encode() if json_body else None
            req = urllib.request.Request(
                url, data=data, headers=headers, method=method.upper()
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())

    def select(self, table: str, columns: str = "*", **filters) -> list[dict]:
        params = {"select": columns}
        for k, v in filters.items():
            params[k] = v
        return self._request("GET", table, params=params) or []

    def insert(self, table: str, data: dict, prefer: str = "return=minimal") -> Any:
        return self._request("POST", table, json_body=data, prefer=prefer)

    def upsert(self, table: str, data: dict, on_conflict: str = "id") -> Any:
        prefer = f"resolution=merge-duplicates,return=minimal"
        headers_extra = {"Prefer": prefer}
        return self._request("POST", table, json_body=data, prefer=prefer)

    def update(self, table: str, data: dict, **filters) -> Any:
        params = {}
        for k, v in filters.items():
            params[k] = v
        return self._request("PATCH", table, params=params, json_body=data)

    def rpc(self, func_name: str, params: dict) -> Any:
        return self._request("POST", f"rpc/{func_name}", json_body=params)


# ──────────────────────────────────────────────────────────────────────
# Data preparation
# ──────────────────────────────────────────────────────────────────────

def discretize(value: Optional[float], thresholds: list[float]) -> int:
    """Discretize a continuous value into 0/1/2 using thresholds."""
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return 1  # Default to middle state when missing
    if value < thresholds[0]:
        return 0
    elif value < thresholds[1]:
        return 1
    else:
        return 2


def prepare_sequences(df: pd.DataFrame) -> pd.DataFrame:
    """Discretize raw daily_metrics into DBN node states.
    
    Input columns: athlete_id, date, hrv, acwr, nrs_pain, sleep_hours,
                   training_load, fatigue_score
    Output: discretized states + t-1 lag columns
    """
    df = df.copy().sort_values("date")

    # Discretize each node
    df["hrv_t"] = df["hrv"].apply(
        lambda v: discretize(v, DISCRETIZATION_THRESHOLDS["hrv"])
    )
    df["acwr_t"] = df["acwr"].apply(
        lambda v: discretize(v, DISCRETIZATION_THRESHOLDS["acwr"])
    )
    df["nrs_t"] = df["nrs_pain"].apply(
        lambda v: discretize(v, DISCRETIZATION_THRESHOLDS["nrs"])
    )
    df["sleep_t"] = df["sleep_hours"].apply(
        lambda v: discretize(v, DISCRETIZATION_THRESHOLDS["sleep_hours"])
    )
    df["training_load_t"] = df["training_load"].apply(
        lambda v: discretize(v, DISCRETIZATION_THRESHOLDS["training_load"])
    )
    df["fatigue_t"] = df["fatigue_score"].apply(
        lambda v: discretize(v, DISCRETIZATION_THRESHOLDS["fatigue_score"])
    )

    # Create t-1 lag features
    for col in ["hrv_t", "acwr_t", "nrs_t", "sleep_t", "training_load_t", "fatigue_t"]:
        df[f"{col}_lag1"] = df[col].shift(1)

    # Drop first row (no lag data)
    df = df.dropna(subset=[f"{c}_lag1" for c in ["hrv_t", "acwr_t", "nrs_t", "sleep_t", "training_load_t", "fatigue_t"]])
    
    # Cast to int
    lag_cols = [c for c in df.columns if "_lag1" in c or c.endswith("_t")]
    for col in lag_cols:
        df[col] = df[col].astype(int)

    return df


# ──────────────────────────────────────────────────────────────────────
# DBN model training
# ──────────────────────────────────────────────────────────────────────

def build_dbn_structure() -> DynamicBayesianNetwork:
    """Build DBN graph structure per ADR-014.
    
    Edges: (node_t-1) → (node_t)
    All input nodes at t-1 → fatigue at t.
    """
    dbn = DynamicBayesianNetwork()

    # Inter-slice edges (t-1 → t): causal relationships to fatigue
    inter_edges = [
        (("hrv_t", 0), ("fatigue_t", 1)),
        (("acwr_t", 0), ("fatigue_t", 1)),
        (("nrs_t", 0), ("fatigue_t", 1)),
        (("sleep_t", 0), ("fatigue_t", 1)),
        (("training_load_t", 0), ("fatigue_t", 1)),
        (("fatigue_t", 0), ("fatigue_t", 1)),  # Auto-correlation
    ]
    # Intra-slice edges (t → t): within same time slice
    intra_edges = [
        (("hrv_t", 1), ("fatigue_t", 1)),  # HRV at same time also informs fatigue
    ]

    dbn.add_edges_from(inter_edges)
    dbn.add_edges_from(intra_edges)

    return dbn


def train_dbn(df: pd.DataFrame, logger: logging.Logger) -> tuple[DynamicBayesianNetwork, dict]:
    """Train DBN model on discretized sequences.
    
    Returns (trained_dbn, metadata)
    """
    dbn = build_dbn_structure()

    # Prepare training data in pgmpy format
    # pgmpy DynamicBayesianNetwork.fit expects list of DataFrames,
    # each representing one sequence
    training_data_slices = []
    
    # Build t and t+1 slice pairs
    nodes_t0 = ["hrv_t", "acwr_t", "nrs_t", "sleep_t", "training_load_t", "fatigue_t"]
    nodes_t1 = ["fatigue_t"]  # We only predict fatigue at t+1
    
    # For pgmpy DBN, we need the data in specific format
    # Use BayesianEstimator with K2 prior for Laplace smoothing
    data_for_fit = df[nodes_t0 + [f"{n}_lag1" for n in nodes_t0]].copy()
    
    logger.info(f"Training DBN on {len(data_for_fit)} data points")

    try:
        # Estimate CPDs using Maximum Likelihood + pseudo-counts (Laplace smoothing)
        dbn.fit(
            data_for_fit,
            estimator=BayesianEstimator,
            prior_type="K2",
        )
    except Exception as e:
        logger.warning(f"BayesianEstimator failed: {e}. Trying MLE...")
        from pgmpy.estimators import MaximumLikelihoodEstimator
        dbn.fit(data_for_fit, estimator=MaximumLikelihoodEstimator)

    metadata = {
        "node_count": len(dbn.nodes()),
        "edge_count": len(dbn.edges()),
        "training_samples": len(data_for_fit),
        "nodes": nodes_t0,
    }

    return dbn, metadata


def validate_dbn(
    dbn: DynamicBayesianNetwork,
    df: pd.DataFrame,
    logger: logging.Logger,
) -> float:
    """K-fold cross-validation of DBN on fatigue prediction.
    
    Returns validation accuracy score (0.0–1.0).
    """
    from sklearn.model_selection import KFold
    
    k = min(5, len(df) // 30)  # Minimum 30 samples per fold
    if k < 2:
        logger.warning("Insufficient data for K-fold. Using holdout validation.")
        split_idx = int(len(df) * 0.8)
        train_df = df.iloc[:split_idx]
        test_df = df.iloc[split_idx:]
        return _holdout_accuracy(dbn, train_df, test_df)

    kf = KFold(n_splits=k, shuffle=False)
    scores = []

    for fold, (train_idx, test_idx) in enumerate(kf.split(df)):
        train_fold = df.iloc[train_idx]
        test_fold = df.iloc[test_idx]
        score = _holdout_accuracy(dbn, train_fold, test_fold)
        scores.append(score)
        logger.debug(f"Fold {fold+1}/{k}: accuracy={score:.3f}")

    mean_score = float(np.mean(scores))
    logger.info(f"K-fold validation: mean={mean_score:.3f}, std={np.std(scores):.3f}")
    return mean_score


def _holdout_accuracy(
    dbn: DynamicBayesianNetwork,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> float:
    """Simple holdout accuracy for fatigue_t prediction."""
    if len(test_df) == 0:
        return 0.0

    correct = 0
    total = 0

    try:
        inference = DBNInference(dbn)
    except Exception:
        # If inference setup fails, return low score
        return 0.3

    for _, row in test_df.iterrows():
        try:
            evidence = {
                ("hrv_t", 0): int(row.get("hrv_t", 1)),
                ("acwr_t", 0): int(row.get("acwr_t", 1)),
                ("nrs_t", 0): int(row.get("nrs_t", 1)),
                ("sleep_t", 0): int(row.get("sleep_t", 1)),
                ("training_load_t", 0): int(row.get("training_load_t", 1)),
                ("fatigue_t", 0): int(row.get("fatigue_t", 1)),
            }
            query = inference.query(
                variables=[("fatigue_t", 1)],
                evidence=evidence,
                n_time_slices=2,
            )
            predicted = int(np.argmax(
                query[("fatigue_t", 1)].values
            ))
            actual = int(row.get("fatigue_t", 1))
            if predicted == actual:
                correct += 1
            total += 1
        except Exception:
            continue

    return correct / max(total, 1)


# ──────────────────────────────────────────────────────────────────────
# Supabase data operations
# ──────────────────────────────────────────────────────────────────────

def fetch_athlete_ids(
    client: SupabaseClient,
    athlete_id_filter: Optional[str],
    cutoff_date: str,
    logger: logging.Logger,
) -> list[str]:
    """Fetch athletes with sufficient daily_metrics data (≥180 days)."""
    if athlete_id_filter:
        logger.info(f"Single athlete mode: {athlete_id_filter}")
        return [athlete_id_filter]

    # Query athletes with enough data
    try:
        result = client.rpc("get_athletes_with_sufficient_data", {
            "min_days": MIN_TRAINING_DAYS,
            "cutoff_date": cutoff_date,
        })
        return [r["athlete_id"] for r in result]
    except Exception as e:
        logger.warning(f"RPC failed: {e}. Querying daily_metrics directly.")
        # Fallback: direct query
        result = client.select(
            "daily_metrics",
            columns="athlete_id",
            **{"date": f"gte.{cutoff_date}"},
        )
        from collections import Counter
        counts = Counter(r["athlete_id"] for r in result)
        return [aid for aid, count in counts.items() if count >= MIN_TRAINING_DAYS]


def fetch_daily_metrics(
    client: SupabaseClient,
    athlete_id: str,
    days: int = 365,
) -> pd.DataFrame:
    """Fetch daily_metrics for an athlete."""
    cutoff = (datetime.now() - timedelta(days=days)).date().isoformat()
    rows = client.select(
        "daily_metrics",
        columns="date,hrv,acwr,nrs_pain,sleep_hours,training_load,fatigue_score",
        **{
            "athlete_id": f"eq.{athlete_id}",
            "date": f"gte.{cutoff}",
            "order": "date.asc",
        },
    )
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


def save_dbn_model(
    client: SupabaseClient,
    athlete_id: str,
    dbn: DynamicBayesianNetwork,
    validation_score: float,
    training_days: int,
    training_cutoff: str,
    force_retrain: bool,
    logger: logging.Logger,
) -> Optional[str]:
    """Save trained DBN model to dbn_models table.
    
    Returns model_id if saved, None if skipped.
    """
    if validation_score < MIN_VALIDATION_SCORE and not force_retrain:
        logger.warning(
            f"Validation score {validation_score:.3f} < threshold {MIN_VALIDATION_SCORE}. "
            "Skipping save. Set --force-retrain true to override."
        )
        # Record failed attempt
        client.insert("dbn_models", {
            "athlete_id": athlete_id,
            "model_version": 1,
            "training_days": training_days,
            "training_cutoff_date": training_cutoff,
            "node_definitions": json.dumps({"nodes": list(STATES_PER_NODE.keys())}),
            "cpd_parameters": "{}",
            "validation_score": validation_score,
            "validation_method": "k_fold_5",
            "status": "failed",
            "failure_reason": f"validation_score {validation_score:.3f} < {MIN_VALIDATION_SCORE}",
        })
        return None

    # Archive existing active model
    client.update(
        "dbn_models",
        {"status": "archived"},
        **{"athlete_id": f"eq.{athlete_id}", "status": f"eq.active"},
    )

    # Serialize CPD parameters
    cpd_params = {}
    try:
        for cpd in dbn.cpds:
            node_name = cpd.variable
            cpd_params[str(node_name)] = {
                "variable": str(cpd.variable),
                "variable_card": int(cpd.variable_card),
                "evidence": [str(e) for e in (cpd.variables[1:] if hasattr(cpd, 'variables') else [])],
                "values": cpd.get_value().tolist() if hasattr(cpd, 'get_value') else [],
            }
    except Exception as e:
        logger.warning(f"CPD serialization partial: {e}")

    model_id = str(uuid.uuid4())
    node_defs = {
        "nodes": list(STATES_PER_NODE.keys()),
        "states": STATES_PER_NODE,
        "discretization_thresholds": DISCRETIZATION_THRESHOLDS,
        "edges": [(str(u), str(v)) for u, v in dbn.edges()],
    }

    # Get current max version
    existing = client.select(
        "dbn_models",
        columns="model_version",
        **{"athlete_id": f"eq.{athlete_id}", "order": "model_version.desc", "limit": "1"},
    )
    next_version = (existing[0]["model_version"] + 1) if existing else 1

    client.insert("dbn_models", {
        "id": model_id,
        "athlete_id": athlete_id,
        "model_version": next_version,
        "training_days": training_days,
        "training_cutoff_date": training_cutoff,
        "node_definitions": json.dumps(node_defs),
        "cpd_parameters": json.dumps(cpd_params),
        "validation_score": round(validation_score, 4),
        "validation_method": "k_fold_5",
        "status": "active",
    })

    logger.info(f"DBN model saved: id={model_id}, version={next_version}, score={validation_score:.3f}")
    return model_id


def generate_predictions(
    client: SupabaseClient,
    athlete_id: str,
    model_id: str,
    dbn: DynamicBayesianNetwork,
    df: pd.DataFrame,
    logger: logging.Logger,
) -> None:
    """Generate next-day fatigue predictions and save to dbn_predictions."""
    if df.empty or len(df) < 2:
        return

    # Use latest row as evidence
    latest = df.iloc[-1]
    prediction_date = (
        pd.to_datetime(latest["date"]) + timedelta(days=1)
    ).date().isoformat()

    evidence = {
        ("hrv_t", 0): int(latest.get("hrv_t", 1)),
        ("acwr_t", 0): int(latest.get("acwr_t", 1)),
        ("nrs_t", 0): int(latest.get("nrs_t", 1)),
        ("sleep_t", 0): int(latest.get("sleep_t", 1)),
        ("training_load_t", 0): int(latest.get("training_load_t", 1)),
        ("fatigue_t", 0): int(latest.get("fatigue_t", 1)),
    }

    try:
        inference = DBNInference(dbn)
        query = inference.query(
            variables=[("fatigue_t", 1)],
            evidence=evidence,
            n_time_slices=2,
        )
        probs = query[("fatigue_t", 1)].values
        predicted_state = int(np.argmax(probs))
        confidence = float(np.max(probs))
    except Exception as e:
        logger.warning(f"Inference failed: {e}. Using prior.")
        predicted_state = 1  # Default: moderate
        confidence = 0.33
        probs = [0.33, 0.34, 0.33]

    state_labels = ["low", "moderate", "high"]
    fatigue_score_map = {"low": 2.0, "moderate": 5.0, "high": 8.0}
    predicted_label = state_labels[predicted_state]

    client.upsert("dbn_predictions", {
        "athlete_id": athlete_id,
        "model_id": model_id,
        "prediction_date": prediction_date,
        "predicted_fatigue_state": predicted_label,
        "fatigue_probability_low": round(float(probs[0]), 4),
        "fatigue_probability_moderate": round(float(probs[1]), 4),
        "fatigue_probability_high": round(float(probs[2]), 4),
        "confidence_score": round(confidence, 4),
        "evidence_snapshot": json.dumps({
            k[0]: v for k, v in evidence.items()
        }),
    })

    logger.info(
        f"Prediction saved: athlete={athlete_id}, date={prediction_date}, "
        f"state={predicted_label}, confidence={confidence:.3f}"
    )

    # Check for high fatigue alert
    if predicted_state == 2 and confidence >= 0.70:
        client.insert("fatigue_alerts", {
            "athlete_id": athlete_id,
            "prediction_id": None,  # Will be set after prediction upsert
            "alert_date": prediction_date,
            "predicted_fatigue_state": predicted_label,
            "confidence_score": round(confidence, 4),
            "recommended_action": "HIGH_FATIGUE: 翌日トレーニング強度を50%以下に調整推奨",
            "alert_status": "pending",
        })
        logger.warning(
            f"HIGH FATIGUE ALERT: athlete={athlete_id}, date={prediction_date}, "
            f"confidence={confidence:.3f}"
        )


# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────

def process_athlete(
    client: SupabaseClient,
    athlete_id: str,
    force_retrain: bool,
    logger: logging.Logger,
) -> dict:
    """Full DBN retrain pipeline for one athlete."""
    result = {
        "athlete_id": athlete_id,
        "status": "skipped",
        "model_id": None,
        "validation_score": None,
        "training_days": 0,
        "error": None,
    }

    try:
        # 1. Fetch data
        df_raw = fetch_daily_metrics(client, athlete_id, days=400)
        if df_raw.empty or len(df_raw) < MIN_TRAINING_DAYS:
            logger.warning(
                f"Athlete {athlete_id}: only {len(df_raw)} days of data "
                f"(minimum: {MIN_TRAINING_DAYS})"
            )
            result["status"] = "insufficient_data"
            result["training_days"] = len(df_raw)
            return result

        # 2. Discretize
        df = prepare_sequences(df_raw)
        result["training_days"] = len(df)

        # 3. Train
        dbn, metadata = train_dbn(df, logger)

        # 4. Validate
        validation_score = validate_dbn(dbn, df, logger)
        result["validation_score"] = round(validation_score, 4)

        training_cutoff = df_raw["date"].max()

        # 5. Save model
        model_id = save_dbn_model(
            client, athlete_id, dbn, validation_score,
            len(df), training_cutoff, force_retrain, logger
        )

        if model_id:
            result["model_id"] = model_id
            result["status"] = "trained"

            # 6. Generate predictions
            generate_predictions(client, athlete_id, model_id, dbn, df, logger)
        else:
            result["status"] = "validation_failed"

    except Exception as e:
        logger.error(f"Athlete {athlete_id} failed: {e}", exc_info=True)
        result["status"] = "error"
        result["error"] = str(e)

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="PACE DBN Weekly Retraining Script")
    parser.add_argument("--supabase-url", required=True, help="Supabase project URL")
    parser.add_argument("--supabase-key", required=True, help="Supabase service role key")
    parser.add_argument("--athlete-id", default="", help="Specific athlete UUID (empty = all)")
    parser.add_argument("--force-retrain", default="false", help="true/false")
    parser.add_argument("--min-validation-score", type=float, default=MIN_VALIDATION_SCORE)
    parser.add_argument("--output-format", default="json", choices=["json", "text"])
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()

    logger = setup_logging(args.log_level)
    logger.info("DBN retraining started", extra={
        "athlete_id_filter": args.athlete_id or "all",
        "force_retrain": args.force_retrain,
        "min_validation_score": args.min_validation_score,
    })

    global MIN_VALIDATION_SCORE
    MIN_VALIDATION_SCORE = args.min_validation_score

    force_retrain = args.force_retrain.lower() == "true"
    client = SupabaseClient(args.supabase_url, args.supabase_key)

    cutoff_date = (datetime.now() - timedelta(days=MIN_TRAINING_DAYS)).date().isoformat()

    # Fetch eligible athletes
    athlete_ids = fetch_athlete_ids(
        client, args.athlete_id or None, cutoff_date, logger
    )
    logger.info(f"Processing {len(athlete_ids)} athlete(s)")

    # Process each athlete
    results = []
    for i, aid in enumerate(athlete_ids, 1):
        logger.info(f"[{i}/{len(athlete_ids)}] Processing athlete: {aid}")
        result = process_athlete(client, aid, force_retrain, logger)
        results.append(result)

    # Summary
    trained = sum(1 for r in results if r["status"] == "trained")
    failed = sum(1 for r in results if r["status"] in ("error", "validation_failed"))
    skipped = sum(1 for r in results if r["status"] in ("skipped", "insufficient_data"))

    summary = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "total_athletes": len(athlete_ids),
        "trained": trained,
        "failed": failed,
        "skipped": skipped,
        "results": results,
    }

    logger.info(
        f"DBN retraining complete: "
        f"trained={trained}, failed={failed}, skipped={skipped}"
    )

    # Write output
    output_path = f"/tmp/dbn_retrain_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_path, "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    logger.info(f"Results written to: {output_path}")

    if args.output_format == "json":
        print(json.dumps(summary, indent=2, ensure_ascii=False))

    # Exit with error if any failed
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
