<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\InventoryHistoryController;
use App\Http\Controllers\Api\StockInController;
use App\Http\Controllers\Api\ReceivingController;
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
use App\Http\Controllers\Api\PlantManagerShipmentController;
use App\Http\Controllers\Api\PlantManagerReceivingNoteController;
use App\Http\Controllers\Api\PlantManagerProcurementController;
use App\Http\Controllers\Api\PurchaseOrderController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\PlantManagerDashboardController;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/admin/dashboard', [DashboardController::class, 'index']);
    Route::get('/plant-manager/dashboard', [PlantManagerDashboardController::class, 'index']);

    Route::get('/users/statistics', [UserController::class, 'statistics']);
    Route::get('/users', [UserController::class, 'index']);
    Route::get('/users/{id}', [UserController::class, 'show']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/users/{id}', [UserController::class, 'update']);
    Route::post('/users/{id}/approve', [UserController::class, 'approve']);
    Route::post('/users/{id}/suspend', [UserController::class, 'suspend']);
    Route::post('/users/{id}/activate', [UserController::class, 'activate']);

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

    Route::get('/receivings', [ReceivingController::class, 'index']);
    Route::get('/receivings/{id}', [ReceivingController::class, 'show']);
    Route::post('/receivings', [ReceivingController::class, 'store']);

    Route::put('/plant-manager/receivings/{receiving}/notes', [PlantManagerReceivingNoteController::class, 'update']);

    Route::get('/qa/inspections', [QaInspectionController::class, 'index']);
    Route::get('/qa/dashboard', [QaDashboardController::class, 'index']);
    Route::get('/qa/inspection-history', [QaInspectionHistoryController::class, 'index']);
    Route::get('/qa/rejected-items', [QaRejectedItemsController::class, 'index']);
    Route::get('/qa/quality-reports', [QaQualityReportController::class, 'index']);
    Route::get('/qa/inspections/{receivingId}', [QaInspectionController::class, 'show']);
    Route::post('/qa/inspections/{receivingId}', [QaInspectionController::class, 'store']);
    Route::put('/qa/inspections/{receivingId}', [QaInspectionController::class, 'update']);

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

    Route::prefix('plant-manager/procurement')->group(function () {
        Route::get('/options', [PlantManagerProcurementController::class, 'options']);
        Route::get('/requests', [PlantManagerProcurementController::class, 'index']);
        Route::post('/requests', [PlantManagerProcurementController::class, 'store']);
        Route::post('/requests/{replenishmentRequest}/submit', [PlantManagerProcurementController::class, 'submit']);
    });

    Route::get('/purchase-orders/approved', [PurchaseOrderController::class, 'approved']);
    Route::get('/purchase-orders', [PurchaseOrderController::class, 'index']);
    Route::post('/purchase-orders', [PurchaseOrderController::class, 'store']);
    Route::patch('/purchase-orders/{purchaseOrder}/send', [PurchaseOrderController::class, 'send']);

    Route::get('/suppliers', [SupplierController::class, 'index']);
    Route::post('/suppliers', [SupplierController::class, 'store']);
    Route::get('/suppliers/{supplier}', [SupplierController::class, 'show']);
    Route::put('/suppliers/{supplier}', [SupplierController::class, 'update']);
    Route::patch('/suppliers/{supplier}/status', [SupplierController::class, 'updateStatus']);
    Route::delete('/suppliers/{supplier}', [SupplierController::class, 'destroy']);

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
        Route::post('/{order}/forward-to-logistics', [PlantManagerShipmentController::class, 'forwardToLogistics']);
    });
});
