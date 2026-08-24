<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Receiving;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlantManagerReceivingNoteController extends Controller
{
    public function update(Request $request, Receiving $receiving): JsonResponse
    {
        if (! $request->user()?->isPlantManager()) {
            return response()->json(['message' => 'Only Plant Managers can manage Receiving Notes.'], 403);
        }

        $validated = $request->validate(['notes' => 'nullable|string|max:5000']);
        $notes = trim($validated['notes'] ?? '');
        $receiving->update(['notes' => $notes !== '' ? $notes : null]);

        return response()->json([
            'message' => 'Receiving Notes saved successfully.',
            'receiving_id' => $receiving->id,
            'notes' => $receiving->notes,
        ]);
    }
}
