<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use App\Support\WarehouseMap;
use Illuminate\Http\JsonResponse;

class PublicCompanyLocationController extends Controller
{
    public function show(): JsonResponse
    {
        $warehouse = Warehouse::query()
            ->where('show_on_public_website', true)
            ->where('status', 'Active')
            ->whereNotNull('address')
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->orderBy('id')
            ->first(['code', 'name', 'address', 'latitude', 'longitude']);

        return response()->json([
            'data' => $warehouse ? [
                'name' => (string) $warehouse->name,
                'address' => (string) $warehouse->address,
                'latitude' => (float) $warehouse->latitude,
                'longitude' => (float) $warehouse->longitude,
                'map_embed_url' => WarehouseMap::embedUrl($warehouse),
                'directions_url' => WarehouseMap::directionsUrl($warehouse),
            ] : null,
        ]);
    }
}
