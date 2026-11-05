<?php

namespace App\Reports;

use App\Models\Receiving;
use App\Models\ReceivingReceiptAttachment;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ReceivingReportEvidence
{
    public function query(?User $user)
    {
        $query = Receiving::query();
        if ($user === null || $user->isAdmin()) return $query;
        abort_unless($user->isPlantManager() && $user->warehouse_id, 403);
        $warehouse = $user->warehouse_id;
        return $query->where(function ($q) use ($warehouse) {
            $q->where(fn ($assigned) => $assigned->whereHas('items', fn ($items) => $items->where('warehouse_id', $warehouse))
                    ->whereDoesntHave('items', fn ($items) => $items->whereNotNull('warehouse_id')->where('warehouse_id', '!=', $warehouse)))
                ->orWhere(function ($fallback) use ($warehouse) {
                    $fallback->whereDoesntHave('items', fn ($items) => $items->whereNotNull('warehouse_id'))
                        ->where(function ($source) use ($warehouse) {
                            $source->whereHas('purchaseOrder.replenishmentRequest', fn ($rr) => $rr->where('warehouse_id', $warehouse))
                                ->orWhere(fn ($legacy) => $legacy->whereDoesntHave('purchaseOrder.replenishmentRequest')
                                    ->whereHas('preparedBy', fn ($users) => $users->where('warehouse_id', $warehouse)));
                        });
                });
        });
    }

    public function decorate(array $rows, ?User $user): array
    {
        $records = $this->query($user)->whereIn('receiving_no', array_map(fn ($row) => $row['receiving_no'] ?? $row['receiving_reference'] ?? '', $rows))
            ->with('receiptAttachments')->get()->keyBy('receiving_no');
        return array_map(function ($row) use ($records) {
            $record = $records->get($row['receiving_no'] ?? $row['receiving_reference'] ?? '');
            if (!$record) return [...$row, 'receipt_count'=>null, 'receipt_filenames'=>null, 'receipt_references'=>null];
            $files = $record->receiptAttachments;
            $row['receipt_count'] = $files->count();
            $row['receipt_filenames'] = $files->pluck('original_name')->join('; ');
            $row['receipt_references'] = $files->map(fn ($file) => 'RECEIPT-'.$file->id)->join('; ');
            return $row;
        }, $rows);
    }

    public function bytes(ReceivingReceiptAttachment $file): ?string
    {
        // Only this receiving's existing private receipt namespace is allowed.
        if (!preg_match('~^receiving-receipts/'.(int)$file->receiving_id.'/[A-Za-z0-9_-]+\.(?:jpe?g|png|pdf)$~i', $file->stored_path)) return null;
        try {
            $disk = Storage::disk('local');
            if (!$disk->exists($file->stored_path) || $disk->size($file->stored_path) > 10 * 1024 * 1024) return null;
            $bytes = $disk->get($file->stored_path);
            $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
            if (!in_array($mime, ['image/jpeg', 'image/png', 'application/pdf'], true) || $mime !== $file->mime_type) return null;
            if (str_starts_with($mime, 'image/')) {
                $info = @getimagesizefromstring($bytes);
                if (!$info || $info[0] < 1 || $info[1] < 1) return null;
            }
            return $bytes;
        } catch (\Throwable) { return null; }
    }

    public function register(array $numbers, ?User $user, bool $content = false, bool $originals = false): array
    {
        $records = $this->query($user)->whereIn('receiving_no', $numbers)->with(['receiptAttachments', 'items'])->get();
        $register = []; $total = 0; $previews = 0;
        foreach ($records as $record) foreach ($record->receiptAttachments as $file) {
            if (count($register) >= 100) throw ValidationException::withMessages(['format'=>'Documentary export is limited to 100 receipts. Narrow the report filters.']);
            $row = [
                'receiving_no'=>$record->receiving_no, 'purchase_order'=>$record->purchase_order, 'supplier'=>$record->supplier,
                'product'=>$record->items->pluck('product_name')->unique()->join(', '), 'delivery_date'=>$record->delivery_date?->toDateString(),
                'filename'=>$file->original_name, 'mime'=>$file->mime_type, 'size'=>$file->file_size, 'uploaded_at'=>$file->created_at?->toIso8601String(),
                'reference'=>'RECEIPT-'.$file->id, 'kind'=>$record->replacement_for_rejection_case_id ? 'Replacement Delivery Receipt' : 'Original Delivery Receipt',
                'image'=>null, 'available'=>true,
            ];
            if ($content) {
                $bytes = $this->bytes($file); $row['available'] = $bytes !== null;
                $total += strlen($bytes ?? '');
                if ($total > 48 * 1024 * 1024) throw ValidationException::withMessages(['format'=>'Documentary export exceeds 48 MB. Narrow the report filters.']);
                $row['bytes'] = $originals ? $bytes : null;
                if ($bytes && str_starts_with($file->mime_type, 'image/')) {
                    $info = @getimagesizefromstring($bytes);
                    if ($info && $info[0] * $info[1] <= 4000000 && $previews < 20 && function_exists('imagecreatefromstring')) {
                        $image = @imagecreatefromstring($bytes);
                        if ($image) {
                            $ratio = min(1, 800 / $info[0], 450 / $info[1]);
                            $thumb = imagescale($image, max(1, (int)($info[0]*$ratio)), max(1, (int)($info[1]*$ratio)));
                            if ($thumb) { $previews++; ob_start(); imagepng($thumb); $row['image']='data:image/png;base64,'.base64_encode(ob_get_clean()); }
                        }
                    }
                    unset($image, $thumb);
                }
            }
            $register[] = $row;
        }
        return $register;
    }
}
