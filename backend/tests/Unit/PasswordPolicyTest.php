<?php

namespace Tests\Unit;

use App\Support\PasswordPolicy;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PasswordPolicyTest extends TestCase
{
    public function test_valid_password_is_accepted(): void
    {
        $validator = Validator::make([
            'password' => 'Smartchain@2026',
            'password_confirmation' => 'Smartchain@2026',
        ], ['password' => PasswordPolicy::rules()]);

        $this->assertFalse($validator->fails(), $validator->errors()->first('password'));
    }

    #[DataProvider('invalidPasswords')]
    public function test_every_password_requirement_is_mandatory(string $password): void
    {
        $validator = Validator::make([
            'password' => $password,
            'password_confirmation' => $password,
        ], ['password' => PasswordPolicy::rules()]);

        $this->assertTrue($validator->fails());
        $this->assertTrue($validator->errors()->has('password'));
    }

    /** @return array<string, array{string}> */
    public static function invalidPasswords(): array
    {
        return [
            'missing uppercase' => ['smartchain@2026'],
            'missing lowercase' => ['SMARTCHAIN@2026'],
            'missing number' => ['Smartchain@Password'],
            'missing symbol' => ['Smartchain2026'],
            'below minimum length' => ['Sm@1'],
        ];
    }

    public function test_password_confirmation_must_match(): void
    {
        $validator = Validator::make([
            'password' => 'Smartchain@2026',
            'password_confirmation' => 'Different@2026',
        ], ['password' => PasswordPolicy::rules()]);

        $this->assertTrue($validator->fails());
        $this->assertTrue($validator->errors()->has('password'));
    }
}
