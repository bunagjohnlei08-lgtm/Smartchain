<x-mail::message>
# SmartChain password reset

Hello {{ $name }},

We received a request to reset the password for your SmartChain account.

Your verification code is:

<x-mail::panel>
<div style="font-size: 28px; font-weight: 700; letter-spacing: 8px; text-align: center;">{{ $code }}</div>
</x-mail::panel>

This code expires in {{ $expiresInMinutes }} {{ \Illuminate\Support\Str::plural('minute', $expiresInMinutes) }} and can be used only once.

If you did not request a password reset, you can ignore this email.

Thanks,<br>
Archon Nell Incorporated<br>
SmartChain
</x-mail::message>
