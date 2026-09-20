<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Brevo did not accept a transactional message.
 *
 * The message is a short, developer-facing summary only. Diagnostics (HTTP
 * status, Brevo error code) are logged by BrevoTransactionalMail; nothing that
 * could carry the API key, an OTP or an invitation token is attached here,
 * because callers report() this exception.
 */
class BrevoDeliveryException extends RuntimeException {}
