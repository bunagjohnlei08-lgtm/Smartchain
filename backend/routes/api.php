<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\StockInController;
use App\Http\Controllers\Api\ReceivingController;
use App\Http\Controllers\Api\QaInspectionController;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

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

    Route::get('/qa/inspections', [QaInspectionController::class, 'index']);
    Route::get('/qa/inspections/{receivingId}', [QaInspectionController::class, 'show']);
    Route::post('/qa/inspections/{receivingId}', [QaInspectionController::class, 'store']);
    Route::put('/qa/inspections/{receivingId}', [QaInspectionController::class, 'update']);
});
