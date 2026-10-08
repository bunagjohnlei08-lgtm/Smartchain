<?php

namespace Tests\Feature;

use App\Mail\SupplierApplicationPortalMail;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAttachment;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SupplierApplicationWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Mail::fake();
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'company_name' => '  Atlas   Industrial Supply  ',
            'owner_name' => 'Andrea Reyes',
            'address' => '123 Manufacturing Avenue, Makati City',
            'contact_person' => 'Maria Santos',
            'email' => 'SALES@ATLAS.TEST',
            'phone' => '639171234567',
            'business_type' => 'Corporation',
            'supply_category' => 'Industrial materials',
            'products_services' => 'Industrial materials, safety equipment, and local delivery services.',
            'offerings' => [['type' => 'PRODUCT', 'name' => 'Safety Helmets', 'category' => 'Safety Equipment']],
        ], $overrides);
    }

    private function validAttachments(array $overrides = []): array
    {
        return array_merge([
            'business_certificate' => [UploadedFile::fake()->create('certificate.pdf', 20, 'application/pdf')],
            'business_permit' => [UploadedFile::fake()->image('permit.jpg')],
            'product_service_image' => [UploadedFile::fake()->image('catalog.png')],
        ], $overrides);
    }

    private function multipartPayload(array $overrides = []): array
    {
        return array_merge($this->payload(), $this->validAttachments(), $overrides);
    }

    private function pdfUpload(string $name, string $marker): UploadedFile
    {
        return UploadedFile::fake()->createWithContent(
            $name,
            "%PDF-1.4\n% SmartChain {$marker}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        );
    }

    /** @return array{UploadedFile, UploadedFile} */
    private function imageCopies(string $firstName, string $secondName, string $extension = 'jpg'): array
    {
        $source = UploadedFile::fake()->image("source.{$extension}", 23, 19);
        $contents = file_get_contents($source->getRealPath());

        return [
            UploadedFile::fake()->createWithContent($firstName, $contents),
            UploadedFile::fake()->createWithContent($secondName, $contents),
        ];
    }

    private function submit(array $overrides = [], string $ip = '198.51.100.10'): SupplierApplication
    {
        $response = $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->post('/api/supplier-applications', $this->multipartPayload($overrides), ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.status', SupplierApplication::STATUS_PENDING)
            ->assertJsonMissingPath('data.id');

        return SupplierApplication::where('application_number', $response->json('data.application_number'))->firstOrFail();
    }

    private function submitMultipart(array $overrides = [], string $ip = '198.51.100.80'): SupplierApplication
    {
        $response = $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->post('/api/supplier-applications', $this->multipartPayload($overrides), ['Accept' => 'application/json'])
            ->assertCreated();

        return SupplierApplication::where('application_number', $response->json('data.application_number'))->firstOrFail();
    }

    public function test_guest_can_submit_application_without_creating_supplier_or_user(): void
    {
        $userCount = User::count();
        $application = $this->submit();

        $this->assertMatchesRegularExpression('/^SUP-APP-\d{4}-[A-Z0-9]{10}$/', $application->application_number);
        $this->assertSame('Atlas Industrial Supply', $application->company_name);
        $this->assertSame('Andrea Reyes', $application->owner_name);
        $this->assertSame('atlas industrial supply', $application->normalized_company_name);
        $this->assertSame('sales@atlas.test', $application->email);
        $this->assertDatabaseCount('suppliers', 0);
        $this->assertSame($userCount, User::count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'SUPPLIER_APPLICATION_SUBMITTED', 'resource_label' => $application->application_number]);
        $this->assertDatabaseHas('supplier_application_accesses', ['supplier_application_id' => $application->id]);
        $this->assertDatabaseHas('supplier_application_events', ['supplier_application_id' => $application->id, 'event_type' => 'APPLICATION_SUBMITTED']);
        Mail::assertSent(SupplierApplicationPortalMail::class, fn (SupplierApplicationPortalMail $mail) => $mail->hasTo('sales@atlas.test')
            && $mail->subjectLine === 'Supplier Application Received'
            && str_contains($mail->actionUrl ?? '', '/supplier-portal#token='));

        $this->actingAs($this->admin)
            ->getJson("/api/admin/supplier-applications/{$application->id}")
            ->assertOk()
            ->assertJsonPath('data.owner_name', 'Andrea Reyes')
            ->assertJsonPath('data.contact_person', 'Maria Santos')
            ->assertJsonPath('data.phone', '639171234567');
    }

    public function test_successful_application_notifies_each_active_admin_once_with_safe_context(): void
    {
        Notification::fake();
        $adminRole = $this->admin->role;
        $secondAdmin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $inactiveAdmin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'SUSPENDED']);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $qaRole->id, 'status' => 'ACTIVE']);

        $application = $this->submit();

        foreach ([$this->admin, $secondAdmin] as $admin) {
            Notification::assertSentToTimes($admin, WorkflowNotification::class, 1);
            Notification::assertSentTo($admin, WorkflowNotification::class, function (WorkflowNotification $notification) use ($admin, $application): bool {
                $data = $notification->toDatabase($admin);

                return $notification->title === 'New Supplier Application'
                    && $notification->message === 'Atlas Industrial Supply submitted a new supplier application for review.'
                    && $notification->type === 'info'
                    && $notification->referenceId === $application->application_number
                    && $notification->category === 'Supplier Applications'
                    && $data['metadata']['supplier_application_id'] === $application->id
                    && $data['metadata']['application_reference'] === $application->application_number
                    && $data['metadata']['company_name'] === $application->company_name
                    && $data['metadata']['application_status'] === SupplierApplication::STATUS_PENDING
                    && is_string($data['metadata']['created_at']);
            });
        }

        Notification::assertNotSentTo([$inactiveAdmin, $manager, $qa], WorkflowNotification::class);
    }

    public function test_guest_can_submit_maximum_required_attachments_with_private_generated_storage_names(): void
    {
        Storage::fake('local');

        $application = $this->submitMultipart([
            'business_certificate' => [
                $this->pdfUpload('certificate-1.pdf', 'certificate-one'),
                UploadedFile::fake()->image('certificate-2.jpg', 11, 11),
            ],
            'business_permit' => [
                UploadedFile::fake()->image('permit-1.jpg', 12, 12),
                $this->pdfUpload('permit-2.pdf', 'permit-two'),
            ],
            'product_service_image' => [
                UploadedFile::fake()->image('catalog-1.png', 13, 13),
                UploadedFile::fake()->image('catalog-2.jpg', 14, 14),
                UploadedFile::fake()->image('catalog-3.png', 15, 15),
                UploadedFile::fake()->image('catalog-4.jpg', 16, 16),
                UploadedFile::fake()->image('catalog-5.png', 17, 17),
            ],
        ], '198.51.100.81');

        $attachments = $application->attachments()->orderBy('attachment_type')->get();
        $this->assertCount(9, $attachments);

        foreach ($attachments as $attachment) {
            $this->assertMatchesRegularExpression('~^supplier-applications/'.$application->id.'/[A-Za-z0-9]+\.(?:jpe?g|png|pdf)$~', $attachment->stored_path);
            $this->assertStringNotContainsString($attachment->original_name, $attachment->stored_path);
            Storage::disk('local')->assertExists($attachment->stored_path);
        }

        $detail = $this->actingAs($this->admin)->getJson("/api/admin/supplier-applications/{$application->id}")
            ->assertOk()
            ->assertJsonCount(9, 'data.attachments')
            ->assertJsonMissingPath('data.attachments.0.stored_path');

        $this->assertSame($application->id, $detail->json('data.id'));
        $this->assertSame(0, User::where('email', 'sales@atlas.test')->count());
        $this->assertDatabaseCount('suppliers', 0);
    }

    public function test_different_file_contents_are_accepted_even_with_the_same_filename(): void
    {
        $application = $this->submitMultipart([
            'business_certificate' => [
                $this->pdfUpload('document.pdf', 'first-document'),
                $this->pdfUpload('document.pdf', 'second-document'),
            ],
        ], '198.51.100.96');

        $this->assertCount(2, $application->attachments()->where('attachment_type', SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE)->get());
        $this->assertCount(4, $application->attachments);
    }

    public function test_exact_duplicate_in_the_same_attachment_category_is_rejected(): void
    {
        $this->post('/api/supplier-applications', $this->multipartPayload([
            'business_certificate' => [
                $this->pdfUpload('certificate.pdf', 'identical-certificate'),
                $this->pdfUpload('certificate.pdf', 'identical-certificate'),
            ],
        ]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.business_certificate.0', 'The same file cannot be submitted more than once.');

        $this->assertDatabaseCount('supplier_applications', 0);
    }

    public function test_renaming_an_exact_duplicate_does_not_bypass_validation(): void
    {
        $this->post('/api/supplier-applications', $this->multipartPayload([
            'business_certificate' => [
                $this->pdfUpload('certificate.pdf', 'renamed-duplicate'),
                $this->pdfUpload('renamed-certificate.pdf', 'renamed-duplicate'),
            ],
        ]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.business_certificate.0', 'The same file cannot be submitted more than once.');
    }

    public function test_exact_duplicate_across_attachment_categories_is_rejected(): void
    {
        [$certificate, $permit] = $this->imageCopies('certificate.jpg', 'permit.jpg');

        $this->post('/api/supplier-applications', $this->multipartPayload([
            'business_certificate' => [$certificate],
            'business_permit' => [$permit],
        ]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.business_permit.0', 'The same file cannot be submitted more than once.');
    }

    public function test_exact_duplicate_product_images_are_rejected(): void
    {
        [$firstImage, $secondImage] = $this->imageCopies('product-one.png', 'product-two.png', 'png');

        $this->post('/api/supplier-applications', $this->multipartPayload([
            'product_service_image' => [$firstImage, $secondImage],
        ]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.product_service_image.0', 'The same file cannot be submitted more than once.');
    }

    public function test_attachment_hash_is_stored_but_hidden_from_api_responses(): void
    {
        $response = $this->post('/api/supplier-applications', $this->multipartPayload(), ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonMissingPath('data.file_sha256')
            ->assertJsonMissingPath('data.stored_path');

        $application = SupplierApplication::where('application_number', $response->json('data.application_number'))->firstOrFail();
        $attachment = $application->attachments()->firstOrFail();
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $attachment->file_sha256);
        $this->assertArrayNotHasKey('file_sha256', $attachment->toArray());

        $this->actingAs($this->admin)
            ->getJson("/api/admin/supplier-applications/{$application->id}")
            ->assertOk()
            ->assertJsonMissingPath('data.attachments.0.file_sha256')
            ->assertJsonMissingPath('data.attachments.0.stored_path');
    }

    public function test_attachment_upload_enforces_counts_types_content_and_five_mb_limit(): void
    {
        Storage::fake('local');

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.82'])
            ->post('/api/supplier-applications', $this->multipartPayload([
                'business_certificate' => [
                    UploadedFile::fake()->create('one.pdf', 20, 'application/pdf'),
                    UploadedFile::fake()->create('two.pdf', 20, 'application/pdf'),
                    UploadedFile::fake()->create('three.pdf', 20, 'application/pdf'),
                ],
            ]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('business_certificate');

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.83'])
            ->post('/api/supplier-applications', $this->multipartPayload([
                'product_service_image' => [UploadedFile::fake()->create('image.gif', 20, 'image/gif')],
            ]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('product_service_image.0');

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.84'])
            ->post('/api/supplier-applications', $this->multipartPayload([
                'business_permit' => [UploadedFile::fake()->create('oversize.pdf', 5121, 'application/pdf')],
            ]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('business_permit.0');

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.89'])
            ->post('/api/supplier-applications', $this->multipartPayload([
                'product_service_image' => [UploadedFile::fake()->create('disguised.jpg', 20, 'text/html')],
            ]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('product_service_image.0');

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.90'])
            ->post('/api/supplier-applications', $this->multipartPayload([
                'business_permit' => [
                    UploadedFile::fake()->image('permit-1.png'),
                    UploadedFile::fake()->image('permit-2.png'),
                    UploadedFile::fake()->image('permit-3.png'),
                ],
            ]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('business_permit');

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.91'])
            ->post('/api/supplier-applications', $this->multipartPayload([
                'product_service_image' => array_map(
                    fn (int $number) => UploadedFile::fake()->image("image-{$number}.png"),
                    range(1, 6)
                ),
            ]), ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('product_service_image');

        foreach ([
            ['catalog.pdf', 'application/pdf'],
            ['malware.exe', 'application/x-msdownload'],
        ] as $index => [$name, $mime]) {
            $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.'.(92 + $index)])
                ->post('/api/supplier-applications', $this->multipartPayload([
                    'product_service_image' => [UploadedFile::fake()->create($name, 20, $mime)],
                ]), ['Accept' => 'application/json'])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('product_service_image.0');
        }

        $this->assertDatabaseCount('supplier_applications', 0);
        $this->assertDatabaseCount('supplier_application_attachments', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_attachment_storage_is_cleaned_up_when_metadata_creation_fails(): void
    {
        Notification::fake();
        Storage::fake('local');
        Event::listen('eloquent.creating: '.SupplierApplicationAttachment::class, function (): never {
            throw new \RuntimeException('Simulated attachment metadata failure.');
        });

        try {
            $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.88'])
                ->post('/api/supplier-applications', $this->multipartPayload([
                    'business_certificate' => [UploadedFile::fake()->create('certificate.pdf', 20, 'application/pdf')],
                ]), ['Accept' => 'application/json'])
                ->assertServerError();
        } finally {
            Event::forget('eloquent.creating: '.SupplierApplicationAttachment::class);
        }

        $this->assertDatabaseCount('supplier_applications', 0);
        $this->assertDatabaseCount('supplier_application_attachments', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
        Notification::assertNothingSent();
    }

    public function test_only_admin_can_preview_or_download_an_attachment_and_parent_must_match(): void
    {
        Storage::fake('local');
        $application = $this->submitMultipart([
            'business_certificate' => [UploadedFile::fake()->create('certificate.pdf', 20, 'application/pdf')],
        ], '198.51.100.85');
        $attachment = $application->attachments()->firstOrFail();
        $previewUrl = "/api/admin/supplier-applications/{$application->id}/attachments/{$attachment->id}/preview";
        $downloadUrl = "/api/admin/supplier-applications/{$application->id}/attachments/{$attachment->id}/download";

        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $qaRole->id, 'status' => 'ACTIVE']);

        $this->get($previewUrl, ['Accept' => 'application/json'])->assertUnauthorized();
        $this->get($downloadUrl, ['Accept' => 'application/json'])->assertUnauthorized();
        $this->actingAs($manager)->get($previewUrl)->assertForbidden();
        $this->actingAs($manager)->get($downloadUrl)->assertForbidden();
        $this->actingAs($qa)->get($previewUrl)->assertForbidden();
        $this->actingAs($qa)->get($downloadUrl)->assertForbidden();
        $this->actingAs($this->admin)->get("/api/admin/supplier-applications/999999/attachments/{$attachment->id}/preview")
            ->assertNotFound();

        $this->actingAs($this->admin)->get($previewUrl)
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->actingAs($this->admin)->get($downloadUrl)->assertOk();
    }

    public function test_admin_can_open_historical_application_without_attachments(): void
    {
        $application = $this->submit([], '198.51.100.95');
        $application->attachments()->delete();

        $this->actingAs($this->admin)->getJson("/api/admin/supplier-applications/{$application->id}")
            ->assertOk()
            ->assertJsonCount(0, 'data.attachments');
    }

    public function test_attachments_are_preserved_after_approval_and_rejection(): void
    {
        Storage::fake('local');
        $approved = $this->submitMultipart([
            'email' => 'approved-attachments@example.test',
            'business_certificate' => [UploadedFile::fake()->create('approved.pdf', 20, 'application/pdf')],
        ], '198.51.100.86');
        $rejected = $this->submitMultipart([
            'email' => 'rejected-attachments@example.test',
            'product_service_image' => [UploadedFile::fake()->image('rejected.png')],
        ], '198.51.100.87');
        $approvedPath = $approved->attachments()->firstOrFail()->stored_path;
        $rejectedPath = $rejected->attachments()->firstOrFail()->stored_path;
        $approved->update(['status' => SupplierApplication::STATUS_MEETING_COMPLETED]);
        $rejected->update(['status' => SupplierApplication::STATUS_UNDER_REVIEW]);

        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$approved->id}/approve")
            ->assertOk()->assertJsonCount(3, 'data.attachments');
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$rejected->id}/reject", [
            'reason_codes' => ['DOCUMENTS_CANNOT_BE_VALIDATED'],
            'internal_note' => 'Unable to verify the submitted business information.',
            'supplier_message' => 'We could not verify the submitted business information.',
        ])->assertOk()->assertJsonCount(3, 'data.attachments');

        $this->assertDatabaseHas('supplier_application_attachments', ['supplier_application_id' => $approved->id, 'stored_path' => $approvedPath]);
        $this->assertDatabaseHas('supplier_application_attachments', ['supplier_application_id' => $rejected->id, 'stored_path' => $rejectedPath]);
        Storage::disk('local')->assertExists($approvedPath);
        Storage::disk('local')->assertExists($rejectedPath);
    }

    public function test_public_validation_is_enforced(): void
    {
        $this->postJson('/api/supplier-applications', [])->assertUnprocessable()
            ->assertJsonValidationErrors(['company_name', 'owner_name', 'address', 'contact_person', 'email', 'phone', 'business_type', 'supply_category', 'offerings', 'business_certificate', 'business_permit', 'product_service_image'])
            ->assertJsonPath('errors.owner_name.0', 'Owner name is required.');
    }

    public function test_phone_number_accepts_digits_only_and_rejects_other_characters(): void
    {
        $invalidPhones = [
            '0912ABC5678',
            '0912 345 6789',
            '0912-345-6789',
            '+639123456789',
        ];

        foreach ($invalidPhones as $index => $phone) {
            $this->withServerVariables(['REMOTE_ADDR' => "198.51.100.2{$index}"])
                ->post('/api/supplier-applications', $this->multipartPayload([
                    'email' => "invalid-phone-{$index}@example.test",
                    'phone' => $phone,
                ]), ['Accept' => 'application/json'])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('phone')
                ->assertJsonPath('errors.phone.0', 'Phone number must contain numbers only.');
        }

        $application = $this->submit([
            'email' => 'digits-phone@example.test',
            'phone' => '09171234567',
        ], '198.51.100.11');

        $this->assertSame('09171234567', $application->phone);
    }

    public function test_admin_detail_supports_historical_application_without_owner_name(): void
    {
        $application = $this->submit(['email' => 'historical-owner@example.test'], '198.51.100.12');
        $application->update(['owner_name' => null]);

        $this->actingAs($this->admin)
            ->getJson("/api/admin/supplier-applications/{$application->id}")
            ->assertOk()
            ->assertJsonPath('data.owner_name', null);
    }

    public function test_same_normalized_email_cannot_create_two_pending_applications(): void
    {
        $this->submit(['email' => 'supplier@example.com']);

        $this->post('/api/supplier-applications', $this->multipartPayload([
            'company_name' => 'Different Company Name',
            'email' => '  Supplier@Example.COM  ',
        ]), ['Accept' => 'application/json'])->assertUnprocessable()
            ->assertJsonValidationErrors('email')
            ->assertJsonPath('errors.email.0', 'An application with these details is already being processed. Please contact the company if you need assistance.');

        $this->assertSame(1, SupplierApplication::where('normalized_email', 'supplier@example.com')->count());
    }

    public function test_under_review_application_still_blocks_same_email(): void
    {
        $application = $this->submit(['email' => 'review@example.com']);
        $application->update(['status' => SupplierApplication::STATUS_UNDER_REVIEW]);

        $this->post('/api/supplier-applications', $this->multipartPayload([
            'company_name' => 'Another Applicant',
            'email' => 'REVIEW@example.com',
        ]), ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_official_supplier_email_cannot_open_public_application(): void
    {
        Supplier::create([
            'supplier_code' => 'SUP-EXISTING',
            'name' => 'Existing Official Supplier',
            'email' => 'partner@example.com',
            'status' => 'ACTIVE',
        ]);

        $this->post('/api/supplier-applications', $this->multipartPayload([
            'email' => ' Partner@Example.com ',
        ]), ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('email');

        $this->assertDatabaseCount('supplier_applications', 0);
    }

    public function test_rejected_applicant_may_reapply_without_an_invented_cooldown(): void
    {
        $application = $this->submit(['email' => 'reapply@example.com']);
        $application->update(['status' => SupplierApplication::STATUS_REJECTED]);

        $second = $this->submit([
            'company_name' => 'Atlas Industrial Supply Reapplication',
            'email' => 'REAPPLY@example.com',
        ]);

        $this->assertNotSame($application->id, $second->id);
        $this->assertSame(2, SupplierApplication::where('normalized_email', 'reapply@example.com')->count());
    }

    public function test_public_submission_honeypot_is_enforced_without_a_detailed_bot_error(): void
    {
        Notification::fake();
        $this->postJson('/api/supplier-applications', $this->payload([
            'website' => 'https://bot.example',
        ]))->assertUnprocessable()
            ->assertExactJson(['message' => 'We could not submit your application. Please review the form and try again.']);

        $this->assertDatabaseCount('supplier_applications', 0);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'SUPPLIER_APPLICATION_SUBMITTED']);
        Notification::assertNothingSent();
    }

    public function test_validation_and_duplicate_rejections_do_not_create_notifications(): void
    {
        Notification::fake();

        $this->postJson('/api/supplier-applications', $this->payload([
            'product_service_image' => UploadedFile::fake()->create('invalid.gif', 20, 'image/gif'),
        ]))->assertUnprocessable();
        Notification::assertNothingSent();

        $this->submit(['email' => 'duplicate-notification@example.com']);
        Notification::assertSentToTimes($this->admin, WorkflowNotification::class, 1);

        $this->postJson('/api/supplier-applications', $this->payload([
            'company_name' => 'Duplicate Notification Applicant',
            'email' => 'duplicate-notification@example.com',
        ]))->assertUnprocessable();

        Notification::assertSentToTimes($this->admin, WorkflowNotification::class, 1);
    }

    public function test_five_different_applicants_from_one_ip_are_allowed_and_sixth_attempt_is_limited(): void
    {
        Notification::fake();
        Storage::fake('local');
        $ip = '198.51.100.25';

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->withServerVariables(['REMOTE_ADDR' => $ip])->post('/api/supplier-applications', $this->multipartPayload([
                'company_name' => "Applicant Company {$attempt}",
                'email' => "applicant{$attempt}@example.com",
            ]), ['Accept' => 'application/json'])->assertCreated();
        }

        $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/supplier-applications', $this->payload([
            'company_name' => 'Sixth Applicant Company',
            'email' => 'applicant6@example.com',
        ]))->assertTooManyRequests()
            ->assertJsonPath('message', 'Too many application attempts were submitted. Please try again later.')
            ->assertHeader('Retry-After');

        $this->assertDatabaseCount('supplier_applications', 5);
        Notification::assertSentToTimes($this->admin, WorkflowNotification::class, 5);
    }

    public function test_submission_rate_limit_expires_after_sixty_minutes(): void
    {
        Storage::fake('local');
        $ip = '198.51.100.26';
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->withServerVariables(['REMOTE_ADDR' => $ip])->post('/api/supplier-applications', $this->multipartPayload([
                'company_name' => "Window Applicant {$attempt}",
                'email' => "window{$attempt}@example.com",
            ]), ['Accept' => 'application/json'])->assertCreated();
        }

        $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/supplier-applications', $this->payload([
            'company_name' => 'Blocked Window Applicant',
            'email' => 'window-blocked@example.com',
        ]))->assertTooManyRequests();

        $this->travel(61)->minutes();

        $this->withServerVariables(['REMOTE_ADDR' => $ip])->post('/api/supplier-applications', $this->multipartPayload([
            'company_name' => 'Later Window Applicant',
            'email' => 'window-later@example.com',
        ]), ['Accept' => 'application/json'])->assertCreated();
    }

    public function test_database_has_one_active_application_per_email_constraint(): void
    {
        $definition = DB::table('pg_indexes')
            ->where('tablename', 'supplier_applications')
            ->where('indexname', 'supplier_applications_one_active_email')
            ->value('indexdef');

        $this->assertIsString($definition);
        $this->assertStringContainsString('normalized_email', $definition);
        $this->assertStringContainsString('PENDING', $definition);
        $this->assertStringContainsString('UNDER_REVIEW', $definition);
        $this->assertStringContainsString('NEEDS_REVISION', $definition);
        $this->assertStringContainsString('QUALIFIED_FOR_MEETING', $definition);
        $this->assertStringContainsString('MEETING_SCHEDULED', $definition);
        $this->assertStringContainsString('MEETING_COMPLETED', $definition);
    }

    public function test_only_admin_can_list_and_decide_applications(): void
    {
        $application = $this->submit();
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $qaRole->id, 'status' => 'ACTIVE']);

        $this->getJson('/api/admin/supplier-applications')->assertUnauthorized();
        $this->actingAs($manager)->getJson('/api/admin/supplier-applications')->assertForbidden();
        $this->actingAs($manager)->postJson("/api/admin/supplier-applications/{$application->id}/approve")->assertForbidden();
        $this->actingAs($qa)->postJson("/api/admin/supplier-applications/{$application->id}/approve")->assertForbidden();
        $this->actingAs($this->admin)->getJson('/api/admin/supplier-applications')
            ->assertOk()->assertJsonPath('data.0.id', $application->id);
        $this->assertDatabaseCount('suppliers', 0);
    }

    public function test_approval_is_transactional_idempotent_and_creates_only_active_supplier_record(): void
    {
        $application = $this->submit();
        $application->update(['status' => SupplierApplication::STATUS_MEETING_COMPLETED]);
        $first = $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/approve")
            ->assertOk()->assertJsonPath('data.status', SupplierApplication::STATUS_APPROVED);
        $second = $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/approve")
            ->assertOk()->assertJsonPath('data.approved_supplier.id', $first->json('data.approved_supplier.id'));

        $this->assertDatabaseCount('suppliers', 1);
        $this->assertDatabaseHas('suppliers', [
            'id' => $first->json('data.approved_supplier.id'), 'name' => 'Atlas Industrial Supply',
            'business_type' => 'Corporation', 'supply_category' => 'Industrial materials',
            'products_services' => 'Industrial materials, safety equipment, and local delivery services.', 'status' => 'ACTIVE',
        ]);
        $this->assertDatabaseMissing('suppliers', ['supplier_code' => null]);
        $this->assertSame(0, User::where('email', 'sales@atlas.test')->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'SUPPLIER_APPLICATION_APPROVED', 'resource_label' => $application->application_number]);
        $this->assertDatabaseHas('supplier_application_events', ['supplier_application_id' => $application->id, 'event_type' => 'APPROVED']);
    }

    public function test_rejection_requires_reason_and_never_creates_supplier(): void
    {
        $application = $this->submit();
        $application->update(['status' => SupplierApplication::STATUS_MEETING_COMPLETED]);
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/reject", [])->assertUnprocessable()->assertJsonValidationErrors('reason_codes');
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/reject", [
            'reason_codes' => ['CAPABILITY_NOT_MET'],
            'internal_note' => 'Category is outside the current approved sourcing scope.',
            'supplier_message' => 'This category is not currently being onboarded.',
        ])
            ->assertOk()->assertJsonPath('data.status', SupplierApplication::STATUS_REJECTED);

        $this->assertDatabaseCount('suppliers', 0);
        $this->assertDatabaseHas('supplier_applications', ['id' => $application->id, 'decision_reason' => 'Category is outside the current approved sourcing scope.']);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'SUPPLIER_APPLICATION_REJECTED',
            'resource_label' => $application->application_number,
        ]);
        $this->assertDatabaseHas('supplier_application_events', [
            'supplier_application_id' => $application->id,
            'event_type' => 'REJECTED',
            'description' => 'This category is not currently being onboarded.',
        ]);
    }

    public function test_approval_blocks_exact_normalized_company_or_email_duplicate(): void
    {
        Supplier::create(['supplier_code' => 'SUP-EXISTING', 'name' => 'Atlas Industrial Supply', 'email' => 'other@atlas.test', 'status' => 'ACTIVE']);
        $application = $this->submit();
        $application->update(['status' => SupplierApplication::STATUS_MEETING_COMPLETED]);

        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/approve")
            ->assertUnprocessable()->assertJsonValidationErrors('application');
        $this->assertDatabaseCount('suppliers', 1);
        $this->assertSame(SupplierApplication::STATUS_MEETING_COMPLETED, $application->fresh()->status);
    }

    public function test_initial_qualification_does_not_create_supplier_and_direct_approval_is_blocked(): void
    {
        $application = $this->submit();
        $application->update(['status' => SupplierApplication::STATUS_UNDER_REVIEW]);

        $this->actingAs($this->admin)
            ->postJson("/api/admin/supplier-applications/{$application->id}/qualify")
            ->assertUnprocessable();

        $date = now('Asia/Manila')->addDays(2);
        $slots = collect(range(0, 2))->map(fn (int $offset) => [
            'date' => $date->copy()->addDays($offset)->format('Y-m-d'),
            'start_time' => '14:00',
            'end_time' => '15:00',
        ])->all();
        $this->actingAs($this->admin)
            ->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", ['slots' => $slots])
            ->assertCreated()
            ->assertJsonPath('data.application.status', SupplierApplication::STATUS_QUALIFIED_FOR_MEETING)
            ->assertJsonCount(3, 'data.meeting_slots');

        $this->assertDatabaseCount('suppliers', 0);
        $this->assertDatabaseHas('supplier_application_events', [
            'supplier_application_id' => $application->id,
            'event_type' => 'QUALIFIED_FOR_MEETING',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'SUPPLIER_APPLICATION_MEETING_OPTIONS_PUBLISHED',
            'resource_label' => $application->application_number,
        ]);
        $this->actingAs($this->admin)
            ->postJson("/api/admin/supplier-applications/{$application->id}/approve")
            ->assertUnprocessable();
        $this->assertDatabaseCount('suppliers', 0);
    }
}
