<?php

use App\Http\Controllers\Api\AdminCatalogMappingController;
use App\Http\Controllers\Api\AdminInventoryAuditController;
use App\Http\Controllers\Api\AdminLogisticsController;
use App\Http\Controllers\Api\AdminLogisticsIntegrationController;
use App\Http\Controllers\Api\AdminOrderController;
use App\Http\Controllers\Api\AdminProcurementController;
use App\Http\Controllers\Api\AdminRfqController;
use App\Http\Controllers\Api\AdminRfqEditingController;
use App\Http\Controllers\Api\AdminRfqImageController;
use App\Http\Controllers\Api\AdminBidEvaluationController;
use App\Http\Controllers\Api\AdminReportController;
use App\Http\Controllers\Api\AdminSupplierApplicationController;
use App\Http\Controllers\Api\AdminSupplierApplicationMeetingController;
use App\Http\Controllers\Api\AdminSupplierPerformanceController;
use App\Http\Controllers\Api\AdminSupplierAccreditationController;
use App\Http\Controllers\Api\AwardPurchaseOrderController;
use App\Http\Controllers\Api\AdminSupplierRejectionController;
use App\Http\Controllers\Api\AdminWarehouseLocationController;
use App\Http\Controllers\Api\AIForecastController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\InventoryAuditEvidenceController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\LogisticsStatusCallbackController;
use App\Http\Controllers\Api\InventoryHistoryController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\PlantManagerDashboardController;
use App\Http\Controllers\Api\PlantManagerOrderController;
use App\Http\Controllers\Api\PlantManagerProcurementController;
use App\Http\Controllers\Api\PlantManagerReceivingNoteController;
use App\Http\Controllers\Api\PlantManagerShipmentController;
use App\Http\Controllers\Api\PlantManagerWarehouseController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductImageController;
use App\Http\Controllers\Api\SupplierBidController;
use App\Http\Controllers\Api\PublicCompanyLocationController;
use App\Http\Controllers\Api\PublicRfqController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\PurchaseOrderController;
use App\Http\Controllers\Api\FinancialPurchaseOrderController;
use App\Http\Controllers\Api\FinancialObligationController;
use App\Http\Controllers\Api\QaDashboardController;
use App\Http\Controllers\Api\QaInspectionController;
use App\Http\Controllers\Api\QaInspectionHistoryController;
use App\Http\Controllers\Api\QaInventoryAuditController;
use App\Http\Controllers\Api\QaQualityReportController;
use App\Http\Controllers\Api\QaRejectedItemsController;
use App\Http\Controllers\Api\ReceivingController;
use App\Http\Controllers\Api\ReceivingDiscrepancyController;
use App\Http\Controllers\Api\ExcessDeliveryReviewController;
use App\Http\Controllers\Api\ReportsController;
use App\Http\Controllers\Api\ReportAccessController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\StockInController;
use App\Http\Controllers\Api\StockOutController;
use App\Http\Controllers\Api\SupplierApplicationController;
use App\Http\Controllers\Api\SupplierAccountController;
use App\Http\Controllers\Api\SupplierAccreditationController;
use App\Http\Controllers\Api\SupplierRfqController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\SupplierPurchasingTermController;
use App\Http\Controllers\Api\SupplierPortalController;
use App\Http\Controllers\Api\SupplierPurchaseOrderController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);
Route::post('/supplier-applications', [SupplierApplicationController::class, 'store'])->middleware('throttle:supplier-applications');
Route::get('/public/company-location', [PublicCompanyLocationController::class, 'show'])->middleware('throttle:60,1');
Route::get('/public/rfqs', [PublicRfqController::class, 'index'])->middleware('throttle:60,1');
Route::get('/public/rfqs/{rfq}', [PublicRfqController::class, 'show'])->whereNumber('rfq')->middleware('throttle:60,1');
Route::get('/accreditation-documents/{document}', [SupplierAccreditationController::class, 'signedDocument'])->whereNumber('document')->middleware(['signed','throttle:60,1'])->name('accreditation-documents.download');
Route::get('/public/rfq-lines/{rfqLine}/image', [AdminRfqImageController::class, 'publicShow'])->whereNumber('rfqLine')->name('public.rfq-lines.image')->middleware('throttle:120,1');
Route::get('/rfq-lines/{rfqLine}/image-preview', [AdminRfqImageController::class, 'signedPreview'])->whereNumber('rfqLine')->name('rfq-lines.image.preview')->middleware(['signed', 'throttle:120,1']);
Route::post('/supplier-portal/access', [SupplierPortalController::class, 'exchange'])->middleware('throttle:supplier-portal-access');
Route::middleware(['supplier.portal', 'throttle:supplier-portal'])->prefix('supplier-portal')->group(function () {
    Route::get('/application', [SupplierPortalController::class, 'show']);
    Route::post('/meeting-slots/{meetingSlot}/select', [SupplierPortalController::class, 'selectMeeting'])
        ->whereNumber('meetingSlot')->middleware('throttle:supplier-portal-selection');
    Route::post('/request-another-schedule', [SupplierPortalController::class, 'requestAnotherSchedule']);
    Route::post('/resubmit', [SupplierPortalController::class, 'resubmit']);
});

