<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\InventoryHistoryController;
use App\Http\Controllers\Api\StockInController;
use App\Http\Controllers\Api\ReceivingController;
use App\Http\Controllers\Api\ReceivingDiscrepancyController;
use App\Http\Controllers\Api\QaInspectionController;
use App\Http\Controllers\Api\QaInspectionHistoryController;
use App\Http\Controllers\Api\QaRejectedItemsController;
use App\Http\Controllers\Api\QaQualityReportController;
use App\Http\Controllers\Api\QaDashboardController;
use App\Http\Controllers\Api\AdminOrderController;
use App\Http\Controllers\Api\PlantManagerOrderController;
use App\Http\Controllers\Api\StockOutController;
use App\Http\Controllers\Api\AdminLogisticsController;
use App\Http\Controllers\Api\AdminProcurementController;
use App\Http\Controllers\Api\AdminSupplierRejectionController;
use App\Http\Controllers\Api\PlantManagerShipmentController;
use App\Http\Controllers\Api\PlantManagerReceivingNoteController;
use App\Http\Controllers\Api\PlantManagerProcurementController;
use App\Http\Controllers\Api\PurchaseOrderController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\PlantManagerDashboardController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\AdminReportController;
use App\Http\Controllers\Api\AdminWarehouseLocationController;
use App\Http\Controllers\Api\PlantManagerWarehouseController;
use App\Http\Controllers\Api\ReportsController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\SupplierApplicationController;
use App\Http\Controllers\Api\AdminSupplierApplicationController;
use App\Http\Controllers\Api\AdminSupplierPerformanceController;
use App\Http\Controllers\Api\QaInventoryAuditController;
use App\Http\Controllers\Api\AdminInventoryAuditController;
use App\Http\Controllers\Api\InventoryAuditEvidenceController;

Route::post('/login', [AuthController::class, 'login']);
Route::post('/supplier-applications', [SupplierApplicationController::class, 'store'])->middleware('throttle:supplier-applications');

// Second login step. Public (no token exists yet) but throttled and bound to
// a single-use challenge; a token is issued only by verify-otp.
Route::post('/login/verify-otp', [AuthController::class, 'verifyOtp'])->middleware('throttle:login-otp-verify');
Route::post('/login/resend-otp', [AuthController::class, 'resendOtp'])->middleware('throttle:login-otp-resend');

Route::post('/forgot-password', [PasswordResetController::class, 'requestCode'])->middleware('throttle:password-reset-request');
Route::post('/forgot-password/resend', [PasswordResetController::class, 'resend'])->middleware('throttle:password-reset-resend');
Route::post('/forgot-password/verify', [PasswordResetController::class, 'verify'])->middleware('throttle:password-reset-verify');
Route::post('/forgot-password/reset', [PasswordResetController::class, 'reset'])->middleware('throttle:password-reset-complete');

// Public activation-link endpoints. No token is issued by either.
Route::middleware('throttle:invitations')->group(function () {
    Route::post('/invitations/validate', [InvitationController::class, 'check']);
    Route::post('/invitations/accept', [InvitationController::class, 'accept']);
});

Route::middleware(['auth:sanctum', 'active', 'idle'])->group(function () {
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
    Route::apiResource('/admin/products', ProductController::class);
    Route::get('/plant-manager/dashboard', [PlantManagerDashboardController::class, 'index']);
    Route::get('/plant-manager/warehouse', [PlantManagerWarehouseController::class, 'show']);
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
    Route::delete('/inventory/{id}', [InventoryController::class, 'destroy']);

    Route::get('/stock-in/receivings', [StockInController::class, 'index']);
    Route::get('/stock-in/history', [StockInController::class, 'history']);
    Route::get('/stock-in/recently-stocked', [StockInController::class, 'recentStockedIn']);
    Route::get('/stock-in/receivings/{id}', [StockInController::class, 'show']);
    Route::post('/stock-in/receivings/{id}/stock-in', [StockInController::class, 'performStockIn']);

    Route::get('/receivings/qa-assignees', [ReceivingController::class, 'qaAssignees']);
    Route::get('/receivings', [ReceivingController::class, 'index']);
    Route::post('/receivings', [ReceivingController::class, 'store']);
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
    });

    Route::prefix('admin/rejected-items')->group(function () {
        Route::get('/', [AdminSupplierRejectionController::class, 'index']);
        Route::get('/{supplierRejectionCase}', [AdminSupplierRejectionController::class, 'show']);
        Route::post('/{supplierRejectionCase}/send', [AdminSupplierRejectionController::class, 'send'])->middleware('throttle:supplier-rejection-send');
        Route::post('/{supplierRejectionCase}/resolve', [AdminSupplierRejectionController::class, 'resolve']);
    });

    Route::prefix('plant-manager/procurement')->group(function () {
        Route::get('/options', [PlantManagerProcurementController::class, 'options']);
        Route::get('/requests', [PlantManagerProcurementController::class, 'index']);
        Route::post('/requests', [PlantManagerProcurementController::class, 'store']);
        Route::post('/requests/{replenishmentRequest}/submit', [PlantManagerProcurementController::class, 'submit']);
    });

    Route::get('/purchase-orders/approved', [PurchaseOrderController::class, 'approved']);
    Route::get('/purchase-orders', [PurchaseOrderController::class, 'index']);
    Route::post('/purchase-orders', [PurchaseOrderController::class, 'store']);
    Route::get('/purchase-orders/{purchaseOrder}/pdf', [PurchaseOrderController::class, 'pdf']);
    Route::patch('/purchase-orders/{purchaseOrder}/send', [PurchaseOrderController::class, 'send']);
    Route::get('/admin/receiving-discrepancies', [ReceivingDiscrepancyController::class, 'index']);
    Route::patch('/admin/receiving-discrepancies/{receivingDiscrepancy}', [ReceivingDiscrepancyController::class, 'update']);

    Route::get('/suppliers', [SupplierController::class, 'index']);
    Route::post('/suppliers', [SupplierController::class, 'store']);
    Route::get('/suppliers/{supplier}', [SupplierController::class, 'show']);
    Route::put('/suppliers/{supplier}', [SupplierController::class, 'update']);
    Route::patch('/suppliers/{supplier}/status', [SupplierController::class, 'updateStatus']);
    Route::delete('/suppliers/{supplier}', [SupplierController::class, 'destroy']);
    Route::get('/admin/supplier-applications', [AdminSupplierApplicationController::class, 'index']);
    Route::get('/admin/supplier-applications/{supplierApplication}', [AdminSupplierApplicationController::class, 'show']);
    Route::get('/admin/supplier-applications/{supplierApplication}/attachments/{attachment}/preview', [AdminSupplierApplicationController::class, 'previewAttachment']);
    Route::get('/admin/supplier-applications/{supplierApplication}/attachments/{attachment}/download', [AdminSupplierApplicationController::class, 'downloadAttachment']);
    Route::post('/admin/supplier-applications/{supplierApplication}/review', [AdminSupplierApplicationController::class, 'startReview']);
    Route::post('/admin/supplier-applications/{supplierApplication}/approve', [AdminSupplierApplicationController::class, 'approve']);
    Route::post('/admin/supplier-applications/{supplierApplication}/reject', [AdminSupplierApplicationController::class, 'reject']);
    Route::get('/admin/supplier-performance', [AdminSupplierPerformanceController::class, 'index']);

    Route::get('/admin/logistics/shipments', [AdminLogisticsController::class, 'index']);

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
