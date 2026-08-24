<?php

namespace Tests\Feature;

use App\Models\Receiving;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReceivingNotesTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $slug): User
    {
        $role = Role::create(['name' => $slug, 'slug' => $slug]);

        return User::factory()->create(['role_id' => $role->id]);
    }

    private function receiving(): Receiving
    {
        return Receiving::create([
            'receiving_no' => 'RCV-NOTES-1',
            'purchase_order' => 'PO-NOTES-1',
            'supplier' => 'Test Supplier',
            'delivery_date' => now()->toDateString(),
            'status' => 'Pending QA',
        ]);
    }

    public function test_plant_manager_can_persist_receiving_notes(): void
    {
        $manager = $this->user('PLANT_MANAGER');
        $receiving = $this->receiving();

        $this->actingAs($manager)
            ->putJson("/api/plant-manager/receivings/{$receiving->id}/notes", [
                'notes' => 'Supplier packaging was wet on arrival.',
            ])
            ->assertOk()
            ->assertJsonPath('notes', 'Supplier packaging was wet on arrival.');

        $this->assertDatabaseHas('receivings', [
            'id' => $receiving->id,
            'notes' => 'Supplier packaging was wet on arrival.',
        ]);
        $this->assertDatabaseMissing('qa_inspections', ['receiving_id' => $receiving->id]);
    }

    public function test_qa_and_admin_cannot_update_receiving_notes(): void
    {
        $receiving = $this->receiving();

        foreach (['QA_SUPERVISOR', 'ADMIN'] as $slug) {
            $this->actingAs($this->user($slug))
                ->putJson("/api/plant-manager/receivings/{$receiving->id}/notes", ['notes' => 'Forbidden'])
                ->assertForbidden();
        }
    }
}
