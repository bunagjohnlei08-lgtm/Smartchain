<x-mail::message>
# SmartChain sign-in verification

Hello {{ $name }},

Someone signed in to your SmartChain account with your password. To finish signing in, enter this verification code:

<x-mail::panel>
<div style="font-size: 28px; font-weight: 700; letter-spacing: 8px; text-align: center;">{{ $code }}</div>
</x-mail::panel>

This code expires in {{ $expiresInMinutes }} {{ \Illuminate\Support\Str::plural('minute', $expiresInMinutes) }} and can be used only once.

**Do not share this code with anyone.** SmartChain staff will never ask you for it.

If you did not try to sign in, you can ignore this email, but you should change your password because someone may know it.

Thanks,<br>
The SmartChain Team
</x-mail::message>
