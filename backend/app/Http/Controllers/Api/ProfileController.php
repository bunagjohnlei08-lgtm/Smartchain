<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Throwable;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    private const PROTECTED_FIELDS = [
        'id',
        'user_id',
        'employee_id',
        'role_id',
        'department_id',
        'branch_id',
        'warehouse_id',
        'status',
        'permissions',
        'password',
        'profile_photo_path',
    ];

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->profile($request->user()));
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            ...array_fill_keys(self::PROTECTED_FIELDS, ['prohibited']),
        ]);

        $user->update([
            'name' => $validated['name'],
            'email' => $validated['email'],
        ]);

        return response()->json($this->profile($user->refresh()));
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
        ]);

        $user = $request->user();
        if (! Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->password = $validated['password'];
        $user->save();

        return response()->json(['message' => 'Password changed successfully.']);
    }

    public function updatePhoto(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'user_id' => ['prohibited'],
        ]);

        $disk = Storage::disk('public');
        $newPath = $disk->putFile('profile-photos', $validated['photo']);
        if (! $newPath) {
            abort(500, 'Unable to store profile photo.');
        }

        $user = $request->user();
        $oldPath = $user->profile_photo_path;

        try {
            $user->profile_photo_path = $newPath;
            $user->saveOrFail();
        } catch (Throwable $exception) {
            $disk->delete($newPath);
            throw $exception;
        }

        if ($oldPath && $oldPath !== $newPath) {
            $disk->delete($oldPath);
        }

        return response()->json($this->profile($user->refresh()));
    }

    public function removePhoto(Request $request): JsonResponse
    {
        $user = $request->user();
        $oldPath = $user->profile_photo_path;

        $user->profile_photo_path = null;
        $user->saveOrFail();

        if ($oldPath) {
            Storage::disk('public')->delete($oldPath);
        }

        return response()->json($this->profile($user->refresh()));
    }

    private function profile(User $user): array
    {
        $user->loadMissing(['role', 'department', 'branch', 'warehouse']);

        return [
            'id' => $user->id,
            'employee_id' => $user->employee_id,
            'name' => $user->name,
            'email' => $user->email,
            'status' => $user->status,
            'profile_photo_url' => $user->profile_photo_path
                ? Storage::disk('public')->url($user->profile_photo_path)
                : null,
            'role' => $user->role ? [
                'name' => $user->role->name,
                'slug' => $user->role->slug,
            ] : null,
            'department' => $user->department?->only(['id', 'name', 'code']),
            'branch' => $user->branch?->only(['id', 'name', 'code']),
            'warehouse' => $user->warehouse?->only(['id', 'name', 'code']),
        ];
    }
}
