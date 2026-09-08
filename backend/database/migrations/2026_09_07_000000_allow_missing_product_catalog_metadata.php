<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            ALTER TABLE products
                ALTER COLUMN unit DROP NOT NULL,
                ALTER COLUMN unit DROP DEFAULT,
                ALTER COLUMN cost_price DROP NOT NULL,
                ALTER COLUMN cost_price DROP DEFAULT,
                ALTER COLUMN selling_price DROP NOT NULL,
                ALTER COLUMN selling_price DROP DEFAULT,
                ALTER COLUMN reorder_level DROP NOT NULL,
                ALTER COLUMN reorder_level DROP DEFAULT
            SQL);
    }

    public function down(): void
    {
        // Never invent business values to make a rollback satisfy NOT NULL.
        if (DB::table('products')->whereNull('unit')->orWhereNull('cost_price')
            ->orWhereNull('selling_price')->orWhereNull('reorder_level')->exists()) {
            throw new RuntimeException('Cannot restore required product metadata while NULL values exist.');
        }

        DB::statement(<<<'SQL'
            ALTER TABLE products
                ALTER COLUMN unit SET NOT NULL,
                ALTER COLUMN unit SET DEFAULT 'pcs',
                ALTER COLUMN cost_price SET NOT NULL,
                ALTER COLUMN cost_price SET DEFAULT 0,
                ALTER COLUMN selling_price SET NOT NULL,
                ALTER COLUMN selling_price SET DEFAULT 0,
                ALTER COLUMN reorder_level SET NOT NULL,
                ALTER COLUMN reorder_level SET DEFAULT 0
            SQL);
    }
};
