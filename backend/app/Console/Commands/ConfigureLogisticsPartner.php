<?php

namespace App\Console\Commands;

use App\Models\LogisticsPartner;
use Illuminate\Console\Command;

class ConfigureLogisticsPartner extends Command
{
    protected $signature = 'logistics:configure-partner
        {code : Stable uppercase partner code}
        {name : Display name}
        {--base-url= : Trusted HTTPS API base URL}
        {--request-path=/api/v1/delivery-requests : Delivery-request path}
        {--enable : Enable the partner after validation}
        {--supports-idempotency : Partner has contractually confirmed request idempotency}';
    protected $description = 'Create or update a logistics partner; secrets are entered through hidden prompts.';

    public function handle(): int
    {
        $code = strtoupper(trim((string) $this->argument('code')));
        $baseUrl = rtrim(trim((string) $this->option('base-url')), '/');
        $path = trim((string) $this->option('request-path'));
        if (! preg_match('/^[A-Z0-9_-]{2,50}$/', $code)) return $this->failCommand('Partner code must use 2-50 uppercase letters, numbers, underscore, or hyphen.');
        if ($this->option('enable') && (! filter_var($baseUrl, FILTER_VALIDATE_URL) || parse_url($baseUrl, PHP_URL_SCHEME) !== 'https')) {
            return $this->failCommand('An enabled partner requires a valid HTTPS base URL.');
        }
        if (! str_starts_with($path, '/') || str_contains($path, '..')) return $this->failCommand('Request path must be an absolute safe path.');

        $partner = LogisticsPartner::firstOrNew(['code' => $code]);
        $partner->fill([
            'name' => $this->argument('name'), 'base_url' => $baseUrl ?: null,
            'request_path' => $path, 'enabled' => (bool) $this->option('enable'),
            'supports_idempotency' => (bool) $this->option('supports-idempotency'),
        ]);
        $token = $this->secret('Partner-issued outbound bearer token (leave blank to keep current)');
        $callback = $this->secret('SmartChain-issued callback HMAC secret (leave blank to keep current)');
        if (filled($token)) $partner->outbound_token = $token;
        if (filled($callback)) $partner->callback_secret = $callback;
        if ($partner->enabled && (! filled($partner->outbound_token) || ! filled($partner->callback_secret))) return $this->failCommand('An enabled partner requires both credentials.');
        if ($partner->enabled && ! $partner->supports_idempotency) return $this->failCommand('Enablement requires confirmed idempotency support.');
        $partner->save();
        $this->info("Partner {$partner->code} saved; secrets remain encrypted and are never displayed.");
        return self::SUCCESS;
    }

    private function failCommand(string $message): int { $this->error($message); return self::FAILURE; }
}