// Second login step. Public (no token exists yet) but throttled and bound to
// a single-use challenge; a token is issued only by verify-otp.
Route::post('/login/verify-otp', [AuthController::class, 'verifyOtp'])->middleware('throttle:login-otp-verify');
Route::post('/login/resend-otp', [AuthController::class, 'resendOtp'])->middleware('throttle:login-otp-resend');

Route::post('/forgot-password', [PasswordResetController::class, 'requestCode'])->middleware('throttle:password-reset-request');
Route::post('/forgot-password/resend', [PasswordResetController::class, 'resend'])->middleware('throttle:password-reset-resend');
Route::post('/forgot-password/verify', [PasswordResetController::class, 'verify'])->middleware('throttle:password-reset-verify');
Route::post('/forgot-password/reset', [PasswordResetController::class, 'reset'])->middleware('throttle:password-reset-complete');

Route::post('/integrations/logistics/v1/status-events', [LogisticsStatusCallbackController::class, 'store'])
    ->middleware(['throttle:logistics-callback', 'logistics.callback']);

// Public activation-link endpoints. No token is issued by either.
Route::middleware('throttle:invitations')->group(function () {
    Route::post('/invitations/validate', [InvitationController::class, 'check']);
    Route::post('/invitations/accept', [InvitationController::class, 'accept']);
});

