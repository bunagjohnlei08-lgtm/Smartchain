<x-mail::message>
# {{ $heading }}

Hello {{ $recipientName }},

{{ $messageText }}

**Application reference:** {{ $applicationReference }}

@if($meetingDate)
**Meeting schedule:** {{ $meetingDate }}
@endif

@if(count($meetingOptions))
**Available meeting options:**

@foreach($meetingOptions as $option)
- {{ $option }}
@endforeach
@endif

@if($actionUrl)
<x-mail::button :url="$actionUrl">
Open Supplier Application Portal
</x-mail::button>

This secure link is intended only for the application contact. Do not forward it.
@endif

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
