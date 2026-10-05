<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierAlias;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupplierManagementTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Acme Chemicals',
            'contact_person' => 'Juan Dela Cruz',
            'email' => 'orders@acme.test',
            'phone' => '09123456789',
            'address' => 'Makati City',
            'payment_terms' => 'Net 30',
            'status' => 'ACTIVE',
            'notes' => null,
        ], $overrides);
    }

    private function create(array $overrides = [])
    {
        return $this->actingAs($this->admin)->postJson('/api/suppliers', $this->payload($overrides));
    }

    private static function code(int $id): string
    {
        return 'SUP-'.str_pad((string) $id, 3, '0', STR_PAD_LEFT);
    }

    // ---- Supplier code -------------------------------------------------------

    public function test_supplier_code_is_generated_from_primary_key(): void
    {
        $response = $this->create()->assertCreated()
            ->assertJsonPath('data.name', 'Acme Chemicals')
            ->assertJsonPath('data.email', 'orders@acme.test');

        $supplier = Supplier::findOrFail($response->json('data.id'));
        $this->assertSame(self::code($supplier->id), $supplier->supplier_code);
        $response->assertJsonPath('data.supplier_code', self::code($supplier->id));
        $this->assertSame('id', $supplier->getKeyName());
        $this->assertTrue($supplier->getIncrementing());
    }

    public function test_generated_supplier_codes_are_unique(): void
    {
        $first = $this->create(['name' => 'First'])->assertCreated()->json('data.supplier_code');
        $second = $this->create(['name' => 'Second'])->assertCreated()->json('data.supplier_code');

        $this->assertNotSame($first, $second);
        $this->assertSame(1, Supplier::query()->where('supplier_code', $first)->count());
        $this->assertSame(0, Supplier::query()->where('supplier_code', 'like', 'TMP-%')->count());
    }

    public function test_client_cannot_supply_supplier_code_on_create(): void
    {
        $this->create(['supplier_code' => 'SUP-CHOSEN'])
            ->assertUnprocessable()->assertJsonValidationErrors('supplier_code');

        $this->assertDatabaseCount('suppliers', 0);
    }

    public function test_existing_supplier_codes_are_preserved(): void
    {
        $legacy = Supplier::create(['supplier_code' => 'SUP-LEGACY-7', 'name' => 'Legacy', 'status' => 'ACTIVE']);

        $this->create()->assertCreated();

        $this->assertSame('SUP-LEGACY-7', $legacy->fresh()->supplier_code);
    }

    public function test_generated_code_skips_value_already_held_by_legacy_record(): void
    {
        $legacy = Supplier::create(['supplier_code' => 'SUP-LEGACY', 'name' => 'Legacy', 'status' => 'ACTIVE']);
        $derived = self::code($legacy->id + 1);
        $legacy->update(['supplier_code' => $derived]);

        $response = $this->create()->assertCreated();

        $this->assertSame($legacy->id + 1, $response->json('data.id'));
        $this->assertSame($derived.'-2', $response->json('data.supplier_code'));
        $this->assertSame($derived, $legacy->fresh()->supplier_code);
    }

    public function test_edit_cannot_change_supplier_code(): void
    {
        $supplier = Supplier::findOrFail($this->create()->json('data.id'));
        $code = $supplier->supplier_code;

        $this->actingAs($this->admin)->putJson('/api/suppliers/'.$supplier->id, $this->payload(['supplier_code' => 'SUP-HIJACK']))
            ->assertUnprocessable()->assertJsonValidationErrors('supplier_code');
        $this->assertSame($code, $supplier->fresh()->supplier_code);

        $this->actingAs($this->admin)->putJson('/api/suppliers/'.$supplier->id, $this->payload(['name' => 'Acme Renamed']))
            ->assertOk()
            ->assertJsonPath('data.name', 'Acme Renamed')
            ->assertJsonPath('data.supplier_code', $code);
    }

    public function test_non_admin_cannot_create_suppliers(): void
    {
        $role = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $manager = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);

        $this->actingAs($manager)->postJson('/api/suppliers', $this->payload())->assertForbidden();
        $this->assertDatabaseCount('suppliers', 0);
    }

    public function test_admin_can_add_update_and_remove_normalized_aliases(): void
    {
        $response = $this->create(['aliases' => ['  Acme   Legacy Trading  ']])->assertCreated()
            ->assertJsonPath('data.aliases.0.alias', 'Acme Legacy Trading');
        $supplier = Supplier::findOrFail($response->json('data.id'));
        $this->assertDatabaseHas('supplier_aliases', [
            'supplier_id' => $supplier->id, 'normalized_alias' => 'acme legacy trading',
        ]);

        $this->actingAs($this->admin)->putJson('/api/suppliers/'.$supplier->id, $this->payload(['aliases' => ['Former Acme']]))
            ->assertOk()->assertJsonPath('data.aliases.0.alias', 'Former Acme');
        $this->assertDatabaseMissing('supplier_aliases', ['normalized_alias' => 'acme legacy trading']);

        $this->actingAs($this->admin)->putJson('/api/suppliers/'.$supplier->id, $this->payload(['aliases' => []]))->assertOk();
        $this->assertDatabaseCount('supplier_aliases', 0);
    }

    public function test_edit_without_alias_field_preserves_historical_aliases(): void
    {
        $response = $this->create(['aliases' => ['Historical Purchase Order Name']])->assertCreated();
        $supplier = Supplier::findOrFail($response->json('data.id'));

        $this->actingAs($this->admin)->putJson('/api/suppliers/'.$supplier->id, $this->payload([
            'name' => 'Acme Chemicals Updated',
            'notes' => 'Updated without exposing aliases in the form.',
        ]))->assertOk()
            ->assertJsonPath('data.name', 'Acme Chemicals Updated')
            ->assertJsonPath('data.aliases.0.alias', 'Historical Purchase Order Name');

        $this->assertDatabaseHas('supplier_aliases', [
            'supplier_id' => $supplier->id,
            'alias' => 'Historical Purchase Order Name',
            'normalized_alias' => 'historical purchase order name',
        ]);
    }

    public function test_duplicate_and_cross_supplier_alias_conflicts_are_rejected(): void
    {
        $first = Supplier::findOrFail($this->create(['name' => 'First Supplier', 'aliases' => ['Legacy Name']])->assertCreated()->json('data.id'));
        $this->create(['name' => 'Second Supplier', 'aliases' => [' legacy   NAME ']])
            ->assertUnprocessable()->assertJsonValidationErrors('aliases');
        $this->create(['name' => 'Third Supplier', 'aliases' => ['First Supplier']])
            ->assertUnprocessable()->assertJsonValidationErrors('aliases');
        $this->actingAs($this->admin)->putJson('/api/suppliers/'.$first->id, $this->payload([
            'name' => 'First Supplier', 'aliases' => ['Duplicate', ' duplicate '],
        ]))->assertUnprocessable()->assertJsonValidationErrors('aliases');
        $this->assertSame(1, SupplierAlias::query()->count());
    }

    public function test_non_admins_and_guests_cannot_manage_aliases(): void
    {
        $supplier = Supplier::findOrFail($this->create()->assertCreated()->json('data.id'));
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $payload = $this->payload(['aliases' => ['Unauthorized Alias']]);

        $this->actingAs(User::factory()->create(['role_id' => $qaRole->id, 'status' => 'ACTIVE']))
            ->putJson('/api/suppliers/'.$supplier->id, $payload)->assertForbidden();
        $this->actingAs(User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']))
            ->putJson('/api/suppliers/'.$supplier->id, $payload)->assertForbidden();
        $this->assertDatabaseCount('supplier_aliases', 0);
    }

    public function test_guest_cannot_manage_aliases(): void
    {
        $supplier = Supplier::create(['supplier_code' => 'SUP-GUEST', 'name' => 'Guest Test', 'status' => 'ACTIVE']);
        $this->putJson('/api/suppliers/'.$supplier->id, $this->payload(['aliases' => ['Unauthorized Alias']]))->assertUnauthorized();
        $this->assertDatabaseCount('supplier_aliases', 0);
    }

    // ---- Phone ---------------------------------------------------------------

    public function test_eleven_digit_phone_is_accepted_and_keeps_leading_zero(): void
    {
        $response = $this->create(['phone' => '09123456789'])->assertCreated()
            ->assertJsonPath('data.phone', '09123456789');

        $this->assertSame('09123456789', Supplier::findOrFail($response->json('data.id'))->phone);
    }

    public function test_phone_is_optional(): void
    {
        $this->create(['phone' => null])->assertCreated()->assertJsonPath('data.phone', null);
    }

    public function test_twelve_digit_phone_is_rejected(): void
    {
        $this->create(['phone' => '091234567890'])->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->assertDatabaseCount('suppliers', 0);
    }

    public function test_letters_symbols_and_spaces_are_rejected(): void
    {
        foreach (['0912345678a', 'phone', '+639123456', '0912-345-67', '0912 345 67'] as $phone) {
            $this->create(['phone' => $phone])->assertUnprocessable()->assertJsonValidationErrors('phone');
        }
        $this->assertDatabaseCount('suppliers', 0);
    }

    public function test_phone_rules_apply_on_edit(): void
    {
        $id = $this->create()->json('data.id');

        $this->actingAs($this->admin)->putJson('/api/suppliers/'.$id, $this->payload(['phone' => '091234567890']))
            ->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->actingAs($this->admin)->putJson('/api/suppliers/'.$id, $this->payload(['phone' => '0917abc4567']))
            ->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->actingAs($this->admin)->putJson('/api/suppliers/'.$id, $this->payload(['phone' => '09171234567']))
            ->assertOk()->assertJsonPath('data.phone', '09171234567');
    }
}
