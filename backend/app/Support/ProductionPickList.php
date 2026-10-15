<?php
namespace App\Support;

use App\Models\{Inventory, ProductionBatch, User};
use Dompdf\Dompdf;
use Dompdf\Options;

final class ProductionPickList
{
    public function html(ProductionBatch $batch): string
    {
        $batch->loadMissing(['warehouse', 'materials']);
        $inventories = Inventory::where('warehouse_id', $batch->warehouse_id)->whereIn('product_id', $batch->materials->pluck('product_id'))->get()->keyBy('product_id');
        return view('pdf.production-pick-list', ['batch' => $batch, 'preparedBy' => User::whereKey($batch->created_by_id)->value('name'),
            'generatedAt' => now()->toIso8601String(), 'inventories' => $inventories])->render();
    }
    public function pdf(string $html): string
    {
        $options = new Options(); $options->setIsRemoteEnabled(false); $options->setIsPhpEnabled(false); $options->setDefaultFont('DejaVu Sans');
        $pdf = new Dompdf($options); $pdf->loadHtml($html); $pdf->setPaper('A4'); $pdf->render();
        $pdf->getCanvas()->page_text(420, 820, 'Page {PAGE_NUM} of {PAGE_COUNT}', $pdf->getFontMetrics()->getFont('DejaVu Sans'), 8, [0.35, 0.35, 0.35]);
        return (string) $pdf->output();
    }
    public static function filename(ProductionBatch $batch): string { return 'production-pick-list-'.preg_replace('/[^A-Za-z0-9._-]/', '_', $batch->batch_number).'.pdf'; }
}
