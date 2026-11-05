<?php
namespace Tests\Feature;

use App\Models\{Branch, Product, Receiving, Role, User, Warehouse};
use App\Reports\{ReceivingReportEvidence, ReportFilters, ReportRegistry, ReportRunner};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;
use ZipArchive;

class ReceivingReportEvidenceTest extends TestCase
{
    use RefreshDatabase;
    private User $admin; private User $manager; private Warehouse $warehouse;
    protected function setUp(): void
    {
        parent::setUp(); Storage::fake('local');
        $branch=Branch::create(['name'=>'Evidence Branch','code'=>'EV']);
        $this->warehouse=Warehouse::create(['name'=>'Main','code'=>'WH-MAIN','branch_id'=>$branch->id,'status'=>'Active']);
        $this->admin=$this->user('ADMIN'); $this->manager=$this->user('PLANT_MANAGER',$this->warehouse->id);
    }
    private function user(string $role, ?int $warehouse=null): User
    {
        $role=Role::firstOrCreate(['slug'=>$role],['name'=>$role]);
        return User::factory()->create(['role_id'=>$role->id,'warehouse_id'=>$warehouse,'status'=>'ACTIVE','password'=>'Password123']);
    }
    private function record(int $count=1, string $extension='png'): Receiving
    {
        $record=Receiving::create(['receiving_no'=>'RCV-EV-'.(Receiving::count()+1),'purchase_order'=>'PO-EV','supplier'=>'Supplier Evidence','delivery_date'=>today(),'status'=>'Passed','prepared_by_id'=>$this->manager->id]);
        $product=Product::create(['name'=>'Evidence Product '. $record->id,'unit'=>'PCS']);
        $record->items()->create(['product_id'=>$product->id,'product_name'=>$product->name,'ordered_quantity'=>1,'delivered_quantity'=>1,'unit'=>'PCS','inspection_status'=>'Passed','warehouse_id'=>$this->warehouse->id]);
        for($index=0;$index<$count;$index++) {
            $upload=$extension==='pdf'?null:UploadedFile::fake()->image('image.'.$extension,20,10);
            $bytes=$extension==='pdf'?"%PDF-1.4\nOriginal receipt\n%%EOF":file_get_contents($upload->getRealPath());
            $path="receiving-receipts/{$record->id}/receipt{$index}.{$extension}"; Storage::disk('local')->put($path,$bytes);
            $record->receiptAttachments()->create(['original_name'=>"receipt{$index}.{$extension}",'stored_path'=>$path,'mime_type'=>['png'=>'image/png','jpg'=>'image/jpeg','pdf'=>'application/pdf'][$extension],'file_size'=>strlen($bytes),'uploaded_by'=>$this->manager->id]);
        }
        return $record;
    }
    private function authorization(User $user,string $resource,string $format,string $action='EXPORT'): string
    {
        return $this->actingAs($user)->postJson('/api/report-access/confirm',compact('resource','format','action')+['password'=>'Password123'])->assertOk()->json('authorization');
    }
    public static function counts(): array { return [[0],[1],[4]]; }
    #[DataProvider('counts')]
    public function test_admin_and_manager_report_counts_and_metadata(int $count): void
    {
        $record=$this->record($count);
        $this->actingAs($this->admin)->getJson('/api/admin/reports/preview?report_key=receiving.summary')->assertOk()->assertJsonPath('rows.0.receipt_count',$count);
        $auth=$this->authorization($this->manager,'plant-manager:receiving','preview','PREVIEW');
        $this->withHeader('X-Report-Authorization',$auth)->getJson('/api/plant-manager/reports/generate?type=receiving&format=preview')->assertOk()->assertJsonPath('report.rows.0.receipt_count',$count);
        $this->getJson('/api/reports/receivings/'.$record->receiving_no.'/receipts')->assertOk()->assertJsonCount($count,'files')->assertJsonMissingPath('files.0.stored_path');
    }
    public static function types(): array { return [['jpg','IMAGE'],['png','IMAGE'],['pdf','PDF']]; }
    #[DataProvider('types')]
    public function test_receipt_retrieval_is_private_bound_and_single_use(string $extension,string $format): void
    {
        $record=$this->record(1,$extension); $file=$record->receiptAttachments()->firstOrFail();
        $url="/api/reports/receivings/{$record->receiving_no}/receipts/{$file->id}";
        $this->getJson($url)->assertUnauthorized();
        $this->actingAs($this->admin)->getJson($url)->assertForbidden();
        $authorization=$this->authorization($this->admin,'receiving-receipt:'.$file->id,$format,'PREVIEW');
        $this->withHeader('X-Report-Authorization',$authorization)->get($url)->assertOk()->assertHeader('X-Content-Type-Options','nosniff')->assertHeader('Cache-Control','no-store, private');
        $this->getJson($url)->assertForbidden();
    }
    public function test_foreign_warehouse_role_and_mismatched_receiving_are_denied(): void
    {
        $record=$this->record();
        $other=Warehouse::create(['name'=>'Other','code'=>'OTHER','branch_id'=>$this->warehouse->branch_id]);
        $user=$this->user('PLANT_MANAGER',$other->id);
        $this->actingAs($user)->getJson('/api/reports/receivings/'.$record->receiving_no.'/receipts')->assertNotFound();
        $metadata=app(ReceivingReportEvidence::class)->decorate([['receiving_no'=>$record->receiving_no]],$user);
        $this->assertNull($metadata[0]['receipt_count']);
        $this->actingAs($this->user('QA_SUPERVISOR'))->getJson('/api/reports/receivings/'.$record->receiving_no.'/receipts')->assertForbidden();
        $another=$this->record();$file=$record->receiptAttachments()->firstOrFail();
        $this->actingAs($this->admin)->getJson("/api/reports/receivings/{$another->receiving_no}/receipts/{$file->id}")->assertNotFound();
    }
    public static function formats(): array { return [['PDF'],['XLSX'],['CSV'],['ZIP']]; }
    #[DataProvider('formats')]
    public function test_actual_exported_artifacts_contain_evidence(string $format): void
    {
        $record=$this->record();$this->record(1,'pdf');
        $file=app(ReportRunner::class)->export(app(ReportRegistry::class)->find('receiving.summary'),new ReportFilters(),$format,$this->admin);
        try {
            $bytes=file_get_contents($file['path']);
            if($format==='PDF') {
                $this->assertStringStartsWith('%PDF-', $bytes);
                $this->assertStringContainsString('/Subtype /Image',$bytes);
            } elseif($format==='CSV') {
                $this->assertStringContainsString('Receipt Attachments',$bytes);
                $this->assertStringContainsString('receipt0.png',$bytes);
                $this->assertStringNotContainsString('receiving-receipts/',$bytes);
            } else {
                $zip=new ZipArchive();$this->assertTrue($zip->open($file['path']));
                if($format==='XLSX') {
                    $this->assertStringContainsString('Receipt Register',$zip->getFromName('xl/workbook.xml'));
                    $xml=$zip->getFromName('xl/worksheets/sheet2.xml');
                    $this->assertNotFalse(simplexml_load_string($xml));
                    $this->assertStringContainsString('receipt0.png',$xml);
                    $this->assertStringContainsString('receipt0.pdf',$xml);
                } else {
                    $this->assertStringStartsWith('%PDF-', $zip->getFromName('Receiving-Report.pdf'));
                    $this->assertStringContainsString($record->receiving_no,$zip->getFromName('Receipt-Manifest.csv'));
                    $this->assertSame(4,$zip->numFiles);
                    for($index=0;$index<$zip->numFiles;$index++) {
                        $name=$zip->getNameIndex($index);$this->assertStringNotContainsString('..',$name);
                        if(str_ends_with($name,'.png'))$this->assertStringStartsWith("\x89PNG",$zip->getFromIndex($index));
                    }
                }
                $zip->close();
            }
        } finally { @unlink($file['path']); }
    }
    public function test_missing_and_corrupt_files_do_not_leak_paths_or_crash_exports(): void
    {
        $record=$this->record(2);$files=$record->receiptAttachments()->get();
        Storage::disk('local')->delete($files[0]->stored_path); Storage::disk('local')->put($files[1]->stored_path,'invalid image');
        $rows=app(ReceivingReportEvidence::class)->register([$record->receiving_no],$this->admin,true);
        $this->assertFalse($rows[0]['available']);$this->assertFalse($rows[1]['available']);
        $this->assertNull($rows[0]['image']);$this->assertNull($rows[1]['image']);
    }

