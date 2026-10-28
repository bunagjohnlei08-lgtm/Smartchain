<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class AIForecastGateway
{
    /** @return array<string, mixed> */
    public function forecast(int $productId): array
    {
        $product = Product::query()->find($productId, ['id', 'name']);
        if ($product === null) {
            throw new HttpException(404, 'Product was not found.');
        }

        return $this->request(['product_name' => $product->name], $productId, $product->name);
    }

    /** @return array<string, mixed> */
    public function forecastByName(string $productName): array
    {
        return $this->request(['product_name' => $productName]);
    }

    /** @param array<string, int|string> $identifier @return array<string, mixed> */
    private function request(array $identifier, ?int $catalogProductId = null, ?string $catalogProductName = null): array
    {
        if (config('services.ai_forecast.enabled') !== true) {
            throw new HttpException(503, 'AI forecasting is not enabled.');
        }

        try {
            $response = Http::acceptJson()->asJson()
                ->connectTimeout((int) config('services.ai_forecast.connect_timeout', 2))
                ->timeout((int) config('services.ai_forecast.timeout', 10))
                ->post(rtrim((string) config('services.ai_forecast.url'), '/').'/forecast', $identifier);
        } catch (ConnectionException) {
            throw new HttpException(503, 'AI forecasting service is unavailable. Please try again later.');
        }

        if ($response->serverError()) {
            throw new HttpException(503, 'AI forecasting service is unavailable. Please try again later.');
        }
        if ($response->clientError()) {
            throw new HttpException($response->status(), (string) $response->json('detail', 'The forecast request could not be processed.'));
        }

        $payload = $response->json();
        if (! is_array($payload)
            || (int) ($payload['product_id'] ?? 0) < 1
            || ! is_string($payload['product_name'] ?? null)
            || ($catalogProductName !== null && $this->normalizeProductName($payload['product_name']) !== $this->normalizeProductName($catalogProductName))
            || ! is_array($payload['forecast'] ?? null)
            || ! is_int($payload['horizon_weeks'] ?? null)
            || $payload['horizon_weeks'] < 1
            || count($payload['forecast']) !== $payload['horizon_weeks']
            || ($payload['decision_support_only'] ?? null) !== true) {
            throw new HttpException(502, 'AI forecasting service returned an invalid response.');
        }

        foreach ($payload['forecast'] as $week) {
            $quantity = is_array($week) && isset($week['expected_quantity']) && is_numeric($week['expected_quantity'])
                ? (float) $week['expected_quantity']
                : NAN;
            if (! is_array($week)
                || ! isset($week['week_start'])
                || ! is_string($week['week_start'])
                || preg_match('/^\d{4}-\d{2}-\d{2}$/D', $week['week_start']) !== 1
                || ! is_finite($quantity)
                || $quantity < 0) {
                throw new HttpException(502, 'AI forecasting service returned an invalid response.');
            }
        }

        if ($catalogProductId !== null && $catalogProductName !== null) {
            $payload['model_product_id'] = (int) $payload['product_id'];
            $payload['product_id'] = $catalogProductId;
            $payload['product_name'] = $catalogProductName;
        }

        return $payload;
    }

    private function normalizeProductName(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = str_replace(['‐', '‑', '‒', '–', '—', '―', '−'], '-', $value);
        $value = str_replace(['‘', '’', '´', '`'], "'", $value);
        $value = str_replace('superplasticiser', 'superplasticizer', $value);

        return preg_replace('/\s+/u', ' ', $value) ?? $value;
    }
}
