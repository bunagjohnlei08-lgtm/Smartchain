<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Validation\Rule;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'filter' => ['nullable', Rule::in(['all', 'unread'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $user = $request->user();
        $total = $user->notifications()->count();
        $query = ($validated['filter'] ?? 'all') === 'unread'
            ? $user->unreadNotifications()
            : $user->notifications();
        $page = $query->latest('created_at')->paginate($validated['per_page'] ?? 15);

        return response()->json([
            'data' => $page->getCollection()->map(fn (DatabaseNotification $notification) => $this->serialize($notification)),
            'total' => $total,
            'unread_count' => $user->unreadNotifications()->count(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function recent(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'data' => $user->notifications()->latest('created_at')->limit(5)->get()
                ->map(fn (DatabaseNotification $notification) => $this->serialize($notification)),
            'unread_count' => $user->unreadNotifications()->count(),
        ]);
    }

    public function read(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()->notifications()->whereKey($id)->firstOrFail();
        $notification->markAsRead();

        return response()->json([
            'id' => $notification->id,
            'read_at' => $notification->fresh()->read_at->toISOString(),
            'unread_count' => $request->user()->unreadNotifications()->count(),
        ]);
    }

    public function readAll(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return response()->json(['unread_count' => 0]);
    }

    private function serialize(DatabaseNotification $notification): array
    {
        $data = $notification->data;

        return [
            'id' => $notification->id,
            'title' => (string) ($data['title'] ?? ''),
            'message' => (string) ($data['message'] ?? ''),
            'type' => (string) ($data['type'] ?? 'info'),
            'reference_id' => (string) ($data['reference_id'] ?? ''),
            'category' => $data['category'] ?? null,
            'read_at' => $notification->read_at?->toISOString(),
            'created_at' => $notification->created_at?->toISOString(),
        ];
    }
}