    public static function galleryCounts(): array
    {
        return [[1], [2], [3], [4], [5], [8], [9], [1, true], [4, true]];
    }

    #[DataProvider('galleryCounts')]
    public function test_pdf_gallery_paginates_actual_receipt_images_in_groups_of_four(int $count, bool $portrait = false): void
    {
        $record = $this->record($count);
        foreach ($record->receiptAttachments()->get() as $index => $attachment) {
            $upload = UploadedFile::fake()->image('receipt.png', $index % 2 ? 1000 : 600, $index % 2 ? 600 : 1000);
            $image = imagecreatefromstring(file_get_contents($upload->getRealPath()));
            $white = imagecolorallocate($image, 255, 255, 255);
            $ink = imagecolorallocate($image, 30, 45, 60);
            imagefill($image, 0, 0, $white);
            imagestring($image, 5, 24, 24, 'DELIVERY RECEIPT '.($index + 1), $ink);
            for ($line = 0; $line < 8; $line++) imagestring($image, 4, 24, 70 + $line * 35, 'Item '.($line + 1).' ........ Qty 10', $ink);
            ob_start();
            if ($index === 1) imagejpeg($image); else imagepng($image);
            $bytes = ob_get_clean();
            Storage::disk('local')->put($attachment->stored_path, $bytes);
            if ($index === 1) $attachment->update(['mime_type'=>'image/jpeg']);
            $attachment->update(['original_name' => str_repeat('Long-unbroken-receipt-name-', 6).$index.'.png']);
        }
        $pdfBytes = "%PDF-1.4\nOriginal document, not an image preview\n%%EOF";
        $pdfPath = "receiving-receipts/{$record->id}/original.pdf";
        Storage::disk('local')->put($pdfPath, $pdfBytes);
        $record->receiptAttachments()->create(['original_name'=>'original.pdf', 'stored_path'=>$pdfPath,
            'mime_type'=>'application/pdf', 'file_size'=>strlen($pdfBytes), 'uploaded_by'=>$this->manager->id]);
        // Keep the summary table empty to measure gallery pagination independently
        // of existing narrow-column wrapping in the full report table.
        $definition = app(ReportRegistry::class)->find('receiving.summary');
        if ($portrait) $definition = new \App\Reports\ReportDefinition('fixture', 'Receiving Summary', '', 'receiving', array_slice($definition->columns, 0, 2));
        $path = app(\App\Reports\Writers\PdfReportWriter::class)->write($definition, [], [
            'title'=>'Receiving Summary', 'category'=>'Receiving Reports', 'generated_at'=>'Test fixture', 'filters'=>[],
            'receipts'=>fn () => app(ReceivingReportEvidence::class)->register([$record->receiving_no], $this->admin, true),
        ]);
        $file = ['path'=>$path];
        try {
            $bytes = file_get_contents($file['path']);
            $this->assertStringStartsWith('%PDF-', $bytes);
            if ($directory = getenv('RECEIPT_PDF_QA_DIR')) {
                if (!is_dir($directory)) mkdir($directory, 0777, true);
                copy($file['path'], $directory.'/receipts-'.$count.($portrait ? '-portrait' : '').'.pdf');
            }
            $this->assertSame(2 + (int) ceil($count / 4), preg_match_all('~/Type\\s*/Page\\b~', $bytes));
        } finally { @unlink($file['path']); }
    }

