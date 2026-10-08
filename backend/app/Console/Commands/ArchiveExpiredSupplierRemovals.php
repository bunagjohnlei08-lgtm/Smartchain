<?php

namespace App\Console\Commands;

use App\Support\SupplierLifecycle;
use Illuminate\Console\Command;

class ArchiveExpiredSupplierRemovals extends Command
{
    protected $signature = 'suppliers:archive-expired-removals {--limit=500 : Maximum suppliers to process}';

    protected $description = 'Archive suppliers whose 30-day removal recovery period has expired';

    public function handle(SupplierLifecycle $lifecycle): int
    {
        $count = $lifecycle->archiveExpired(max(1, (int) $this->option('limit')));
        $this->info("Archived {$count} expired supplier removal(s).");

        return self::SUCCESS;
    }
}
