from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, model_validator

MODEL_PATH = Path(os.getenv("FORECAST_MODEL_PATH", Path(__file__).parents[1] / "model.joblib"))


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: int | None = None
    product_name: str | None = None

    @model_validator(mode="after")
    def exactly_one_identifier(self) -> "ForecastRequest":
        if (self.product_id is None) == (self.product_name is None):
            raise ValueError("Provide exactly one of product_id or product_name.")
        if self.product_id is not None and self.product_id < 1:
            raise ValueError("product_id must be positive.")
        if self.product_name is not None and not self.product_name.strip():
            raise ValueError("product_name must not be blank.")
        return self


def load_artifact() -> dict[str, Any] | None:
    if not MODEL_PATH.is_file():
        return None

    artifact = joblib.load(MODEL_PATH)
    required = {"model", "features", "product_codes", "product_names", "history", "model_version", "training_weeks", "quality"}
    if not isinstance(artifact, dict) or not required.issubset(artifact):
        raise ValueError("Forecast model artifact is missing required fields.")
    if not callable(getattr(artifact["model"], "predict", None)):
        raise ValueError("Forecast model artifact does not contain a compatible predictor.")
    if list(artifact["features"]) != [
        "product_code", "month", "week_of_year", "is_wet_season", "month_sin", "month_cos",
        "lag_1", "lag_4", "lag_13", "rolling_mean_4", "rolling_mean_13",
    ]:
        raise ValueError("Forecast model artifact uses an incompatible feature contract.")
    return artifact


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        app.state.artifact = load_artifact()
        app.state.model_error = None
    except Exception:
        # Keep the process alive for diagnostics, but fail readiness without
        # exposing model or filesystem details to callers.
        app.state.artifact = None
        app.state.model_error = "The forecast model could not be loaded."
    yield


app = FastAPI(title="SmartChain AI Demand Forecasting Service", version="1.0.0", lifespan=lifespan)


@app.get("/")
def root():
    return {"service": "SmartChain Forecasting Service", "status": "running"}


@app.get("/health")
def health(request: Request, response: Response):
    loaded = request.app.state.artifact is not None
    if not loaded:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "healthy" if loaded else "model_unavailable", "model_loaded": loaded}


def resolve_product_id(artifact: dict[str, Any], payload: ForecastRequest) -> int:
    if payload.product_id is not None:
        product_id = payload.product_id
    else:
        wanted = payload.product_name.strip().casefold()
        matches = [int(key) for key, value in artifact["product_names"].items() if value.casefold() == wanted]
        if not matches:
            raise HTTPException(status_code=404, detail="Product is not available in the trained model.")
        product_id = matches[0]
    if product_id not in artifact["product_codes"]:
        raise HTTPException(status_code=404, detail="Product is not available in the trained model.")
    return product_id


def feature_row(product_code: int, week_start: pd.Timestamp, quantities: list[float]) -> dict[str, float]:
    month = week_start.month
    return {
        "product_code": product_code, "month": month,
        "week_of_year": int(week_start.isocalendar().week),
        "is_wet_season": int(6 <= month <= 11),
        "month_sin": float(np.sin(2 * np.pi * month / 12)),
        "month_cos": float(np.cos(2 * np.pi * month / 12)),
        "lag_1": quantities[-1], "lag_4": quantities[-4], "lag_13": quantities[-13],
        "rolling_mean_4": float(np.mean(quantities[-4:])),
        "rolling_mean_13": float(np.mean(quantities[-13:])),
    }


def forecast_week_starts(latest_training_week: Any, periods: int = 4) -> list[pd.Timestamp]:
    first_week = pd.Timestamp(latest_training_week).normalize() + pd.Timedelta(weeks=1)
    return [first_week + pd.Timedelta(weeks=index) for index in range(periods)]


@app.post("/forecast")
def forecast(payload: ForecastRequest, request: Request):
    artifact = request.app.state.artifact
    if artifact is None:
        raise HTTPException(status_code=503, detail="Forecast model is not available. Run train_model.py first.")
    product_id = resolve_product_id(artifact, payload)
    history = artifact["history"][product_id].sort_values("week_start")
    quantities = history["quantity"].astype(float).tolist()
    if len(quantities) < 13:
        raise HTTPException(status_code=422, detail="Insufficient weekly history for this product.")

    forecasts = []
    for week_start in forecast_week_starts(history["week_start"].max()):
        row = feature_row(artifact["product_codes"][product_id], week_start, quantities)
        frame = pd.DataFrame([row], columns=artifact["features"])
        try:
            prediction = float(artifact["model"].predict(frame)[0])
        except Exception:
            raise HTTPException(status_code=503, detail="Forecast prediction is temporarily unavailable.") from None
        if not np.isfinite(prediction):
            raise HTTPException(status_code=503, detail="Forecast prediction is temporarily unavailable.")
        expected = round(max(0.0, prediction), 3)
        forecasts.append({"week_start": week_start.date().isoformat(), "expected_quantity": expected})
        quantities.append(expected)

    return {
        "product_id": product_id, "product_name": artifact["product_names"][product_id],
        "horizon_weeks": 4, "forecast": forecasts,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "forecast_as_of": pd.Timestamp(history["week_start"].max()).date().isoformat(),
        "forecast_timezone": "UTC",
        "horizon_policy": "four_weeks_after_latest_training_week",
        "training_data_type": artifact.get("training_data_type", "synthetic_mock_demand_v1"),
        "model_version": artifact["model_version"], "training_weeks": artifact["training_weeks"],
        "model_quality": artifact["quality"],
        "decision_support_only": True,
    }
