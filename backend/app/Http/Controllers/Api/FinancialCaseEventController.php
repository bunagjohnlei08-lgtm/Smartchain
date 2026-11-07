<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Financial\FinancialCaseEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FinancialCaseEventController extends Controller
{
    public function preview(Request $request, string $type, int $id, FinancialCaseEventService $service): JsonResponse
    {
        return response()->json(['data' => $service->preview($type, $id, $request->user())])
            ->header('Cache-Control', 'private, no-store');
    }
}
