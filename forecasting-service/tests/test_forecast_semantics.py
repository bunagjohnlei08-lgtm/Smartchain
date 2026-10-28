from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace

import joblib

from fastapi import HTTPException

from app.main import ForecastRequest, forecast, forecast_week_starts, resolve_product_id


class ForecastSemanticsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        artifact = joblib.load(Path(__file__).parents[1] / "model.joblib")
        cls.artifact = artifact
        cls.product_id = next(iter(artifact["product_codes"]))
        cls.request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(artifact=artifact)))

    def test_week_dates_cross_year_boundary_without_relabeling(self) -> None:
        self.assertEqual(
            [week.date().isoformat() for week in forecast_week_starts("2026-12-21")],
            ["2026-12-28", "2027-01-04", "2027-01-11", "2027-01-18"],
        )

    def test_identical_artifact_and_input_produce_stable_predictions(self) -> None:
        payload = ForecastRequest(product_id=self.product_id)
        first = forecast(payload, self.request)
        second = forecast(payload, self.request)
        self.assertEqual(first["forecast"], second["forecast"])
        self.assertEqual(first["model_version"], second["model_version"])
        self.assertNotEqual(first["generated_at"], "")

    def test_total_is_sum_of_the_four_raw_weekly_predictions(self) -> None:
        result = forecast(ForecastRequest(product_id=self.product_id), self.request)
        weekly = [week["expected_quantity"] for week in result["forecast"]]
        self.assertEqual(len(weekly), 4)
        self.assertAlmostEqual(sum(weekly), sum(week["expected_quantity"] for week in result["forecast"]), places=9)
        self.assertEqual(result["forecast_as_of"], "2026-10-05")
        self.assertEqual(result["training_data_type"], "synthetic_mock_demand_v1")

    def test_prediction_failure_returns_controlled_unavailable_response(self) -> None:
        class FailingModel:
            def predict(self, _frame):
                raise RuntimeError("internal model detail")

        artifact = dict(self.artifact)
        artifact["model"] = FailingModel()
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(artifact=artifact)))

        with self.assertRaises(HTTPException) as raised:
            forecast(ForecastRequest(product_id=self.product_id), request)

        self.assertEqual(raised.exception.status_code, 503)
        self.assertNotIn("internal model detail", raised.exception.detail)

    def test_catalog_name_normalization_maps_only_the_intended_model_product(self) -> None:
        artifact = {
            "product_names": {198: "MegaFlow SP404 – High performance superplasticizer"},
            "product_codes": {198: 0},
        }
        payload = ForecastRequest(product_name="MegaFlow SP404 - High performance superplasticiser")

        self.assertEqual(resolve_product_id(artifact, payload), 198)

    def test_railway_catalog_names_map_to_all_sixteen_trained_series(self) -> None:
        railway_catalog = {
            183: "Thermal Ceramics Tri-Mor Coolcast",
            184: "Thermal Ceramics Tri-Mor Extra HS Castable",
            185: "Thermal Ceramics Tri-Mor Insulite",
            186: "Thermal Ceramics Tri-Mor LC140",
            187: "MegaFlow P4 – Water reducing and set retarding admixture",
            188: "MegaFlow P – Water reducing concrete admixture",
            189: "MegaFlow P401 – Water reducing and set retarding admixture",
            190: "MegaFlow SP404 – High performance superplasticiser",
            191: "TOMAHAWK EC",
            192: "SPIK ‘N SPAN",
            193: "TOMAHAWK DELTAM EC",
            194: "QEMI DF 210FG",
            195: "QEMI DF 220FG",
            196: "QEMI DF 1000KFG",
            197: "QEMI DF 8402",
            198: "QEMI DF 8062",
        }

        for model_product_id, catalog_name in railway_catalog.items():
            with self.subTest(catalog_name=catalog_name):
                self.assertEqual(
                    resolve_product_id(self.artifact, ForecastRequest(product_name=catalog_name)),
                    model_product_id,
                )


if __name__ == "__main__":
    unittest.main()
