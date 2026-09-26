<?php

namespace App\Reports;

use RuntimeException;

/** Raised after a failed export has been recorded; its message is safe to show. */
class ReportGenerationFailed extends RuntimeException {}
