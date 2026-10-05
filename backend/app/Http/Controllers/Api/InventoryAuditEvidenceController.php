<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryAuditEvidence;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class InventoryAuditEvidenceController extends Controller
{
    public function show(Request $request, InventoryAuditEvidence $evidence): StreamedResponse
    {
        $evidence->loadMissing('item.inventory');
        $user = $request->user();
        abort_unless($user?->isAdmin() || ($user?->isQaSupervisor() && $user->can('view', $evidence->item->inventory)), 403);
        abort_unless(Storage::disk('local')->exists($evidence->stored_path), 404);

        $safeName = preg_replace('/[\r\n\"]+/', '', basename($evidence->original_name)) ?: 'evidence';

        return Storage::disk('local')->response($evidence->stored_path, $safeName, [
            'Content-Type' => $evidence->mime_type,
            'Content-Disposition' => 'inline; filename="'.$safeName.'"',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