Route::middleware(['auth:sanctum', 'active', 'idle'])->group(function () {
    Route::get('/financial-case-events/{type}/{id}/preview', [\App\Http\Controllers\Api\FinancialCaseEventController::class, 'preview'])
        ->whereIn('type', ['excess', 'rejection', 'discrepancy'])->whereNumber('id');

    Route::get('/customer-returns/options', [\App\Http\Controllers\Api\CustomerReturnController::class, 'options']);
    Route::get('/customer-returns', [\App\Http\Controllers\Api\CustomerReturnController::class, 'index']);
    Route::post('/customer-returns', [\App\Http\Controllers\Api\CustomerReturnController::class, 'store']);
    Route::get('/customer-returns/{customerReturn}', [\App\Http\Controllers\Api\CustomerReturnController::class, 'show'])->whereNumber('customerReturn');
    Route::post('/customer-returns/{customerReturn}/{action}', [\App\Http\Controllers\Api\CustomerReturnController::class, 'action'])->whereNumber('customerReturn');
    Route::get('/customer-returns/{customerReturn}/evidence/{evidence}', [\App\Http\Controllers\Api\CustomerReturnController::class, 'evidence'])->whereNumber(['customerReturn','evidence']);
    Route::get('/reports/receivings/{number}/receipts', [\App\Http\Controllers\Api\ReceivingReportEvidenceController::class, 'show'])->middleware('throttle:60,1');
    Route::get('/reports/receivings/{number}/receipts/{attachment}', [\App\Http\Controllers\Api\ReceivingReportEvidenceController::class, 'file'])->middleware('throttle:30,1');
    Route::get('/plant-manager/reports/receiving/export', [ReportsController::class, 'receivingExport'])->middleware('throttle:10,1');
    Route::post('/report-access/confirm', [ReportAccessController::class, 'confirm'])->middleware('throttle:60,1');
    Route::post('/report-access/consume', [ReportAccessController::class, 'consume'])->middleware('throttle:60,1');
    Route::middleware('supplier.account')->prefix('supplier-account')->group(function () {
        Route::get('/profile', [SupplierAccountController::class, 'show']);
        Route::get('/accreditation-requests', [SupplierAccreditationController::class, 'index']);
        Route::post('/accreditation-requests', [SupplierAccreditationController::class, 'store'])->middleware('throttle:10,1');
        Route::post('/accreditation-requests/{accreditationRequest}/resubmit', [SupplierAccreditationController::class, 'resubmit'])->whereNumber('accreditationRequest')->middleware('throttle:10,1');
        Route::get('/accreditation-documents/{document}', [SupplierAccreditationController::class, 'document'])->whereNumber('document');
        Route::get('/rfqs', [SupplierRfqController::class, 'index']);
        Route::get('/bidding-interests', [SupplierRfqController::class, 'myInterests']);
        Route::get('/rfqs/{rfq}', [SupplierRfqController::class, 'show']);
        Route::post('/bidding-interests', [SupplierRfqController::class, 'interests']);
        Route::get('/quotations', [SupplierBidController::class, 'index']);
        Route::post('/quotations', [SupplierBidController::class, 'store'])->middleware('throttle:30,1');
        Route::post('/bid-lines/{bidLine}/revisions', [SupplierBidController::class, 'revise'])->middleware('throttle:30,1');
        Route::get('/purchase-orders', [SupplierPurchaseOrderController::class, 'index']);
        Route::get('/purchase-orders/{purchaseOrder}', [SupplierPurchaseOrderController::class, 'show'])->whereNumber('purchaseOrder');
        Route::post('/purchase-orders/{purchaseOrder}/acknowledgments', [SupplierPurchaseOrderController::class, 'acknowledge'])->whereNumber('purchaseOrder')->middleware('throttle:20,1');
        Route::get('/performance', [SupplierPurchaseOrderController::class, 'performance']);
    });
    Route::post('/ai/forecast', [AIForecastController::class, 'forecast'])->middleware('throttle:30,1');
    Route::get('/session/status', [SessionController::class, 'status'])->middleware('throttle:session-status');
    Route::post('/session/activity', [SessionController::class, 'activity'])->middleware('throttle:session-activity');
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/photo', [ProfileController::class, 'updatePhoto']);
    Route::delete('/profile/photo', [ProfileController::class, 'removePhoto']);
    Route::put('/profile/password', [ProfileController::class, 'updatePassword']);
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/recent', [NotificationController::class, 'recent']);
    Route::put('/notifications/read-all', [NotificationController::class, 'readAll']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'read'])->whereUuid('id');
    Route::get('/admin/dashboard', [DashboardController::class, 'index']);
    Route::prefix('admin/reports')->group(function () {
        Route::get('/dashboard', [AdminReportController::class, 'dashboard']);
        Route::get('/definitions', [AdminReportController::class, 'definitions']);
        Route::get('/options', [AdminReportController::class, 'options']);
        Route::get('/preview', [AdminReportController::class, 'preview'])->middleware('throttle:120,1');
        Route::post('/export', [AdminReportController::class, 'export'])->middleware('throttle:30,1');
        Route::get('/history', [AdminReportController::class, 'history']);
        Route::get('/schedules', [AdminReportController::class, 'schedules']);
        Route::post('/schedules', [AdminReportController::class, 'storeSchedule']);
        Route::patch('/schedules/{reportSchedule}', [AdminReportController::class, 'updateSchedule']);
        Route::delete('/schedules/{reportSchedule}', [AdminReportController::class, 'destroySchedule']);
    });
    Route::get('/admin/warehouse/location', [AdminWarehouseLocationController::class, 'show']);
    Route::put('/admin/warehouse/location', [AdminWarehouseLocationController::class, 'update']);
    Route::post('/admin/products/bulk-supplier', [ProductController::class, 'bulkAssignSupplier']);
    Route::post('/admin/products/{product}/image', [ProductImageController::class, 'store']);
    Route::delete('/admin/products/{product}/image', [ProductImageController::class, 'destroy']);
    Route::post('/admin/products/{product}/warehouse', [ProductController::class, 'assignWarehouse']);
    Route::apiResource('/admin/products', ProductController::class);
    Route::get('/admin/catalog-mapping/offerings', [AdminCatalogMappingController::class, 'index']);
    Route::post('/admin/catalog-mapping/offerings/{offering}/link', [AdminCatalogMappingController::class, 'link']);
    Route::post('/admin/catalog-mapping/offerings/{offering}/create-product', [AdminCatalogMappingController::class, 'createProduct']);
    Route::get('/plant-manager/dashboard', [PlantManagerDashboardController::class, 'index']);
    Route::get('/plant-manager/warehouse', [PlantManagerWarehouseController::class, 'show']);
    Route::get('/admin/boms', [\App\Http\Controllers\Api\BomController::class, 'index']);
    Route::post('/admin/boms', [\App\Http\Controllers\Api\BomController::class, 'store']);
    Route::put('/admin/boms/{bom}', [\App\Http\Controllers\Api\BomController::class, 'update']);
    Route::get('/production/options', [\App\Http\Controllers\Api\ProductionController::class, 'options']);
    Route::get('/production/batches', [\App\Http\Controllers\Api\ProductionController::class, 'index']);
    Route::post('/production/batches', [\App\Http\Controllers\Api\ProductionController::class, 'store']);
    Route::get('/production/batches/{productionBatch}', [\App\Http\Controllers\Api\ProductionController::class, 'show']);
    Route::get('/production/batches/{productionBatch}/pick-list', [\App\Http\Controllers\Api\ProductionController::class, 'pickList']);
    Route::post('/production/batches/{productionBatch}/issue', [\App\Http\Controllers\Api\ProductionController::class, 'issue']);
    Route::post('/production/batches/{productionBatch}/output', [\App\Http\Controllers\Api\ProductionController::class, 'output']);
    Route::post('/production/batches/{productionBatch}/qa', [\App\Http\Controllers\Api\ProductionController::class, 'inspect']);
    Route::post('/production/batches/{productionBatch}/stock-in', [\App\Http\Controllers\Api\ProductionController::class, 'stockIn']);
    Route::post('/production/batches/{productionBatch}/cancel', [\App\Http\Controllers\Api\ProductionController::class, 'cancel']);
    Route::post('/production/batches/{productionBatch}/non-conformance', [\App\Http\Controllers\Api\ProductionController::class, 'disposition']);
    Route::prefix('plant-manager/reports')->group(function () {
        Route::get('/dashboard', [ReportsController::class, 'dashboard']);
        Route::get('/generate', [ReportsController::class, 'generate']);
        Route::get('/recent', [ReportsController::class, 'recent']);
    });
    Route::get('/products', [ProductController::class, 'options'])->name('products.options');

    Route::get('/users/statistics', [UserController::class, 'statistics']);
    Route::get('/users', [UserController::class, 'index']);
    Route::get('/users/{id}', [UserController::class, 'show']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/users/{id}', [UserController::class, 'update']);
    Route::delete('/users/{id}', [UserController::class, 'destroy']);
    Route::post('/users/{id}/approve', [UserController::class, 'approve']);
    Route::post('/users/{id}/suspend', [UserController::class, 'suspend']);
    Route::post('/users/{id}/activate', [UserController::class, 'activate']);
    Route::post('/users/{id}/resend-invitation', [UserController::class, 'resendInvitation'])
        ->middleware('throttle:invitation-resend');

    Route::get('/admin/audit-logs', [AuditLogController::class, 'index']);
    Route::get('/admin/audit-logs/options', [AuditLogController::class, 'options']);

    Route::get('/roles', [UserController::class, 'roles']);
    Route::get('/departments', [UserController::class, 'departments']);
    Route::get('/branches', [UserController::class, 'branches']);
    Route::get('/warehouses', [UserController::class, 'warehouses']);

    Route::get('/inventory', [InventoryController::class, 'index']);
    Route::get('/inventory/movements/recent', [InventoryHistoryController::class, 'recent']);
    Route::get('/inventory/movements', [InventoryHistoryController::class, 'index']);
    Route::post('/inventory', [InventoryController::class, 'store']);
    Route::get('/inventory/{id}', [InventoryController::class, 'show']);
    Route::put('/inventory/{id}', [InventoryController::class, 'update']);
    Route::post('/inventory/{inventory}/returned-storage', [InventoryController::class, 'moveToReturned']);
    Route::post('/inventory/{inventory}/returned-receipt', [InventoryController::class, 'receiveReturned']);
    Route::delete('/inventory/{id}', [InventoryController::class, 'destroy']);

    Route::get('/stock-in/receivings', [StockInController::class, 'index']);
    Route::get('/stock-in/capacity', [StockInController::class, 'capacity']);
    Route::get('/stock-in/history', [StockInController::class, 'history']);
    Route::get('/stock-in/recently-stocked', [StockInController::class, 'recentStockedIn']);
    Route::get('/stock-in/receivings/{id}', [StockInController::class, 'show']);
    Route::post('/stock-in/receivings/{id}/stock-in', [StockInController::class, 'performStockIn']);

    Route::get('/receivings/qa-assignees', [ReceivingController::class, 'qaAssignees']);
    Route::get('/receivings', [ReceivingController::class, 'index']);
    Route::post('/receivings', [ReceivingController::class, 'store']);
    Route::post('/receivings/excess-reviews', [ExcessDeliveryReviewController::class, 'store']);
    Route::get('/excess-delivery-reviews', [ExcessDeliveryReviewController::class, 'plantManagerIndex']);
    Route::post('/excess-delivery-reviews/{excessDeliveryReview}/documentation', [ExcessDeliveryReviewController::class, 'submitDocumentation']);
    Route::post('/excess-delivery-reviews/{excessDeliveryReview}/return/prepare', [ExcessDeliveryReviewController::class, 'prepareReturn']);
    Route::post('/excess-delivery-reviews/{excessDeliveryReview}/return/complete', [ExcessDeliveryReviewController::class, 'completeReturn']);
    Route::get('/excess-delivery-reviews/{excessDeliveryReview}/documents/{document}', [ExcessDeliveryReviewController::class, 'document']);
    Route::patch('/receivings/{receiving}/assign-qa', [ReceivingController::class, 'assignQa']);
    Route::post('/receivings/{receiving}/confirm-replacement', [ReceivingController::class, 'confirmReplacementDelivery']);
    Route::get('/receivings/{receiving}/receipts/{receiptAttachment}', [ReceivingController::class, 'receiptAttachment']);
    Route::get('/receivings/{id}', [ReceivingController::class, 'show']);

    Route::put('/plant-manager/receivings/{receiving}/notes', [PlantManagerReceivingNoteController::class, 'update']);

    Route::get('/qa/inspections', [QaInspectionController::class, 'index']);
    Route::get('/qa/dashboard', [QaDashboardController::class, 'index']);
    Route::get('/qa/inspection-history', [QaInspectionHistoryController::class, 'index']);
    Route::get('/qa/rejected-items', [QaRejectedItemsController::class, 'index']);
    Route::get('/qa/rejected-items/export.xlsx', [QaRejectedItemsController::class, 'export']);
    Route::get('/qa/quality-reports', [QaQualityReportController::class, 'index']);
    Route::get('/qa/inspections/{receivingId}', [QaInspectionController::class, 'show']);
    Route::get('/qa/inspections/{receivingId}/attachment', [QaInspectionController::class, 'attachment']);
    Route::get('/qa/inspections/{receivingId}/attachments/{attachmentId}', [QaInspectionController::class, 'attachment']);
    Route::get('/qa/inspections/{receivingId}/receipts/{receiptAttachmentId}', [QaInspectionController::class, 'receivingReceipt']);
    Route::delete('/qa/inspections/{receivingId}/attachments/{attachmentId}', [QaInspectionController::class, 'destroyAttachment']);
    Route::post('/qa/inspections/{receivingId}', [QaInspectionController::class, 'store']);
    Route::put('/qa/inspections/{receivingId}', [QaInspectionController::class, 'update']);

    Route::get('/qa/inventory-audits', [QaInventoryAuditController::class, 'index']);
    Route::get('/qa/inventory-audits/history', [QaInventoryAuditController::class, 'history']);
    Route::post('/qa/inventory-audits/{inventory}', [QaInventoryAuditController::class, 'store']);
    Route::get('/inventory-audits/evidence/{evidence}', [InventoryAuditEvidenceController::class, 'show']);

    Route::get('/admin/inventory-audits', [AdminInventoryAuditController::class, 'index']);
    Route::put('/admin/inventory-audits/schedule/months', [AdminInventoryAuditController::class, 'updateSchedule']);
    Route::get('/admin/inventory-audits/{inventoryAuditItem}', [AdminInventoryAuditController::class, 'show']);
    Route::post('/admin/inventory-audits/{inventoryAuditItem}/approve', [AdminInventoryAuditController::class, 'approve']);
    Route::post('/admin/inventory-audits/{inventoryAuditItem}/return', [AdminInventoryAuditController::class, 'returnForReinspection']);

    Route::prefix('admin/orders')->group(function () {
        Route::get('/', [AdminOrderController::class, 'index']);
        Route::get('/summary', [AdminOrderController::class, 'summary']);
        Route::get('/plant-managers', [AdminOrderController::class, 'plantManagers']);
        Route::get('/products', [AdminOrderController::class, 'products']);
        Route::post('/', [AdminOrderController::class, 'store']);
        Route::get('/{order}', [AdminOrderController::class, 'show']);
        Route::patch('/{order}/assign', [AdminOrderController::class, 'assign']);
        Route::patch('/{order}/status', [AdminOrderController::class, 'updateStatus']);
    });

    Route::prefix('admin/procurement')->group(function () {
        Route::get('/requests', [AdminProcurementController::class, 'index']);
        Route::get('/summary', [AdminProcurementController::class, 'summary']);
        Route::get('/requests/{replenishmentRequest}', [AdminProcurementController::class, 'show']);
        Route::post('/requests/{replenishmentRequest}/approve', [AdminProcurementController::class, 'approve']);
        Route::post('/requests/{replenishmentRequest}/decline', [AdminProcurementController::class, 'decline']);
        Route::post('/requests/{replenishmentRequest}/sourcing-decision', [AdminRfqController::class, 'sourcingDecision']);
        Route::get('/rfqs', [AdminRfqController::class, 'index']);
        Route::get('/rfq-requirements', [AdminRfqEditingController::class, 'eligibleRequirements']);
        Route::get('/sourcing-products', [AdminRfqEditingController::class, 'sourcingProducts']);
        Route::post('/rfqs', [AdminRfqController::class, 'store']);
        Route::get('/rfqs/{rfq}', [AdminRfqEditingController::class, 'show']);
        Route::put('/rfqs/{rfq}', [AdminRfqEditingController::class, 'update']);
        Route::post('/rfqs/{rfq}/amend', [AdminRfqEditingController::class, 'amend']);
        Route::post('/rfqs/{rfq}/submit', [AdminRfqController::class, 'submit']);
        Route::post('/rfqs/{rfq}/approve', [AdminRfqController::class, 'approve']);
        Route::post('/rfqs/{rfq}/publish', [AdminRfqController::class, 'publish']);
        Route::post('/rfqs/{rfq}/cancel', [AdminRfqController::class, 'cancel']);
        Route::post('/rfq-lines/{rfqLine}/image', [AdminRfqImageController::class, 'store'])->whereNumber('rfqLine');
        Route::get('/rfq-lines/{rfqLine}/image', [AdminRfqImageController::class, 'show'])->whereNumber('rfqLine')->name('admin.rfq-lines.image');
        Route::delete('/rfq-lines/{rfqLine}/image', [AdminRfqImageController::class, 'destroy'])->whereNumber('rfqLine');
        Route::get('/rfqs/{rfq}/bids', [AdminBidEvaluationController::class, 'show']);
        Route::put('/bid-lines/{bidLine}/evaluation', [AdminBidEvaluationController::class, 'evaluate']);
        Route::post('/rfqs/{rfq}/award', [AdminBidEvaluationController::class, 'award']);
    });

    Route::prefix('admin/rejected-items')->group(function () {
        Route::post('/{supplierRejectionCase}/reconcile-send', [AdminSupplierRejectionController::class, 'reconcileSend'])->middleware('throttle:10,1');
        Route::get('/', [AdminSupplierRejectionController::class, 'index']);
        Route::get('/{supplierRejectionCase}', [AdminSupplierRejectionController::class, 'show']);
        Route::post('/{supplierRejectionCase}/send', [AdminSupplierRejectionController::class, 'send'])->middleware('throttle:supplier-rejection-send');
        Route::post('/{supplierRejectionCase}/resolve', [AdminSupplierRejectionController::class, 'resolve']);
    });

    Route::prefix('plant-manager/procurement')->group(function () {
        Route::get('/forecast-recommendations', [PlantManagerProcurementController::class, 'forecastRecommendations']);
        Route::post('/forecast-requests', [PlantManagerProcurementController::class, 'storeForecastRequest']);
        Route::get('/options', [PlantManagerProcurementController::class, 'options']);
        Route::get('/requests', [PlantManagerProcurementController::class, 'index']);
        Route::post('/requests', [PlantManagerProcurementController::class, 'store']);
        Route::post('/requests/bulk', [PlantManagerProcurementController::class, 'bulkStore']);
        Route::post('/requests/{replenishmentRequest}/submit', [PlantManagerProcurementController::class, 'submit']);
    });

    Route::get('/purchase-orders/approved', [PurchaseOrderController::class, 'approved']);
    Route::get('/purchase-orders', [PurchaseOrderController::class, 'index']);
    Route::post('/purchase-orders/purchasing-options', [PurchaseOrderController::class, 'purchasingOptions']);
    Route::post('/purchase-orders', [PurchaseOrderController::class, 'store']);
    Route::patch('/purchase-orders/{purchaseOrder}/approve', [PurchaseOrderController::class, 'approve']);
    Route::get('/purchase-orders/{purchaseOrder}/pdf', [PurchaseOrderController::class, 'pdf']);
    Route::patch('/purchase-orders/{purchaseOrder}/send', [PurchaseOrderController::class, 'send']);
    Route::post('/purchase-orders/{purchaseOrder}/financial-submissions', [FinancialPurchaseOrderController::class, 'store'])
        ->middleware('throttle:financial-send');
    Route::post('/purchase-orders/{purchaseOrder}/receivings/{receiving}/financial-obligation', [FinancialObligationController::class, 'store'])
        ->middleware('throttle:financial-send');
    Route::get('/admin/receiving-discrepancies', [ReceivingDiscrepancyController::class, 'index']);
    Route::patch('/admin/receiving-discrepancies/{receivingDiscrepancy}', [ReceivingDiscrepancyController::class, 'update']);
    Route::get('/admin/excess-delivery-reviews', [ExcessDeliveryReviewController::class, 'index']);
    Route::post('/admin/excess-delivery-reviews/{excessDeliveryReview}', [ExcessDeliveryReviewController::class, 'update']);
    Route::get('/admin/excess-delivery-reviews/{excessDeliveryReview}/evidence', [ExcessDeliveryReviewController::class, 'evidence']);

    Route::get('/suppliers', [SupplierController::class, 'index']);
    Route::post('/suppliers', [SupplierController::class, 'store']);
    Route::get('/suppliers/{supplier}', [SupplierController::class, 'show']);
    Route::get('/suppliers/{supplier}/purchasing-terms', [SupplierPurchasingTermController::class, 'index']);
    Route::post('/suppliers/{supplier}/purchasing-terms', [SupplierPurchasingTermController::class, 'store']);
    Route::put('/suppliers/{supplier}/purchasing-terms/{purchasingTerm}', [SupplierPurchasingTermController::class, 'update']);
    Route::patch('/suppliers/{supplier}/purchasing-terms/{purchasingTerm}/deactivate', [SupplierPurchasingTermController::class, 'deactivate']);
    Route::get('/suppliers/{supplier}/accreditation', [AdminSupplierAccreditationController::class, 'supplier']);
    Route::post('/suppliers/{supplier}/accreditation/legacy-correction', [AdminSupplierAccreditationController::class, 'correctLegacy'])->middleware('throttle:10,1');
    Route::put('/suppliers/{supplier}', [SupplierController::class, 'update']);
    Route::patch('/suppliers/{supplier}/status', [SupplierController::class, 'updateStatus']);
    Route::post('/suppliers/{supplier}/account-invitation', [SupplierController::class, 'sendAccountInvitation'])->middleware('throttle:invitation-resend');
    Route::post('/suppliers/{supplier}/restore', [SupplierController::class, 'restore']);
    Route::get('/admin/accreditation-requests', [AdminSupplierAccreditationController::class, 'index']);
    Route::get('/admin/accreditation-documents/{document}/download', [SupplierAccreditationController::class, 'document'])->whereNumber('document');
    Route::patch('/admin/accreditation-documents/{document}/verification', [AdminSupplierAccreditationController::class, 'verifyDocument'])->whereNumber('document');
    Route::post('/admin/accreditation-requests/{accreditationRequest}/decision', [AdminSupplierAccreditationController::class, 'decide'])->whereNumber('accreditationRequest');
    Route::delete('/suppliers/{supplier}', [SupplierController::class, 'destroy']);
    Route::get('/admin/supplier-applications', [AdminSupplierApplicationController::class, 'index']);
    Route::get('/admin/supplier-applications/{supplierApplication}', [AdminSupplierApplicationController::class, 'show']);
    Route::get('/admin/supplier-applications/{supplierApplication}/attachments/{attachment}/preview', [AdminSupplierApplicationController::class, 'previewAttachment']);
    Route::get('/admin/supplier-applications/{supplierApplication}/attachments/{attachment}/download', [AdminSupplierApplicationController::class, 'downloadAttachment']);
    Route::post('/admin/supplier-applications/{supplierApplication}/review', [AdminSupplierApplicationController::class, 'startReview']);
    Route::post('/admin/supplier-applications/{supplierApplication}/qualify', [AdminSupplierApplicationController::class, 'qualify']);
    Route::post('/admin/supplier-applications/{supplierApplication}/revision', [AdminSupplierApplicationController::class, 'requestRevision']);
    Route::post('/admin/supplier-applications/{supplierApplication}/approve', [AdminSupplierApplicationController::class, 'approve']);
    Route::post('/admin/supplier-applications/{supplierApplication}/account-invitation/resend', [AdminSupplierApplicationController::class, 'resendAccountInvitation'])->middleware('throttle:invitation-resend');
    Route::patch('/admin/supplier-applications/{supplierApplication}/attachments/{attachment}/verification', [AdminSupplierApplicationController::class, 'verifyAttachment']);
    Route::post('/admin/supplier-applications/{supplierApplication}/reject', [AdminSupplierApplicationController::class, 'reject']);
    Route::post('/admin/supplier-applications/{supplierApplication}/meeting-slots', [AdminSupplierApplicationMeetingController::class, 'store']);
    Route::delete('/admin/supplier-applications/{supplierApplication}/meeting-slots/{meetingSlot}', [AdminSupplierApplicationMeetingController::class, 'destroy']);
    Route::post('/admin/supplier-applications/{supplierApplication}/meeting-slots/{meetingSlot}/complete', [AdminSupplierApplicationMeetingController::class, 'complete']);
    Route::get('/admin/supplier-performance', [AdminSupplierPerformanceController::class, 'index']);
    Route::post('/admin/supplier-performance/{supplier}/snapshots', [AdminSupplierPerformanceController::class, 'snapshot'])->whereNumber('supplier');
    Route::post('/admin/supplier-awards/{supplierAward}/purchase-orders', [AwardPurchaseOrderController::class, 'store'])->whereNumber('supplierAward')->middleware('throttle:10,1');

    Route::get('/admin/logistics/shipments', [AdminLogisticsController::class, 'index']);
    Route::get('/admin/logistics/partners', [AdminLogisticsIntegrationController::class, 'partners']);
    Route::post('/admin/logistics/shipments/{order}/preview', [AdminLogisticsIntegrationController::class, 'preview']);
    Route::post('/admin/logistics/shipments/{order}/send', [AdminLogisticsIntegrationController::class, 'send'])
        ->middleware('throttle:logistics-send');

    Route::prefix('plant-manager/orders')->group(function () {
        Route::get('/', [PlantManagerOrderController::class, 'index']);
        Route::get('/summary', [PlantManagerOrderController::class, 'summary']);
        Route::get('/{order}', [PlantManagerOrderController::class, 'show']);
        Route::post('/{order}/start-preparing', [PlantManagerOrderController::class, 'startPreparing']);
        Route::post('/{order}/ready-for-stock-out', [PlantManagerOrderController::class, 'readyForStockOut']);
    });

    Route::prefix('stock-out')->group(function () {
        Route::get('/summary', [StockOutController::class, 'summary']);
        Route::get('/orders', [StockOutController::class, 'index']);
        Route::get('/orders/{order}', [StockOutController::class, 'show']);
        Route::post('/orders/{order}/start', [StockOutController::class, 'start']);
        Route::post('/orders/{order}/scan', [StockOutController::class, 'scan']);
        Route::post('/orders/{order}/release', [StockOutController::class, 'release']);
    });

    Route::prefix('plant-manager/shipments')->group(function () {
        Route::get('/', [PlantManagerShipmentController::class, 'index']);
        Route::post('/{order}/start-packing', [PlantManagerShipmentController::class, 'startPacking']);
        Route::post('/{order}/mark-ready-for-shipment', [PlantManagerShipmentController::class, 'markReadyForShipment']);
        Route::post('/{order}/forward-to-logistics', [PlantManagerShipmentController::class, 'forwardToLogistics']);
    });
});

Route::get('/public/products/{product}/image', [ProductImageController::class, 'show'])->middleware('throttle:120,1')->name('public.products.image');
