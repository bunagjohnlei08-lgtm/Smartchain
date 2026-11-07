<?php

namespace Tests\Feature;

use App\Mail\UserInvitationMail;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Models\UserInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Hash;
use RuntimeException;
use Tests\Concerns\CompletesOtpLogin;
use Tests\TestCase;

class LegacySupplierAccountInvitationTest extends TestCase
{
    use CompletesOtpLogin, RefreshDatabase;

    private User $admin;
    private Role $supplierRole;

    protected function setUp(): void
    {
        parent::setUp();
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->supplierRole = Role::firstOrCreate(['slug' => 'SUPPLIER'], ['name' => 'Supplier']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        Mail::fake();
    }

    public function test_admin_invites_legacy_supplier_and_existing_activation_and_otp_login_flow_works(): void
    {
        $supplier = $this->supplier();

        $this->actingAs($this->admin)->getJson('/api/suppliers')
            ->assertOk()->assertJsonPath('data.0.account.status', 'NO_ACCOUNT')
            ->assertJsonPath('data.0.account.can_invite', true);

        $response = $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/account-invitation")
            ->assertOk()->assertJsonPath('account.status', 'INVITATION_PENDING')
            ->assertJsonMissingPath('token');

        $this->assertSame($supplier->id, Supplier::query()->sole()->id);
        $this->assertDatabaseCount('suppliers', 1);
        $user = User::query()->where('supplier_id', $supplier->id)->sole();
        $this->assertSame('SUPPLIER', $user->role->slug);
        $this->assertSame('PENDING', $user->status);
        $this->assertSame('legacy@example.test', $user->email);
        $this->assertDatabaseCount('user_invitations', 1);
        Mail::assertSent(UserInvitationMail::class, fn (UserInvitationMail $mail) => $mail->hasTo('legacy@example.test'));

        $token = $this->sentToken('legacy@example.test');
        $this->postJson('/api/invitations/accept', [
            'token' => $token,
            'password' => 'Legacy@123',
            'password_confirmation' => 'Legacy@123',
        ])->assertOk();

        $user->refresh();
        $this->assertSame('ACTIVE', $user->status);
        $this->app['auth']->forgetGuards();
        $login = $this->loginWithOtp($user->email, 'Legacy@123')->assertOk()->assertJsonStructure(['token']);
        $tokenValue = $login->json('token');
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$tokenValue)->getJson('/api/supplier-account/profile')
            ->assertOk()
            ->assertJsonPath('data.supplier.id', $supplier->id)
            ->assertJsonPath('data.supplier.bidding_eligibility.eligible', false)
            ->assertJsonPath('data.supplier.required_documents.0.status', 'MISSING');
        foreach (['rfqs', 'bidding-interests', 'quotations', 'accreditation-requests', 'purchase-orders', 'performance'] as $endpoint) {
            $this->app['auth']->forgetGuards();
            $this->getJson('/api/supplier-account/'.$endpoint)->assertOk();
        }
        $this->assertDatabaseCount('supplier_applications', 0);
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/session/status')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/session/activity')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/supplier-account/profile')->assertUnauthorized();
    }

    public function test_repeat_send_reuses_pending_account_and_revokes_previous_invitation(): void
    {
        $supplier = $this->supplier();
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertOk();
        $old = UserInvitation::query()->sole();

        $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertStatus(429);
        $this->assertDatabaseCount('user_invitations', 1);
        Mail::assertSent(UserInvitationMail::class, 1);

        $this->travel(2)->minutes();
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/account-invitation")
            ->assertOk()->assertJsonPath('account.status', 'INVITATION_PENDING');

        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('suppliers', 1);
        $this->assertDatabaseCount('user_invitations', 2);
        $this->assertNotNull($old->fresh()->revoked_at);
        $this->assertSame(1, UserInvitation::query()->outstanding()->count());
    }

    public function test_active_account_conflicting_email_and_ineligible_supplier_are_rejected_without_mutation(): void
    {
        $active = $this->supplier(['supplier_code' => 'SUP-ACT', 'email' => 'active@example.test']);
        User::factory()->create(['role_id' => $this->supplierRole->id, 'supplier_id' => $active->id, 'email' => $active->email, 'status' => 'ACTIVE']);
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$active->id}/account-invitation")
            ->assertUnprocessable()->assertJsonPath('message', 'This supplier already has an active Supplier Account.');

        $conflict = $this->supplier(['supplier_code' => 'SUP-CON', 'email' => 'used@example.test']);
        User::factory()->create(['email' => 'used@example.test', 'status' => 'ACTIVE']);
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$conflict->id}/account-invitation")
            ->assertStatus(409)->assertJsonPath('message', 'The registered supplier email already belongs to a non-Supplier user account. Verify the supplier contact email. If it was entered incorrectly, correct it through Edit Supplier using a verified supplier-owned address. Keep the existing user and staff role unchanged.');

        foreach ([
            ['supplier_code' => 'SUP-OH', 'status' => Supplier::STATUS_ON_HOLD, 'email' => 'hold@example.test'],
            ['supplier_code' => 'SUP-IN', 'status' => Supplier::STATUS_INACTIVE, 'email' => 'inactive@example.test'],
            ['supplier_code' => 'SUP-RM', 'status' => Supplier::STATUS_PENDING_REMOVAL, 'email' => 'removed@example.test'],
            ['supplier_code' => 'SUP-AR', 'status' => Supplier::STATUS_ARCHIVED, 'email' => 'archived@example.test'],
            ['supplier_code' => 'SUP-NE', 'status' => Supplier::STATUS_ACTIVE, 'email' => null],
        ] as $attributes) {
            $supplier = $this->supplier($attributes);
            $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertUnprocessable();
        }

        $this->assertDatabaseCount('user_invitations', 0);
    }

    public function test_non_admin_is_forbidden_and_transport_failure_is_not_reported_as_success(): void
    {
        $supplier = $this->supplier();
        $staffRole = Role::create(['name' => 'QA', 'slug' => 'QA_SUPERVISOR']);
        $staff = User::factory()->create(['role_id' => $staffRole->id, 'status' => 'ACTIVE']);
        $this->actingAs($staff)->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertForbidden();

        Mail::shouldReceive('to')->andThrow(new RuntimeException('Transport unavailable'));
        $response = $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/account-invitation")
            ->assertStatus(502)->assertJsonPath('message', 'The activation invitation could not be sent. Please try again.');
        $this->assertStringNotContainsString('Transport unavailable', $response->getContent());
        $this->assertDatabaseHas('users', ['supplier_id' => $supplier->id, 'status' => 'PENDING']);
        $this->assertDatabaseCount('user_invitations', 1);
        Mail::swap(new \Illuminate\Mail\MailManager($this->app));
        Mail::fake();
        $this->travel(2)->minutes();
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/account-invitation")
            ->assertOk()->assertJsonPath('account.status', 'INVITATION_PENDING');
        $this->assertDatabaseCount('users', 3);
        Mail::assertSent(UserInvitationMail::class, 1);
    }

    public function test_expired_invitation_can_be_replaced_without_creating_another_account(): void
    {
        $supplier = $this->supplier();
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertOk();
        $oldToken = $this->sentToken($supplier->email);
        $this->travel(49)->hours();
        $this->actingAs($this->admin)->getJson("/api/suppliers/{$supplier->id}")
            ->assertOk()->assertJsonPath('data.account.status', 'INVITATION_EXPIRED');
        $this->postJson('/api/invitations/accept', [
            'token' => $oldToken, 'password' => 'Legacy@123', 'password_confirmation' => 'Legacy@123',
        ])->assertUnprocessable();
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertOk();
        $this->postJson('/api/invitations/accept', [
            'token' => $this->sentToken($supplier->email), 'password' => 'Legacy@123', 'password_confirmation' => 'Legacy@123',
        ])->assertOk()->assertJsonMissingPath('token');
        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('suppliers', 1);
        $this->assertDatabaseCount('supplier_applications', 0);
        $this->actingAs($this->admin)->getJson("/api/suppliers/{$supplier->id}")
            ->assertOk()->assertJsonPath('data.account.status', 'ACCOUNT_ACTIVE');
    }

    public function test_invalid_email_and_linked_account_conflicts_are_displayed_and_rejected(): void
    {
        $supplier = $this->supplier(['email' => 'invalid-email']);
        $this->actingAs($this->admin)->getJson("/api/suppliers/{$supplier->id}")
            ->assertOk()->assertJsonPath('data.account.status', 'EMAIL_REQUIRED');
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertUnprocessable();

        $supplier->update(['email' => 'legacy@example.test']);
        $user = User::factory()->create(['role_id' => $this->supplierRole->id,
            'supplier_id' => $supplier->id, 'email' => 'different@example.test', 'status' => 'PENDING']);
        $hash = $user->password;
        $this->getJson("/api/suppliers/{$supplier->id}")->assertOk()->assertJsonPath('data.account.status', 'CONFLICT');
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertStatus(409);

        $user->update(['email' => $supplier->email, 'role_id' => $this->admin->role_id]);
        $this->getJson("/api/suppliers/{$supplier->id}")->assertOk()->assertJsonPath('data.account.status', 'CONFLICT');
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertStatus(409);
        $user->update(['role_id' => $this->supplierRole->id, 'status' => 'SUSPENDED']);
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertUnprocessable();
        $this->assertSame($hash, $user->fresh()->password);
        $this->assertDatabaseCount('user_invitations', 0);
    }

    public function test_unlinked_email_conflict_is_visible_before_sending_and_guest_is_blocked(): void
    {
        $supplier = $this->supplier();
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertUnauthorized();
        User::factory()->create(['email' => $supplier->email, 'status' => 'ACTIVE']);
        $this->actingAs($this->admin)->getJson("/api/suppliers/{$supplier->id}")
            ->assertOk()->assertJsonPath('data.account.status', 'CONFLICT')->assertJsonPath('data.account.can_invite', false);
        $this->getJson('/api/suppliers')->assertOk()->assertJsonPath('data.0.account.status', 'CONFLICT');
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertStatus(409);
        $this->assertDatabaseCount('user_invitations', 0);
    }

    public function test_activation_replay_and_reinvite_cannot_reset_the_active_password(): void
    {
        $supplier = $this->supplier();
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertOk();
        $token = $this->sentToken($supplier->email);
        $this->postJson('/api/invitations/accept', [
            'token' => $token, 'password' => 'Legacy@123', 'password_confirmation' => 'Legacy@123',
        ])->assertOk();
        $this->postJson('/api/invitations/accept', [
            'token' => $token, 'password' => 'Changed@123', 'password_confirmation' => 'Changed@123',
        ])->assertUnprocessable();
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertUnprocessable();
        $this->assertTrue(Hash::check('Legacy@123', User::where('supplier_id', $supplier->id)->sole()->password));
        $this->assertDatabaseCount('user_invitations', 1);
    }

    public function test_preexisting_pending_supplier_user_is_reused_without_resetting_password(): void
    {
        $supplier = $this->supplier();
        $user = User::factory()->create(['role_id' => $this->supplierRole->id,
            'supplier_id' => $supplier->id, 'email' => $supplier->email, 'status' => 'PENDING']);
        $hash = $user->password;
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertOk();
        $this->assertSame($user->id, User::where('supplier_id', $supplier->id)->sole()->id);
        $this->assertSame($hash, $user->fresh()->password);
        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('suppliers', 1);
        $this->assertDatabaseCount('supplier_applications', 0);
    }

    public function test_missing_link_conflict_is_actionable_and_never_takes_over_the_matching_account(): void
    {
        $supplier = $this->supplier();
        $user = User::factory()->create(['email'=>$supplier->email, 'role_id'=>$this->supplierRole->id, 'status'=>'ACTIVE', 'supplier_id'=>null]);
        $password = $user->password;
        $this->actingAs($this->admin)->getJson("/api/suppliers/{$supplier->id}")->assertOk()
            ->assertJsonPath('data.account.status', 'CONFLICT')
            ->assertJsonPath('data.account.can_invite', false)
            ->assertJsonPath('data.account.conflict.code', 'SUPPLIER_LINK_MISSING')
            ->assertJsonPath('data.account.conflict.account.user_id', $user->id)
            ->assertJsonPath('data.account.conflict.account.supplier_id', null)
            ->assertJsonMissingPath('data.account.conflict.account.password')
            ->assertJsonMissingPath('data.account.conflict.account.token');
        $this->getJson('/api/suppliers')->assertOk()->assertJsonPath('data.0.account.conflict.code', 'SUPPLIER_LINK_MISSING');
        $response = $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertStatus(409);
        $this->assertStringContainsString('independent', $response->json('message'));
        $this->assertNull($user->fresh()->supplier_id);
        $this->assertSame($password, $user->fresh()->password);
        $this->assertSame($this->supplierRole->id, $user->fresh()->role_id);
        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('user_invitations', 0);
        $this->assertDatabaseCount('supplier_applications', 0);
    }

    public function test_staff_and_other_supplier_email_conflicts_have_distinct_explanations_without_reassignment(): void
    {
        $supplier = $this->supplier();
        $user = User::factory()->create(['email'=>$supplier->email, 'role_id'=>$this->admin->role_id, 'status'=>'ACTIVE']);
        $this->actingAs($this->admin)->getJson("/api/suppliers/{$supplier->id}")->assertOk()
            ->assertJsonPath('data.account.conflict.code', 'EMAIL_ROLE_CONFLICT')
            ->assertJsonPath('data.account.conflict.account.role', 'ADMIN');
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertStatus(409);
        $other = $this->supplier(['supplier_code'=>'SUP-OTHER', 'name'=>'Other supplier', 'email'=>'other@example.test']);
        $user->update(['role_id'=>$this->supplierRole->id, 'supplier_id'=>$other->id]);
        $this->getJson("/api/suppliers/{$supplier->id}")->assertOk()
            ->assertJsonPath('data.account.conflict.code', 'EMAIL_LINKED_TO_OTHER_SUPPLIER')
            ->assertJsonPath('data.account.conflict.account.supplier_id', $other->id);
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertStatus(409);
        $this->assertSame($other->id, $user->fresh()->supplier_id);
        $this->actingAs($user)->getJson("/api/suppliers/{$supplier->id}")->assertForbidden();
        $this->getJson('/api/suppliers')->assertForbidden();
        $this->assertDatabaseCount('user_invitations', 0);
    }

    public function test_active_linked_user_is_not_misclassified_by_business_status_or_contact_email(): void
    {
        $supplier = $this->supplier(['status'=>Supplier::STATUS_ON_HOLD]);
        $user = User::factory()->create(['email'=>'existing-login@example.test', 'role_id'=>$this->supplierRole->id, 'status'=>'ACTIVE', 'supplier_id'=>$supplier->id]);
        $this->actingAs($this->admin)->getJson("/api/suppliers/{$supplier->id}")->assertOk()
            ->assertJsonPath('data.account.status', 'ACCOUNT_ACTIVE')
            ->assertJsonPath('data.account.can_invite', false)
            ->assertJsonPath('data.account.conflict', null);
        $this->getJson('/api/suppliers')->assertOk()->assertJsonPath('data.0.account.status', 'ACCOUNT_ACTIVE');
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertUnprocessable();
        $this->assertFalse(app(\App\Services\SupplierAccreditationEligibility::class)->eligible($supplier));
        $this->assertSame($supplier->id, $user->fresh()->supplier_id);
        $this->assertDatabaseCount('user_invitations', 0);
    }

    public function test_case_insensitive_duplicate_accounts_require_review_and_are_never_merged(): void
    {
        $supplier = $this->supplier();
        foreach ([$supplier->email, strtoupper($supplier->email)] as $email) {
            User::factory()->create(['email'=>$email, 'role_id'=>$this->supplierRole->id, 'status'=>'PENDING', 'supplier_id'=>null]);
        }
        $this->actingAs($this->admin)->getJson("/api/suppliers/{$supplier->id}")->assertOk()
            ->assertJsonPath('data.account.conflict.code', 'AMBIGUOUS_EMAIL');
        $this->getJson('/api/suppliers')->assertOk()->assertJsonPath('data.0.account.conflict.code', 'AMBIGUOUS_EMAIL');
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertStatus(409);
        $this->assertDatabaseCount('users', 3);
        $this->assertSame(0, User::whereNotNull('supplier_id')->count());
        $this->assertDatabaseCount('user_invitations', 0);
    }

    public function test_verified_contact_correction_uses_existing_edit_and_invitation_without_reassigning_staff(): void
    {
        $supplier = $this->supplier();
        $staff = User::factory()->create(['email'=>$supplier->email, 'role_id'=>$this->admin->role_id, 'status'=>'ACTIVE']);
        $hash = $staff->password;
        $this->actingAs($this->admin)->getJson("/api/suppliers/{$supplier->id}")->assertOk()
            ->assertJsonPath('data.account.conflict.code', 'EMAIL_ROLE_CONFLICT');
        // An explicit Admin edit models a verified contact correction, not an account transfer.
        $this->putJson("/api/suppliers/{$supplier->id}", ['name'=>$supplier->name, 'status'=>'ACTIVE', 'email'=>'verified-supplier@example.test'])
            ->assertOk()->assertJsonPath('data.account.status', 'NO_ACCOUNT');
        $this->postJson("/api/suppliers/{$supplier->id}/account-invitation")->assertOk()
            ->assertJsonPath('account.status', 'INVITATION_PENDING');
        $pending = User::where('supplier_id', $supplier->id)->sole();
        $this->assertSame('verified-supplier@example.test', $pending->email);
        $this->assertSame('PENDING', $pending->status);
        $this->assertSame($this->supplierRole->id, $pending->role_id);
        $this->assertNull($staff->fresh()->supplier_id);
        $this->assertSame($this->admin->role_id, $staff->fresh()->role_id);
        $this->assertSame($hash, $staff->fresh()->password);
        $this->assertSame('legacy@example.test', $staff->fresh()->email);
        $this->assertDatabaseCount('suppliers', 1);
        $this->assertDatabaseCount('supplier_applications', 0);
        $this->assertFalse(app(\App\Services\SupplierAccreditationEligibility::class)->eligible($supplier->fresh()));
    }

    private function supplier(array $attributes = []): Supplier
    {
        return Supplier::create(array_merge([
            'supplier_code' => 'SUP-LEG',
            'name' => 'Legacy Supplier',
            'contact_person' => 'Legacy Contact',
            'email' => 'legacy@example.test',
            'status' => Supplier::STATUS_ACTIVE,
            'accreditation_status' => 'INACTIVE',
        ], $attributes));
    }

    private function sentToken(string $email): string
    {
        $mail = Mail::sent(UserInvitationMail::class, fn (UserInvitationMail $mail) => $mail->hasTo($email))->last();
        $this->assertNotNull($mail);
        parse_str((string) parse_url($mail->activationUrl, PHP_URL_QUERY), $query);

        return $query['token'];
    }
}
