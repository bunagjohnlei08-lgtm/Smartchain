"""Train the SmartChain decision-support demand model from CSV or PostgreSQL."""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error

FEATURES = ["product_code", "month", "week_of_year", "is_wet_season", "month_sin", "month_cos", "lag_1", "lag_4", "lag_13", "rolling_mean_4", "rolling_mean_13"]


def load_history(csv_path: str | None, database_url: str | None) -> pd.DataFrame:
    if csv_path:
        return pd.read_csv(csv_path)
    if not database_url:
        raise ValueError("Provide --csv or --database-url (or set DATABASE_URL).")
    from sqlalchemy import create_engine, text
    query = text("""
        SELECT oi.product_id, p.name AS product_name, o.order_date, oi.quantity
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE o.status <> 'CANCELLED' AND oi.quantity > 0
          AND NULLIF(BTRIM(oi.unit), '') IS NOT NULL
          AND UPPER(BTRIM(oi.unit)) = UPPER(BTRIM(p.unit))
          AND o.reference_no LIKE 'MOCK-DEMAND-V1-%'
        ORDER BY o.order_date, oi.product_id
    """)
    with create_engine(database_url).connect() as connection:
        return pd.read_sql(query, connection)


def weekly_history(raw: pd.DataFrame) -> pd.DataFrame:
    required = {"product_id", "product_name", "order_date", "quantity"}
    missing = required.difference(raw.columns)
    if missing:
        raise ValueError(f"History is missing columns: {', '.join(sorted(missing))}")
    frame = raw.copy()
    frame["order_date"] = pd.to_datetime(frame["order_date"], utc=True, errors="raise")
    frame["quantity"] = pd.to_numeric(frame["quantity"], errors="raise")
    frame = frame[(frame["quantity"] > 0) & frame["product_id"].notna()]
    if frame.empty:
        raise ValueError("No valid positive demand observations were found.")
    frame["week_start"] = frame["order_date"].dt.tz_convert(None).dt.to_period("W-SUN").dt.start_time
    names = frame.groupby("product_id")["product_name"].last()
    totals = frame.groupby(["product_id", "week_start"], as_index=False)["quantity"].sum()
    grid = pd.MultiIndex.from_product([sorted(totals["product_id"].unique()), pd.date_range(totals["week_start"].min(), totals["week_start"].max(), freq="W-MON")], names=["product_id", "week_start"]).to_frame(index=False)
    weekly = grid.merge(totals, how="left", on=["product_id", "week_start"])
    weekly["quantity"] = weekly["quantity"].fillna(0.0)
    weekly["product_name"] = weekly["product_id"].map(names)
    return weekly.sort_values(["product_id", "week_start"]).reset_index(drop=True)


def add_features(weekly: pd.DataFrame, product_codes: dict[int, int]) -> pd.DataFrame:
    data = weekly.copy()
    data["product_code"] = data["product_id"].map(product_codes)
    data["month"] = data["week_start"].dt.month
    data["week_of_year"] = data["week_start"].dt.isocalendar().week.astype(int)
    data["is_wet_season"] = data["month"].between(6, 11).astype(int)
    data["month_sin"] = np.sin(2 * np.pi * data["month"] / 12)
    data["month_cos"] = np.cos(2 * np.pi * data["month"] / 12)
    grouped = data.groupby("product_id")["quantity"]
    for lag in (1, 4, 13):
        data[f"lag_{lag}"] = grouped.shift(lag)
    for window in (4, 13):
        data[f"rolling_mean_{window}"] = grouped.transform(lambda values: values.shift(1).rolling(window, min_periods=1).mean())
    return data.dropna(subset=["lag_13"]).reset_index(drop=True)


def train(raw: pd.DataFrame, output: Path, training_data_type: str = "unspecified") -> dict:
    weekly = weekly_history(raw)
    product_ids = [int(value) for value in sorted(weekly["product_id"].unique())]
    product_codes = {product_id: index for index, product_id in enumerate(product_ids)}
    training = add_features(weekly, product_codes)
    if training.empty:
        raise ValueError("At least 14 complete weekly periods per product are required.")
    cutoff = training["week_start"].max() - pd.Timedelta(weeks=7)
    fit_rows = training[training["week_start"] < cutoff]
    validation_rows = training[training["week_start"] >= cutoff]
    if fit_rows.empty or validation_rows.empty:
        raise ValueError("At least 22 complete weekly periods are required for time-aware validation.")
    validation_model = RandomForestRegressor(n_estimators=400, min_samples_leaf=2, random_state=42, n_jobs=-1)
    validation_model.fit(fit_rows[FEATURES], fit_rows["quantity"])
    validation_mae = mean_absolute_error(validation_rows["quantity"], validation_model.predict(validation_rows[FEATURES]))

    model = RandomForestRegressor(n_estimators=400, min_samples_leaf=2, random_state=42, n_jobs=-1)
    model.fit(training[FEATURES], training["quantity"])
    artifact = {
        "model": model,
        "features": FEATURES,
        "product_codes": product_codes,
        "product_names": {int(row.product_id): str(row.product_name) for row in weekly[["product_id", "product_name"]].drop_duplicates("product_id").itertuples()},
        "history": {int(product_id): group[["week_start", "quantity"]].copy() for product_id, group in weekly.groupby("product_id")},
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_data_type": training_data_type,
        "model_version": "random-forest-v1",
        "training_weeks": int(weekly["week_start"].nunique()),
        "quality": {"validation_method": "last-8-weeks holdout", "mae": round(float(validation_mae), 3)},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, output)
    return artifact


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="CSV columns: product_id, product_name, order_date, quantity")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("model.joblib"))
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    source_type = "provided_csv" if args.csv else "synthetic_mock_demand_v1"
    saved = train(load_history(args.csv, args.database_url), args.output, source_type)
    print(f"Saved {saved['model_version']} for {len(saved['product_codes'])} products to {args.output}")
