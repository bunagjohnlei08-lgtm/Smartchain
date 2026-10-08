<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use App\Support\WarehouseCapacity;
use App\Support\WarehouseMap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlantManagerWarehouseController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user?->isPlantManager(), 403, 'Plant Manager access is required.');

        if (! $user->warehouse_id) {
            return response()->json(['message' => 'No warehouse is assigned to your account.'], 404);
        }

        $warehouse = Warehouse::query()->find($user->warehouse_id);
        if (! $warehouse) {
            return response()->json(['message' => 'Your assigned warehouse could not be found.'], 404);
        }

        $inventory = $warehouse->inventories()
            ->selectRaw('COALESCE(SUM(available_stock), 0) AS available')
            ->selectRaw('COALESCE(SUM(reserved_stock), 0) AS reserved')
            ->selectRaw('COALESCE(SUM(backload), 0) AS backload')
            ->first();

        $availableStock = (int) $inventory->available;
        $reservedStock = (int) $inventory->reserved;
        $backload = (int) $inventory->backload;
        $capacity = WarehouseCapacity::snapshot($warehouse);

        return response()->json([
            'id' => $warehouse->id,
            'name' => $warehouse->name,
            'code' => $warehouse->code,
            'address' => $warehouse->address,
            'latitude' => $warehouse->latitude === null ? null : (float) $warehouse->latitude,
            'longitude' => $warehouse->longitude === null ? null : (float) $warehouse->longitude,
            ...$capacity,
            'status' => $warehouse->status,
            'map_embed_url' => WarehouseMap::embedUrl($warehouse),
            'directions_url' => WarehouseMap::directionsUrl($warehouse),
            'inventory' => [
                'total_units' => $capacity['utilized'],
                'available_stock' => $availableStock,
                'reserved_stock' => $reservedStock,
                'backload' => $backload,
            ],
        ]);
    }
}