    public function test_pdf_does_not_pack_different_receivings_into_one_gallery_page(): void
    {
        $this->record(2);
        $this->record(2, 'jpg');
        $file = app(ReportRunner::class)->export(app(ReportRegistry::class)->find('receiving.summary'), new ReportFilters(), 'PDF', $this->admin);
        try {
            $this->assertSame(4, preg_match_all('~/Type\\s*/Page\\b~', file_get_contents($file['path'])));
        } finally { @unlink($file['path']); }
    }
    public function test_documentary_export_limits_are_enforced(): void
    {
        $record=$this->record(1);$file=$record->receiptAttachments()->firstOrFail();
        for($index=0;$index<100;$index++)$record->receiptAttachments()->create([...$file->only(['original_name','mime_type','file_size','uploaded_by']), 'stored_path'=>"receiving-receipts/{$record->id}/extra{$index}.png"]);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        app(ReceivingReportEvidence::class)->register([$record->receiving_no],$this->admin);
    }
    public function test_replacement_receipts_are_not_attributed_to_the_original_receiving(): void
    {
        $original=$this->record(1,'jpg');$replacement=$this->record(1,'png');
        $inspection=\App\Models\QaInspection::create(['receiving_id'=>$original->id,'status'=>'Rejected','completed_at'=>now(),'inspected_by_id'=>$this->manager->id]);
        $item=\App\Models\QaInspectionItem::create(['qa_inspection_id'=>$inspection->id,'receiving_item_id'=>$original->items()->first()->id,'accepted_quantity'=>0,'rejected_quantity'=>1,'inspection_result'=>'Rejected']);
        $case=\App\Models\SupplierRejectionCase::create(['qa_inspection_item_id'=>$item->id,'status'=>'REPLACEMENT_PENDING']);
        $replacement->update(['replacement_for_rejection_case_id'=>$case->id]);
        $rows=app(ReceivingReportEvidence::class)->register([$replacement->receiving_no],$this->admin);
        $this->assertCount(1,$rows);$this->assertSame('Replacement Delivery Receipt',$rows[0]['kind']);
        $this->assertSame('receipt0.png',$rows[0]['filename']);$this->assertSame($replacement->receiving_no,$rows[0]['receiving_no']);
    }

