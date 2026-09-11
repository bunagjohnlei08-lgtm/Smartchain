<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\WorkflowNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_notification_endpoints_require_authentication(): void
    {
        $this->getJson('/api/notifications')->assertUnauthorized();
        $this->getJson('/api/notifications/recent')->assertUnauthorized();
        $this->putJson('/api/notifications/read-all')->assertUnauthorized();
        $this->putJson('/api/notifications/'.Str::uuid().'/read')->assertUnauthorized();
    }

    public function test_notifications_are_filtered_paginated_and_scoped_to_current_user(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $userA->notify(new WorkflowNotification('Unread A', 'For A', 'info', 'A-1', 'System'));
        $userA->notify(new WorkflowNotification('Read A', 'For A', 'success', 'A-2', 'System'));
        $userA->notifications()->where('data', 'like', '%A-2%')->firstOrFail()->markAsRead();
        $userB->notify(new WorkflowNotification('Private B', 'For B', 'warning', 'B-1', 'System'));

        $this->actingAs($userA)->getJson('/api/notifications?filter=all&per_page=1')
            ->assertOk()->assertJsonPath('total', 2)->assertJsonPath('unread_count', 1)
            ->assertJsonPath('meta.per_page', 1)->assertJsonMissing(['title' => 'Private B']);

        $this->actingAs($userA)->getJson('/api/notifications?filter=unread')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Unread A');
    }

    public function test_reading_one_notification_preserves_other_unread_notifications_and_is_idempotent(): void
    {
        $user = User::factory()->create();
        foreach (range(1, 4) as $number) {
            $user->notify(new WorkflowNotification('Stock In Completed', 'Inventory updated.', 'success', "RCV-{$number}", 'Stock In'));
        }
        $notification = $user->notifications()->firstOrFail();
        $originalData = $notification->data;
        $originalCreatedAt = $notification->created_at->toISOString();

        $response = $this->actingAs($user)->putJson("/api/notifications/{$notification->id}/read")
            ->assertOk()->assertJsonPath('id', $notification->id)->assertJsonPath('unread_count', 3);
        $readAt = $response->json('read_at');
        $this->assertNotNull($readAt);
        $this->assertSame($readAt, $notification->fresh()->read_at->toISOString());
        $this->assertSame($originalData, $notification->fresh()->data);
        $this->assertSame($originalCreatedAt, $notification->fresh()->created_at->toISOString());
        $this->assertSame(3, $user->unreadNotifications()->whereKeyNot($notification->id)->count());

        $this->getJson('/api/notifications/recent')->assertOk()->assertJsonPath('unread_count', 3);
        $this->getJson('/api/notifications?filter=unread')->assertOk()->assertJsonCount(3, 'data')
            ->assertJsonMissing(['id' => $notification->id]);

        $this->travel(1)->minute();
        $this->putJson("/api/notifications/{$notification->id}/read")
            ->assertOk()->assertJsonPath('read_at', $readAt)->assertJsonPath('unread_count', 3);

        $this->putJson('/api/notifications/read-all')->assertOk()->assertJsonPath('unread_count', 0);
        $this->assertSame(0, $user->unreadNotifications()->count());
    }

    public function test_single_read_cannot_modify_another_users_notification_or_a_missing_notification(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $otherUser->notify(new WorkflowNotification('Private notification', 'For another user', 'info', 'OTHER'));
        $notification = $otherUser->notifications()->firstOrFail();

        $this->actingAs($user)->putJson("/api/notifications/{$notification->id}/read")->assertNotFound();
        $this->putJson('/api/notifications/'.Str::uuid().'/read')->assertNotFound();
        $this->putJson('/api/notifications/not-a-uuid/read')->assertNotFound();
        $this->assertNull($notification->fresh()->read_at);
        $this->assertSame(1, $otherUser->unreadNotifications()->count());
    }

    public function test_recent_is_limited_and_mark_all_read_does_not_touch_another_user(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        foreach (range(1, 6) as $number) {
            $userA->notify(new WorkflowNotification("A {$number}", 'For A', 'info', "A-{$number}"));
        }
        $userB->notify(new WorkflowNotification('Private B', 'For B', 'warning', 'B-1'));

        $this->actingAs($userA)->getJson('/api/notifications/recent')
            ->assertOk()->assertJsonCount(5, 'data')->assertJsonPath('unread_count', 6)
            ->assertJsonMissing(['title' => 'Private B']);

        $this->actingAs($userA)->putJson('/api/notifications/read-all')
            ->assertOk()->assertJsonPath('unread_count', 0);

        $this->assertSame(0, $userA->unreadNotifications()->count());
        $this->assertSame(1, $userB->unreadNotifications()->count());
    }
}
