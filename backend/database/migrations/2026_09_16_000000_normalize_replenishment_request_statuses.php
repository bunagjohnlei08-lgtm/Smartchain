<?php

use App\Models\ReplenishmentRequest;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $statuses = [
            'Draft' => ReplenishmentRequest::STATUS_DRAFT,
            'Pending Approval' => ReplenishmentRequest::STATUS_PENDING,
            'Approved' => ReplenishmentRequest::STATUS_APPROVED,
            'Rejected' => ReplenishmentRequest::STATUS_REJECTED,
            'PO Created' => ReplenishmentRequest::STATUS_PO_CREATED,
        ];

        foreach ($statuses as $legacy => $canonical) {
            DB::table('replenishment_requests')->where('status', $legacy)->update(['status' => $canonical]);
        }
    }

    public function down(): void
    {
        $statuses = [
            ReplenishmentRequest::STATUS_DRAFT => 'Draft',
            ReplenishmentRequest::STATUS_PENDING => 'Pending Approval',
            ReplenishmentRequest::STATUS_APPROVED => 'Approved',
            ReplenishmentRequest::STATUS_REJECTED => 'Rejected',
            ReplenishmentRequest::STATUS_PO_CREATED => 'PO Created',
        ];

        foreach ($statuses as $canonical => $legacy) {
            DB::table('replenishment_requests')->where('status', $canonical)->update(['status' => $legacy]);
        }
    }
};
