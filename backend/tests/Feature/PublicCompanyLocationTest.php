<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PublicCompanyLocationTest extends TestCase
{
    use RefreshDatabase;

    private const ARCHON_NELL_EMBED = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3679.48874398943!2d121.1010625!3d14.6305374!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397b9485ea55b87%3A0x2e093784a1e3763b!2sArchon%20Nell%20Incorporated!5e1!3m2!1sen!2sph!4v1791469640495!5m2!1sen!2sph';

    private const ARCHON_NELL_DIRECTIONS = 'https://www.google.com/maps/dir/?api=1&destination=14.6305374%2C121.1010625';

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
                    'address' => 'G/F, Brgy. New Marikina Subd., 29 Flamingo, Marikina, 1800 Metro Manila',
                    'latitude' => 14.6305374,
                    'longitude' => 121.1010625,
                    'map_embed_url' => 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3679.48874398943!2d121.1010625!3d14.6305374!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397b9485ea55b87%3A0x2e093784a1e3763b!2sArchon%20Nell%20Incorporated!5e1!3m2!1sen!2sph!4v1791469640495!5m2!1sen!2sph',
                    'directions_url' => 'https://www.google.com/maps/dir/?api=1&destination=14.6305374%2C121.1010625',
                ],
            ]);

        foreach (['id', 'code', 'branch_id', 'capacity', 'status', 'show_on_public_website'] as $internalField) {
            $this->assertArrayNotHasKey($internalField, $response->json('data'));
        }

        $this->assertSame($warehouse->name, $response->json('data.name'));
    }

    public static function mainWarehouseCodes(): array
    {
        return [
            'local seed code' => ['WH-MAIN'],
            'production code' => ['WH-PAMP'],
        ];
    }

    #[DataProvider('mainWarehouseCodes')]
    public function test_local_and_production_main_warehouse_codes_share_the_archon_nell_place(string $code): void
    {
        $this->warehouse(['code' => $code, 'show_on_public_website' => true]);

        $this->getJson('/api/public/company-location')
            ->assertOk()
            ->assertJsonPath('data.map_embed_url', self::ARCHON_NELL_EMBED)
            ->assertJsonPath('data.directions_url', self::ARCHON_NELL_DIRECTIONS);

        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);

        $this->actingAs($admin)
            ->getJson('/api/admin/warehouse/location')
            ->assertOk()
            ->assertJsonPath('code', $code)
            ->assertJsonPath('map_embed_url', self::ARCHON_NELL_EMBED)
            ->assertJsonPath('directions_url', self::ARCHON_NELL_DIRECTIONS);
    }

    public function test_other_warehouse_codes_keep_the_coordinate_embed(): void
    {
        $this->warehouse(['code' => 'WH-OTHER', 'show_on_public_website' => true]);

        $this->getJson('/api/public/company-location')
            ->assertOk()
            ->assertJsonPath('data.map_embed_url', 'https://www.google.com/maps?q=14.6305374%2C121.1010625&z=15&output=embed')
            ->assertJsonPath('data.directions_url', self::ARCHON_NELL_DIRECTIONS);
    }

    public function test_main_warehouse_codes_are_configurable(): void
    {
        config(['services.google_maps.main_warehouse_place.warehouse_codes' => ['WH-CUSTOM']]);
        $this->warehouse(['code' => 'WH-CUSTOM', 'show_on_public_website' => true]);

        $this->getJson('/api/public/company-location')
            ->assertOk()
            ->assertJsonPath('data.map_embed_url', self::ARCHON_NELL_EMBED);
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
            'address' => 'G/F, Brgy. New Marikina Subd., 29 Flamingo, Marikina, 1800 Metro Manila',
            'latitude' => 14.6305374,
            'longitude' => 121.1010625,
            'capacity' => 1000,
            'status' => 'Active',
            'show_on_public_website' => false,
        ], $overrides));
    }
}
