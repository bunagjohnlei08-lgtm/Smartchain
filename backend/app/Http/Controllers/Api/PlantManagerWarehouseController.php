<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlantManagerWarehouseController extends Controller
{
    private const MAP_EMBED_URL = 'https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d14717.63615355505!2d121.0884979!3d14.6352911!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397b9485ea55b87%3A0x2e093784a1e3763b!2sArchon%20Nell%20Incorporated!5e1!3m2!1sen!2sph!4v1787998954055!5m2!1sen!2sph';

    public function show(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $warehouse = Warehouse::query()->where('code', 'WH-MAIN')->first();
        if (! $warehouse) {
            return response()->json(['message' => 'Warehouse details are not configured yet.'], 404);
        }

        $inventory = $warehouse->inventories()
            ->selectRaw('COALESCE(SUM(available_stock), 0) AS available')
            ->selectRaw('COALESCE(SUM(reserved_stock), 0) AS reserved')
            ->selectRaw('COALESCE(SUM(backload), 0) AS backload')
            ->first();

        $availableStock = (int) $inventory->available;
        $reservedStock = (int) $inventory->reserved;
        $backload = (int) $inventory->backload;
        $utilized = $availableStock + $reservedStock;
        $capacity = $warehouse->capacity;

        return response()->json([
            'id' => $warehouse->id,
            'name' => $warehouse->name,
            'code' => $warehouse->code,
            'address' => $warehouse->address,
            'latitude' => $warehouse->latitude === null ? null : (float) $warehouse->latitude,
            'longitude' => $warehouse->longitude === null ? null : (float) $warehouse->longitude,
            'capacity' => $capacity,
            'utilized' => $utilized,
            'available' => $capacity === null ? null : max(0, $capacity - $utilized),
            'utilization_percentage' => $capacity && $capacity > 0
                ? round(min(100, $utilized / $capacity * 100), 1)
                : null,
            'status' => $warehouse->status,
            'map_embed_url' => self::MAP_EMBED_URL,
            'inventory' => [
                'total_units' => $utilized,
                'available_stock' => $availableStock,
                'reserved_stock' => $reservedStock,
                'backload' => $backload,
            ],
        ]);
    }
}
