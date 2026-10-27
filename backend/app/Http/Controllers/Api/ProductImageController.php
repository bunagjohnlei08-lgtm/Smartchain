<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProductImageController extends Controller
{
    public function store(Request $request, Product $product): array
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:jpeg,jpg,png,webp', 'mimetypes:image/jpeg,image/png,image/webp', 'max:'.config('procurement.rfq_image_max_kb', 5120)],
        ]);
        $file = $validated['image'];
        $extension = strtolower($file->guessExtension() ?: $file->extension());
        abort_unless(in_array($extension, ['jpeg', 'jpg', 'png', 'webp'], true), 422, 'Unsupported image format.');
        $newPath = "product-images/{$product->id}/".Str::uuid().".{$extension}";
        Storage::disk('local')->putFileAs("product-images/{$product->id}", $file, basename($newPath));
        $oldPath = $product->image_path;
        $product->update(['image_path' => $newPath]);
        if ($oldPath && $oldPath !== $newPath && $this->safePath($product, $oldPath)) Storage::disk('local')->delete($oldPath);
        AuditLogger::success('PRODUCT_IMAGE_UPDATED', AuditLogger::MODULE_INVENTORY, ['actor' => $request->user(), 'resource' => $product, 'resource_label' => $product->name]);
        return ['data' => ['image_url' => route('public.products.image', $product)]];
    }

    public function destroy(Request $request, Product $product): array
    {
        $this->authorizeAdmin($request);
        $path = $product->image_path;
        $product->update(['image_path' => null]);
        if ($path && $this->safePath($product, $path)) Storage::disk('local')->delete($path);
        AuditLogger::success('PRODUCT_IMAGE_REMOVED', AuditLogger::MODULE_INVENTORY, ['actor' => $request->user(), 'resource' => $product, 'resource_label' => $product->name]);
        return ['message' => 'Product image removed.'];
    }

    public function show(Product $product): StreamedResponse
    {
        abort_unless($product->image_path && $this->safePath($product, $product->image_path) && Storage::disk('local')->exists($product->image_path), 404);
        return Storage::disk('local')->response($product->image_path, basename($product->image_path), ['Cache-Control' => 'public, max-age=300', 'X-Content-Type-Options' => 'nosniff', 'Content-Disposition' => 'inline']);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Only administrators can manage product images.');
    }

    private function safePath(Product $product, string $path): bool
    {
        return (bool) preg_match('~^product-images/'.preg_quote((string) $product->id, '~').'/[0-9a-f-]+\.(?:jpe?g|png|webp)$~i', $path);
    }
}
