<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicCompanyLocationTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_an_explicitly_public_active_location_is_returned(): void
    {
        $private = $this->warehouse(['show_on_public_website' => false]);

        $this->getJson('/api/public/company-location')
            ->assertOk()
            ->assertExactJson(['data' => null]);

        $private->update(['show_on_public_website' => true, 'status' => 'Inactive']);

        $this->getJson('/api/public/company-location')
            ->assertOk()
            ->assertExactJson(['data' => null]);
    }

    public function test_public_location_response_contains_only_whitelisted_fields(): void
    {
        $warehouse = $this->warehouse(['show_on_public_website' => true]);

        $response = $this->getJson('/api/public/company-location')
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    'name' => 'Main Warehouse',
                    'address' => '123 Public Business Road',
                    'latitude' => 14.6352911,
                    'longitude' => 121.0884979,
                ],
            ]);

        foreach (['id', 'code', 'branch_id', 'capacity', 'status', 'show_on_public_website'] as $internalField) {
            $this->assertArrayNotHasKey($internalField, $response->json('data'));
        }

        $this->assertSame($warehouse->name, $response->json('data.name'));
    }

    public function test_admin_controls_public_visibility_and_guests_cannot_mutate_location(): void
    {
        $warehouse = $this->warehouse();
        $payload = [
            'name' => $warehouse->name,
            'code' => $warehouse->code,
            'address' => $warehouse->address,
            'latitude' => (float) $warehouse->latitude,
            'longitude' => (float) $warehouse->longitude,
            'capacity' => $warehouse->capacity,
            'status' => 'Active',
            'show_on_public_website' => true,
        ];

        $this->putJson('/api/admin/warehouse/location', $payload)->assertUnauthorized();

        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);

        $this->actingAs($admin)
            ->putJson('/api/admin/warehouse/location', $payload)
            ->assertOk()
            ->assertJsonPath('show_on_public_website', true);

        $this->assertDatabaseHas('warehouses', [
            'id' => $warehouse->id,
            'show_on_public_website' => true,
        ]);
    }

    private function warehouse(array $overrides = []): Warehouse
    {
        $branch = Branch::firstOrCreate(
            ['code' => 'MAIN'],
            ['name' => 'Main Branch'],
        );

        return Warehouse::create(array_merge([
            'name' => 'Main Warehouse',
            'code' => 'WH-MAIN',
            'branch_id' => $branch->id,
            'address' => '123 Public Business Road',
            'latitude' => 14.6352911,
            'longitude' => 121.0884979,
            'capacity' => 1000,
            'status' => 'Active',
            'show_on_public_website' => false,
        ], $overrides));
    }
}
