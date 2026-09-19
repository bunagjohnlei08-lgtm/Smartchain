<x-mail::message>
# Welcome to SmartChain

Hello {{ $name }},

An administrator has created a SmartChain account for you. To start using it, activate your account and create your own password.

<x-mail::button :url="$activationUrl">
Activate Account
</x-mail::button>

This invitation link can be used once and expires in {{ $expiresInHours }} hours ({{ $expiresAt->format('F j, Y g:i A T') }}). If it expires, ask your administrator to send a new invitation.

SmartChain will never send you a password. You choose your own password when you activate your account.

If you did not expect this invitation, you can safely ignore this email. No one can use the account until the link is opened and a password is set.

<x-mail::subcopy>
If the "Activate Account" button does not work, copy and paste this link into your browser: <span class="break-all">[{{ $activationUrl }}]({{ $activationUrl }})</span>
</x-mail::subcopy>

Thanks,<br>
The SmartChain Team
</x-mail::message>
