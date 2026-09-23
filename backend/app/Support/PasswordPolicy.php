<?php

namespace App\Support;

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
            Password::min(8)->letters()->numbers(),
        ]));
    }
}
