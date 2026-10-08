<?php

namespace App\Support;

use App\Models\Warehouse;

/**
 * Builds the Google Maps embed and directions links for a warehouse from its stored
 * coordinates, so every screen (Admin, Plant Manager, public site) shows one location.
 * The Main Warehouse is pinned to its Google Maps place so Google can render the
 * business card (name, rating, reviews) instead of an anonymous dropped pin.
 */
class WarehouseMap
{
    public static function embedUrl(Warehouse $warehouse): ?string
    {
        $coordinates = self::coordinates($warehouse);
        if ($coordinates === null) {
            return null;
        }

        $place = config('services.google_maps.main_warehouse_place');
        if (self::isMainWarehousePlace($warehouse, $place) && ! empty($place['feature_id']) && ! empty($place['name'])) {
            [$latitude, $longitude] = $coordinates;

            return 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3679.48874398943'
                ."!2d{$longitude}!3d{$latitude}"
                .'!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2'
                .'!1s'.rawurlencode($place['feature_id'])
                .'!2s'.rawurlencode($place['name'])
                .'!5e1!3m2!1sen!2sph!4v1791469640495!5m2!1sen!2sph';
        }

        return 'https://www.google.com/maps?q='.rawurlencode(implode(',', $coordinates)).'&z=15&output=embed';
    }

    public static function directionsUrl(Warehouse $warehouse): ?string
    {
        $coordinates = self::coordinates($warehouse);

        return $coordinates === null
            ? null
            : 'https://www.google.com/maps/dir/?api=1&destination='.rawurlencode(implode(',', $coordinates));
    }

    private static function isMainWarehousePlace(Warehouse $warehouse, mixed $place): bool
    {
        $code = strtoupper(trim((string) $warehouse->code));
        $codes = array_map(fn ($value) => strtoupper(trim((string) $value)), (array) ($place['warehouse_codes'] ?? []));

        return $code !== '' && in_array($code, $codes, true);
    }

    /** @return array{0: string, 1: string}|null */
    private static function coordinates(Warehouse $warehouse): ?array
    {
        if ($warehouse->latitude === null || $warehouse->longitude === null) {
            return null;
        }

        return [(string) (float) $warehouse->latitude, (string) (float) $warehouse->longitude];
    }
}
