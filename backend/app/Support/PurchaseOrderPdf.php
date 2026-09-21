<?php

namespace App\Support;

use App\Models\PurchaseOrder;
use Dompdf\Dompdf;
use Dompdf\Options;

/**
 * The one Purchase Order document. "Download PO (PDF)" and the attachment
 * emailed to the supplier are both rendered here, so they never diverge.
 */
class PurchaseOrderPdf
{
    public function render(PurchaseOrder $order): string
    {
        $order->loadMissing(['items', 'approver:id,name']);

        $options = new Options();
        // Only the template's own markup: no remote fetches, no local files.
        $options->setIsRemoteEnabled(false);
        $options->setIsPhpEnabled(false);
        // DejaVu Sans ships with dompdf and covers the peso sign.
        $options->setDefaultFont('DejaVu Sans');

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml(view('pdf.purchase-order', ['order' => $order])->render());
        $dompdf->setPaper('A4');
        $dompdf->render();

        return (string) $dompdf->output();
    }

    /** e.g. PO-2026-0019.pdf; anything outside [A-Za-z0-9._-] is replaced. */
    public static function filename(PurchaseOrder $order): string
    {
        $base = preg_replace('/[^A-Za-z0-9._-]+/', '_', (string) $order->po_number);

        return ($base === '' || $base === null ? 'purchase-order-'.$order->id : $base).'.pdf';
    }
}