    public function test_mixed_warehouse_receiving_is_not_a_document_access_bypass(): void
    {
        $record=$this->record();$item=$record->items()->first();
        $other=Warehouse::create(['name'=>'Restricted','code'=>'RESTRICTED','branch_id'=>$this->warehouse->branch_id]);
        $record->items()->create([...$item->only(['product_id','product_name','ordered_quantity','delivered_quantity','unit','inspection_status']), 'warehouse_id'=>$other->id]);
        $this->actingAs($this->manager)->getJson('/api/reports/receivings/'.$record->receiving_no.'/receipts')->assertNotFound();
        $this->actingAs($this->admin)->getJson('/api/reports/receivings/'.$record->receiving_no.'/receipts')->assertOk();
    }
    public function test_csv_formula_names_are_neutralized_and_storage_paths_never_exported(): void
    {
        $record=$this->record();$record->receiptAttachments()->first()->update(['original_name'=>'=HYPERLINK("unsafe")']);
        $file=app(ReportRunner::class)->export(app(ReportRegistry::class)->find('receiving.summary'),new ReportFilters(),'CSV',$this->admin);
        try {
            $handle=fopen($file['path'],'r');$header=fgetcsv($handle,escape:'');$row=fgetcsv($handle,escape:'');fclose($handle);
            $index=array_search('Receipt Filenames',$header,true);$this->assertSame("'=HYPERLINK(\"unsafe\")",$row[$index]);
            $this->assertStringNotContainsString('receiving-receipts/',file_get_contents($file['path']));
        } finally { @unlink($file['path']); }
    }
    public function test_receipt_authorization_rejects_wrong_action_expiry_and_foreign_storage_path(): void
    {
        $record=$this->record();$file=$record->receiptAttachments()->first();
        $url="/api/reports/receivings/{$record->receiving_no}/receipts/{$file->id}";
        $auth=$this->authorization($this->admin,'receiving-receipt:'.$file->id,'IMAGE','DOWNLOAD');
        $this->withHeader('X-Report-Authorization',$auth)->getJson($url)->assertForbidden();
        $auth=$this->authorization($this->admin,'receiving-receipt:'.$file->id,'IMAGE','PREVIEW');
        $this->travel(121)->seconds();$this->withHeader('X-Report-Authorization',$auth)->getJson($url)->assertForbidden();
        $file->update(['stored_path'=>'../../private.pdf']);
        $this->assertNull(app(ReceivingReportEvidence::class)->bytes($file));
    }

    public function test_excess_report_receipts_use_the_source_receiving_reference(): void
    {
        $record=$this->record();
        $rows=app(ReceivingReportEvidence::class)->decorate([['receiving_reference'=>$record->receiving_no]],$this->admin);
        $this->assertSame(1,$rows[0]['receipt_count']);
        $this->assertSame('receipt0.png',$rows[0]['receipt_filenames']);
        $this->assertArrayHasKey('receipt_count',app(ReportRegistry::class)->find('receiving.excess_resolution')->columns);
    }

    public function test_manager_binary_export_requires_password_confirmation(): void
    {
        $this->record();
        $this->actingAs($this->manager)->getJson('/api/plant-manager/reports/receiving/export?format=excel')->assertForbidden();
        $auth=$this->authorization($this->manager,'plant-manager:receiving','excel');
        $response=$this->withHeader('X-Report-Authorization',$auth)->get('/api/plant-manager/reports/receiving/export?format=excel')->assertOk();
        $this->assertSame('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',$response->headers->get('Content-Type'));
    }
}
