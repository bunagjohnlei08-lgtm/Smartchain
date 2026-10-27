<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\{Rfq, RfqLine};
use App\Support\AuditLogger;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminRfqImageController extends Controller
{
    public function store(Request $request, RfqLine $rfqLine): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'mimetypes:image/jpeg,image/png,image/webp', 'extensions:jpg,jpeg,png,webp', 'max:'.config('procurement.rfq_image_max_kb', 5120)],
            'reason' => ['nullable', 'string', 'min:5', 'max:1000'],
        ]);
        $upload = $request->file('image');
        $newPath = Storage::disk('local')->putFileAs("rfq-images/{$rfqLine->rfq_id}/{$rfqLine->id}", $upload, Str::uuid().'.'.$upload->guessExtension());
        abort_unless($newPath, 500, 'RFQ image storage failed.');
        $oldPath = null;
        try {
            [$line, $oldPath] = DB::transaction(function () use ($request, $rfqLine, $newPath, $validated) {
                $line = RfqLine::query()->with('rfq')->lockForUpdate()->findOrFail($rfqLine->id);
                $this->authorizeChange($line, $validated['reason'] ?? null);
                $oldPath = $line->public_image_path;
                $line->update(['public_image_path' => $newPath]);
                AuditLogger::success('RFQ_LINE_IMAGE_UPDATED', AuditLogger::MODULE_PROCUREMENT, ['actor'=>$request->user(),'resource'=>$line->rfq,'resource_label'=>$line->rfq->rfq_number,'details'=>$validated['reason']??'RFQ line image added or replaced.','metadata'=>['rfq_line_id'=>$line->id]]);
                return [$line, $oldPath];
            });
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($newPath);
            throw $exception;
        }
        if ($oldPath && $oldPath !== $newPath) Storage::disk('local')->delete($oldPath);
        return response()->json(['data' => ['image_url' => route('admin.rfq-lines.image', $line), 'public_image_url' => route('public.rfq-lines.image', $line)]]);
    }

    public function destroy(Request $request, RfqLine $rfqLine): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate(['reason' => ['nullable', 'string', 'min:5', 'max:1000']]);
        $oldPath = DB::transaction(function () use ($request, $rfqLine, $validated) {
            $line = RfqLine::query()->with('rfq')->lockForUpdate()->findOrFail($rfqLine->id);
            $this->authorizeChange($line, $validated['reason'] ?? null);
            $path = $line->public_image_path;
            $line->update(['public_image_path' => null]);
            AuditLogger::success('RFQ_LINE_IMAGE_REMOVED', AuditLogger::MODULE_PROCUREMENT, ['actor'=>$request->user(),'resource'=>$line->rfq,'resource_label'=>$line->rfq->rfq_number,'details'=>$validated['reason']??'RFQ line image removed.','metadata'=>['rfq_line_id'=>$line->id]]);
            return $path;
        });
        if ($oldPath) Storage::disk('local')->delete($oldPath);
        return response()->json(['message' => 'RFQ line image removed.']);
    }

    public function show(Request $request, RfqLine $rfqLine): StreamedResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        return $this->imageResponse($rfqLine);
    }

    public function publicShow(RfqLine $rfqLine): StreamedResponse
    {
        $rfqLine->loadMissing('rfq');
        abort_unless($rfqLine->rfq->published_at && in_array($rfqLine->rfq->status, [Rfq::SCHEDULED, Rfq::OPEN], true) && $rfqLine->rfq->closes_at->isFuture(), 404);
        return $this->imageResponse($rfqLine);
    }

    public function signedPreview(RfqLine $rfqLine): StreamedResponse
    {
        return $this->imageResponse($rfqLine);
    }

    private function authorizeChange(RfqLine $line, ?string $reason): void
    {
        $rfq = $line->rfq;
        if ($rfq->status === Rfq::DRAFT) return;
        abort_unless($rfq->published_at && in_array($rfq->status, [Rfq::SCHEDULED, Rfq::OPEN], true) && $rfq->closes_at->isFuture(), 422, 'Images can only be changed on a draft or active published RFQ.');
        abort_if($rfq->quotations()->exists(), 409, 'An RFQ with submitted bids requires cancellation and reissue for image changes.');
        abort_unless(filled($reason), 422, 'A reason is required for a published RFQ image correction.');
    }

    private function imageResponse(RfqLine $line): StreamedResponse
    {
        abort_unless($line->public_image_path && preg_match('~^rfq-images/\d+/\d+/[0-9a-f-]+\.(?:jpe?g|png|webp)$~i', $line->public_image_path) && Storage::disk('local')->exists($line->public_image_path), 404);
        return Storage::disk('local')->response($line->public_image_path, basename($line->public_image_path), ['Cache-Control' => 'private, max-age=300', 'X-Content-Type-Options' => 'nosniff', 'Content-Disposition' => 'inline']);
    }
}
