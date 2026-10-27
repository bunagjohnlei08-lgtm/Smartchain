<?php

namespace App\Support;

use App\Models\Product;
use App\Models\RfqLine;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class RfqCatalogImageSnapshot
{
    public static function copy(Product $product, RfqLine $line): void
    {
        if ($line->public_image_path || ! $product->image_path || ! preg_match('~^product-images/'.preg_quote((string) $product->id, '~').'/[0-9a-f-]+\.(?:jpe?g|png|webp)$~i', $product->image_path) || ! Storage::disk('local')->exists($product->image_path)) return;
        $extension = pathinfo($product->image_path, PATHINFO_EXTENSION);
        $path = "rfq-images/{$line->rfq_id}/{$line->id}/".Str::uuid().".{$extension}";
        if (Storage::disk('local')->copy($product->image_path, $path)) $line->update(['public_image_path' => $path]);
    }
}
