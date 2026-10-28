<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AIForecastGateway;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AIForecastController extends Controller
{
    public function forecast(Request $request, AIForecastGateway $forecasts): JsonResponse
    {
        abort_unless($request->user()?->isAdmin() || $request->user()?->isPlantManager(), 403, 'Admin or Plant Manager access is required.');
        abort_unless(config('services.ai_forecast.enabled') === true, 404, 'AI forecasting is not enabled.');
        $validated = $request->validate([
            'product_id' => ['nullable', 'integer', 'min:1', 'exists:products,id', 'required_without:product_name'],
            'product_name' => ['nullable', 'string', 'max:255', 'required_without:product_id'],
        ]);
        $hasProductId = isset($validated['product_id']);
        $hasProductName = isset($validated['product_name']) && trim($validated['product_name']) !== '';
        if ($hasProductId && $hasProductName) {
            throw ValidationException::withMessages([
                'product_id' => ['Provide either product_id or product_name, not both.'],
                'product_name' => ['Provide either product_id or product_name, not both.'],
            ]);
        }
        $validated = array_filter($validated, static fn ($value) => $value !== null);

        try {
            $payload = isset($validated['product_id'])
                ? $forecasts->forecast((int) $validated['product_id'])
                : $forecasts->forecastByName((string) $validated['product_name']);
            return response()->json($payload);
        } catch (HttpException $exception) {
            $code = $exception->getStatusCode() === 503 ? 'AI_SERVICE_UNAVAILABLE'
                : ($exception->getStatusCode() === 502 ? 'AI_SERVICE_INVALID_RESPONSE' : 'FORECAST_REQUEST_REJECTED');
            return response()->json(['message' => $exception->getMessage(), 'code' => $code], $exception->getStatusCode());
        }
    }
}
