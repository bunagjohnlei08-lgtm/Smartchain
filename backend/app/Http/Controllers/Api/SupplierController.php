<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Models\SupplierAlias;
use App\Models\PurchaseOrder;
use App\Models\User;
use App\Support\SupplierName;
use App\Support\SupplierLifecycle;
use App\Support\AuditLogger;
use App\Support\UserInvitations;
use App\Services\SupplierAccountInvitationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SupplierController extends Controller
{
    public function __construct(private readonly SupplierAccountInvitationService $accountInvitations) {}

    private const OPERATIONAL_STATUSES = [
        Supplier::STATUS_ACTIVE,
        Supplier::STATUS_ON_HOLD,
        Supplier::STATUS_INACTIVE,
    ];

    private const FILTER_STATUSES = [
        ...self::OPERATIONAL_STATUSES,
        Supplier::STATUS_PENDING_REMOVAL,
        Supplier::STATUS_ARCHIVED,
    ];

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(self::FILTER_STATUSES)],
        ]);

        $suppliers = Supplier::query()->with(['aliases', 'authorizedAccount.role', 'authorizedAccount.latestInvitation'])
            ->withCount(['purchaseOrders as open_purchase_orders_count' => fn ($query) => $query->whereIn('status', PurchaseOrder::ACTIVE_STATUSES)])
            ->when($validated['search'] ?? null, function ($query, string $search) {
                $term = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
                $query->where(function ($nested) use ($term) {
                    $nested->where('supplier_code', 'ilike', $term)
                        ->orWhere('name', 'ilike', $term)
                        ->orWhere('contact_person', 'ilike', $term)
                        ->orWhere('email', 'ilike', $term)
                        ->orWhere('phone', 'ilike', $term)
                        ->orWhere('address', 'ilike', $term);
                });
            })
            ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
            ->orderBy('name')
            ->get();

        $emails = $suppliers->filter(fn (Supplier $supplier) => ! $supplier->authorizedAccount)
            ->map(fn (Supplier $supplier) => mb_strtolower(trim((string) $supplier->email)))->filter()->unique();
        $usedEmails = User::query()->whereIn(DB::raw('LOWER(email)'), $emails)
            ->with('role:id,slug')->get(['id','email','role_id','status','supplier_id'])
            ->groupBy(fn (User $user) => mb_strtolower($user->email));

        return response()->json(['data' => $suppliers->map(fn (Supplier $supplier) => $this->present(
            $supplier, isset($usedEmails[mb_strtolower(trim((string) $supplier->email))]),
            $usedEmails->get(mb_strtolower(trim((string) $supplier->email)), collect())
        ))]);
    }

    public function show(Request $request, Supplier $supplier): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $supplier->load(['aliases', 'authorizedAccount.role', 'authorizedAccount.latestInvitation'])->loadCount(['purchaseOrders as open_purchase_orders_count' => fn ($query) => $query->whereIn('status', PurchaseOrder::ACTIVE_STATUSES)]);

        return response()->json(['data' => $this->present($supplier)]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate($this->rules());
        $this->validateNames($validated);

        $supplier = DB::transaction(function () use ($validated) {
            // supplier_code is NOT NULL: hold a throwaway unique value until the
            // database has assigned the id the real code is derived from. The
            // placeholder never leaves this transaction.
            $supplier = new Supplier($validated);
            $supplier->forceFill(['supplier_code' => 'TMP-'.Str::uuid()])->save();
            $supplier->forceFill(['supplier_code' => $this->generateSupplierCode($supplier)])->save();
            $this->syncAliases($supplier, $validated['aliases'] ?? []);

            return $supplier->load('aliases');
        });

        return response()->json(['data' => $this->present($supplier->fresh('aliases'))], 201);
    }

    public function update(Request $request, Supplier $supplier): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        abort_if(in_array($supplier->status, [Supplier::STATUS_PENDING_REMOVAL, Supplier::STATUS_ARCHIVED], true), 422, 'Removed suppliers cannot be edited.');
        $validated = $request->validate($this->rules());
        $this->validateNames($validated, $supplier);
        DB::transaction(function () use ($supplier, $validated) {
            $supplier->update(collect($validated)->except('aliases')->all());
            if (array_key_exists('aliases', $validated)) {
                $this->syncAliases($supplier, $validated['aliases']);
            }
        });
        return response()->json(['data' => $this->present($supplier->fresh('aliases'))]);
    }

    public function updateStatus(Request $request, Supplier $supplier): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        abort_if(in_array($supplier->status, [Supplier::STATUS_PENDING_REMOVAL, Supplier::STATUS_ARCHIVED], true), 422, 'Use the supplier recovery workflow to change this status.');
        $supplier->update($request->validate(['status' => ['required', Rule::in([
            Supplier::STATUS_ACTIVE,
            Supplier::STATUS_ON_HOLD,
            Supplier::STATUS_INACTIVE,
        ])]]));
        return response()->json(['data' => $this->present($supplier->fresh())]);
    }

    public function sendAccountInvitation(Request $request, Supplier $supplier): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $issued = $this->accountInvitations->issue($supplier, $request->user());
        $sent = UserInvitations::send($issued['user'], $issued['invitation'], $issued['token']);

        AuditLogger::log('SUPPLIER_ACCOUNT_INVITATION_SENT', AuditLogger::MODULE_SUPPLIERS, [
            'status' => $sent ? 'SUCCESS' : 'FAILURE',
            'actor' => $request->user(),
            'resource' => $issued['user'],
            'resource_label' => $supplier->supplier_code,
            'details' => $sent ? 'Supplier activation invitation accepted by the mail transport.' : 'Supplier activation invitation could not be sent.',
            'metadata' => ['supplier_id' => $supplier->id, 'invitation_id' => $issued['invitation']->id],
        ]);

        return response()->json([
            'message' => $sent
                ? 'Account activation invitation sent to the supplier\'s registered email. RFQ bidding remains subject to accreditation requirements.'
                : 'The activation invitation could not be sent. Please try again.',
            'account' => $this->accountInvitations->state($supplier->fresh()),
        ], $sent ? 200 : 502);
    }

    public function destroy(Request $request, Supplier $supplier, SupplierLifecycle $lifecycle): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $result = $lifecycle->requestRemoval($supplier, $request->user());

        return response()->json([
            'data' => $this->present($result['supplier']),
            'message' => $result['changed']
                ? 'Supplier removed from active use. It can be restored within 30 days.'
                : 'Supplier is already within the 30-day recovery period.',
        ]);
    }

    public function restore(Request $request, Supplier $supplier, SupplierLifecycle $lifecycle): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $result = $lifecycle->restore($supplier, $request->user());

        if ($result['expired']) {
            return response()->json([
                'message' => 'The 30-day recovery period has expired. The supplier has been archived.',
                'data' => $this->present($result['supplier']),
            ], 422);
        }

        return response()->json([
            'data' => $this->present($result['supplier']),
            'message' => $result['restored'] ? 'Supplier restored successfully.' : 'Supplier is already active.',
        ]);
    }

    /**
     * SUP-<id zero-padded to 3>. Derived from the database-assigned primary
     * key, so concurrent creations never compute the same code. Older codes
     * were typed by hand; if one already holds the value, a suffix keeps it
     * unique.
     */
    private function generateSupplierCode(Supplier $supplier): string
    {
        $base = 'SUP-'.str_pad((string) $supplier->getKey(), 3, '0', STR_PAD_LEFT);
        $candidate = $base;

        for ($suffix = 2; Supplier::query()->where('supplier_code', $candidate)->whereKeyNot($supplier->getKey())->exists(); $suffix++) {
            $candidate = $base.'-'.$suffix;
        }

        return $candidate;
    }

    private function rules(): array
    {
        return [
            // Server-generated and immutable.
            'supplier_code' => ['prohibited'],
            'name' => ['required', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            // Philippine numbers, digits only, kept as a string for the leading 0.
            'phone' => ['nullable', 'string', 'regex:/^[0-9]+$/', 'max:11'],
            'address' => ['nullable', 'string', 'max:2000'],
            'status' => ['required', Rule::in(self::OPERATIONAL_STATUSES)],
            'payment_terms' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'aliases' => ['sometimes', 'array', 'max:20'],
            'aliases.*' => ['required', 'string', 'max:255'],
        ];
    }

    private function present(Supplier $supplier, ?bool $emailConflict = null, ?Collection $matchingUsers = null): array
    {
        $deadline = $supplier->recoveryDeadline();
        $openPurchaseOrders = array_key_exists('open_purchase_orders_count', $supplier->getAttributes())
            ? (int) $supplier->open_purchase_orders_count
            : $supplier->purchaseOrders()->whereIn('status', PurchaseOrder::ACTIVE_STATUSES)->count();

        return [
            ...$supplier->toArray(),
            'open_purchase_orders_count' => $openPurchaseOrders,
            'recovery_deadline' => $deadline?->toIso8601String(),
            'restore_allowed' => $supplier->canBeRestored(),
            'recovery_days_remaining' => $supplier->canBeRestored()
                ? max(1, now(Supplier::BUSINESS_TIMEZONE)->startOfDay()->diffInDays($deadline->copy()->startOfDay(), false))
                : 0,
            'account' => $this->accountInvitations->state($supplier, $emailConflict, $matchingUsers),
        ];
    }

    private function validateNames(array &$validated, ?Supplier $supplier = null): void
    {
        $aliasesWereSubmitted = array_key_exists('aliases', $validated);
        $aliases = collect($validated['aliases'] ?? [])->map(fn ($alias) => SupplierName::display($alias));
        $normalized = $aliases->map(fn ($alias) => SupplierName::normalize($alias));
        $errors = [];

        if ($normalized->contains('')) $errors['aliases'] = ['Recognized supplier names cannot be empty.'];
        if ($normalized->duplicates()->isNotEmpty()) $errors['aliases'] = ['Recognized supplier names must be unique.'];

        $primary = SupplierName::normalize($validated['name'] ?? $supplier?->name);
        if ($normalized->contains($primary)) $errors['aliases'] = ['The primary supplier name does not need to be added as an alias.'];

        foreach ($normalized->unique() as $name) {
            if ($name === '') continue;
            $aliasConflict = SupplierAlias::query()->where('normalized_alias', $name)
                ->when($supplier, fn ($query) => $query->where('supplier_id', '!=', $supplier->id))->exists();
            $nameConflict = Supplier::query()->whereRaw("LOWER(REGEXP_REPLACE(TRIM(name), '\\s+', ' ', 'g')) = ?", [$name])
                ->when($supplier, fn ($query) => $query->whereKeyNot($supplier->id))->exists();
            if ($aliasConflict || $nameConflict) {
                $errors['aliases'] = ['A recognized supplier name conflicts with another registered supplier.'];
                break;
            }
        }

        $primaryAliasConflict = SupplierAlias::query()->where('normalized_alias', $primary)
            ->when($supplier, fn ($query) => $query->where('supplier_id', '!=', $supplier->id))->exists();
        if ($primaryAliasConflict) $errors['name'] = ['This supplier name conflicts with another supplier alias.'];
        if ($errors) throw ValidationException::withMessages($errors);

        if ($aliasesWereSubmitted) {
            $validated['aliases'] = $aliases->values()->all();
        }
    }

    private function syncAliases(Supplier $supplier, array $aliases): void
    {
        $supplier->aliases()->delete();
        $supplier->aliases()->createMany(collect($aliases)->map(fn ($alias) => [
            'alias' => SupplierName::display($alias),
            'normalized_alias' => SupplierName::normalize($alias),
        ])->all());
    }
}
