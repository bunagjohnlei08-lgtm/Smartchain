<?php

namespace Tests\Feature;

use App\Models\LoginChallenge;
use App\Models\Role;
use App\Models\User;
use App\Support\BrevoTransactionalMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class LoginOtpDeliveryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['mail.default' => 'brevo', 'services.brevo.api_key' => 'isolated-fake-key', 'services.brevo.sender_email' => 'sender@example.test']);
        Mail::purge('brevo');
        Http::preventStrayRequests();
    }

    public function test_real_mail_pipeline_submits_initial_and_resend_for_each_role(): void
    {
        Http::fake([BrevoTransactionalMail::ENDPOINT => Http::response(['messageId' => '<isolated@brevo>'], 201)]);
        foreach (['ADMIN', 'PLANT_MANAGER', 'QA_SUPERVISOR'] as $slug) {
            $role = Role::create(['name' => $slug, 'slug' => $slug]);
            $user = User::factory()->create(['role_id' => $role->id, 'password' => 'isolated-password']);
            $initial = $this->postJson('/api/login', ['email' => $user->email, 'password' => 'isolated-password'])
                ->assertOk()->assertJsonPath('delivery_status', 'submitted')->assertJsonMissingPath('token');
            $this->assertSame($user->email, Http::recorded()->last()[0]->data()['to'][0]['email']);
            $this->getJson('/api/profile')->assertUnauthorized();
            $this->travel(61)->seconds();
            $this->postJson('/api/login/resend-otp', ['challenge_id' => $initial->json('challenge_id')])
                ->assertOk()->assertJsonPath('delivery_status', 'submitted');
            $request = Http::recorded()->last()[0];
            $this->assertSame($user->email, $request->data()['to'][0]['email']);
            // Extract only the isolated fake message's code to exercise actual
            // rendering, hashing and verification together. No live email is read.
            preg_match('/letter-spacing: 8px[^>]*>\s*(\d{6})/', $request->data()['htmlContent'], $matches);
            $this->assertArrayHasKey(1, $matches);
            $this->postJson('/api/login/verify-otp', ['challenge_id' => $initial->json('challenge_id'), 'otp' => $matches[1]])
                ->assertOk()->assertJsonPath('user.role.slug', $slug);
        }
        Http::assertSentCount(6);
        $this->assertDatabaseCount('jobs', 0);
    }

    public function test_provider_rejection_and_missing_credentials_cannot_report_submission(): void
    {
        $user = User::factory()->create(['password' => 'isolated-password']);
        foreach ([401, 429, 500] as $status) {
            Http::fake([BrevoTransactionalMail::ENDPOINT => Http::response(['code' => 'unauthorized'], $status)]);
            $this->postJson('/api/login', ['email' => $user->email, 'password' => 'isolated-password'])
                ->assertStatus(503)->assertJsonMissingPath('token')->assertJsonMissingPath('challenge_id');
            $this->assertFalse(LoginChallenge::query()->latest('id')->first()->acceptsCode());
        }
        config(['services.brevo.api_key' => null]);
        Http::fake();
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'isolated-password'])->assertStatus(503);
        Http::assertNothingSent();
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_provider_echoed_content_and_connection_errors_are_not_logged(): void
    {
        $logs = Log::spy();
        $secret = 'isolated-private-message-content';
        Http::fake([BrevoTransactionalMail::ENDPOINT => Http::response(['code' => $secret, 'message' => $secret], 400)]);
        try {
            app(BrevoTransactionalMail::class)->send([['email' => 'recipient@example.test']], 'Test', $secret);
            $this->fail('Rejected mail must throw.');
        } catch (\App\Exceptions\BrevoDeliveryException) {
            $logs->shouldHaveReceived('error')->withArgs(fn ($message, $context) => !str_contains($message.json_encode($context), $secret) && $context['brevo_code'] === 'unknown');
        }
    }
}
