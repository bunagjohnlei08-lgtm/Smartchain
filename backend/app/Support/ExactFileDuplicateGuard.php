<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

final class ExactFileDuplicateGuard
{
    /**
     * Compute authoritative SHA-256 hashes and reject duplicate file contents.
     *
     * @param  iterable<int|string, UploadedFile>  $uploads
     * @param  iterable<int, string|null>  $persistedHashes
     * @return array<int|string, string>
     */
    public static function hashes(
        iterable $uploads,
        iterable $persistedHashes,
        string $field,
        string $duplicateMessage,
    ): array {
        $seen = [];
        foreach ($persistedHashes as $hash) {
            if (is_string($hash) && preg_match('/^[a-f0-9]{64}$/', $hash)) {
                $seen[$hash] = true;
            }
        }

        $hashes = [];
        foreach ($uploads as $index => $upload) {
            $temporaryPath = $upload->getRealPath();
            $hash = is_string($temporaryPath) ? hash_file('sha256', $temporaryPath) : false;

            if (! is_string($hash)) {
                throw ValidationException::withMessages([
                    $field => ['One of the uploaded files could not be read. Please select it again.'],
                ]);
            }

            if (isset($seen[$hash])) {
                throw ValidationException::withMessages([$field => [$duplicateMessage]]);
            }

            $seen[$hash] = true;
            $hashes[$index] = $hash;
        }

        return $hashes;
    }
}
