<?php

namespace App\Console\Commands;

use App\Support\InventoryAuditCycles;
use Illuminate\Console\Command;

class ProcessInventoryAuditSchedule extends Command
{
    protected $signature = 'inventory-audits:process-schedule';
    protected $description = 'Create the configured inventory audit cycle and send its due notification once.';

    public function handle(): int
    {
        $cycle = InventoryAuditCycles::ensureFor(InventoryAuditCycles::currentDate());
        if (! $cycle) {
            $this->info('No inventory quality audit is scheduled for this month.');
            return self::SUCCESS;
        }

        $sent = InventoryAuditCycles::notifyDue($cycle);
        $this->info($sent ? "Created/notified {$cycle->name}." : "{$cycle->name} already exists and was notified.");
        return self::SUCCESS;
    }
}
