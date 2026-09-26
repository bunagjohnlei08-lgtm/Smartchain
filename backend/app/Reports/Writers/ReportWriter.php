<?php

namespace App\Reports\Writers;

use App\Reports\ReportDefinition;

interface ReportWriter
{
    /**
     * Write the rows to a new temporary file and return its path.
     *
     * @param  iterable<int, array<string, mixed>>  $rows  export-formatted values keyed by column
     * @param  array{title: string, category: string, generated_at: string, filters: list<string>}  $meta
     */
    public function write(ReportDefinition $definition, iterable $rows, array $meta): string;

    public function extension(): string;

    public function mimeType(): string;
}
