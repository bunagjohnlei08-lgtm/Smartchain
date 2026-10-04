<?php

namespace App\Support;

use Closure;
use Illuminate\Validation\Rules\Password;

final class PasswordPolicy
{
    /** @return array<int, mixed> */
    public static function rules(bool $confirmed = true, bool $required = true): array
    {
        return array_values(array_filter([
            $required ? 'required' : 'sometimes',
            'string',
            'max:72',
            $confirmed ? 'confirmed' : null,
            self::asciiCharacterMix(),
            Password::min(8)->mixedCase()->numbers()->symbols(),
        ]));
    }

    private static function asciiCharacterMix(): Closure
    {
        return static function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_string($value)) {
                return;
            }

            if (! preg_match('/[A-Z]/', $value)) {
                $fail('Password must contain at least one uppercase letter.');
            }
            if (! preg_match('/[a-z]/', $value)) {
                $fail('Password must contain at least one lowercase letter.');
            }
            if (! preg_match('/[0-9]/', $value)) {
                $fail('Password must contain at least one number.');
            }
            if (! preg_match('/\p{Z}|\p{S}|\p{P}/u', $value)) {
                $fail('Password must contain at least one special character.');
            }
        };
    }
}
