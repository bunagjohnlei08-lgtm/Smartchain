<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\SupplierAward;
use App\Services\AwardPurchaseOrderService;
use Illuminate\Http\{JsonResponse,Request};
class AwardPurchaseOrderController extends Controller
{
    public function store(Request $request,SupplierAward $supplierAward,AwardPurchaseOrderService $service):JsonResponse
    {
        abort_unless($request->user()->isAdmin(),403);
        $result=$service->convert($supplierAward,$request->user());
        return response()->json(['data'=>$result['orders']],$result['created']?201:200);
    }
}
