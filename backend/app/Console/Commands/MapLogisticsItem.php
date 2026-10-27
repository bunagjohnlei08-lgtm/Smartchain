<?php

namespace App\Console\Commands;

use App\Models\LogisticsItemMapping;
use App\Models\LogisticsPartner;
use App\Models\Product;
use Illuminate\Console\Command;

class MapLogisticsItem extends Command
{
    protected $signature = 'logistics:map-item {partner : Partner code} {product : SmartChain product ID} {reference : Partner item/SKU reference}';
    protected $description = 'Optionally map a SmartChain Product ID to a partner-specific item reference.';

    public function handle(): int
    {
        $partner = LogisticsPartner::where('code', strtoupper((string) $this->argument('partner')))->first();
        $product = Product::find($this->argument('product'));
        $reference = trim((string) $this->argument('reference'));
        if (! $partner || ! $product || $reference === '' || strlen($reference) > 100) {
            $this->error('Valid partner, product ID, and 1-100 character reference are required.');
            return self::FAILURE;
        }
        LogisticsItemMapping::updateOrCreate(
            ['logistics_partner_id' => $partner->id, 'product_id' => $product->id],
            ['partner_item_reference' => $reference],
        );
        $this->info('Partner item mapping saved.');
        return self::SUCCESS;
    }
}
