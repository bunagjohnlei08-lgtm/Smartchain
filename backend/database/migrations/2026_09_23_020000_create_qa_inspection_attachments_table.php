<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qa_inspection_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('qa_inspection_id')->constrained()->cascadeOnDelete();
            $table->string('original_name');
            $table->string('stored_path')->unique();
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('file_size');
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['qa_inspection_id', 'created_at']);
        });

        if (! Schema::hasColumn('qa_inspections', 'attachment_path')) {
            return;
        }

        DB::table('qa_inspections')
            ->whereNotNull('attachment_path')
            ->orderBy('id')
            ->each(function ($inspection): void {
                $path = (string) $inspection->attachment_path;
                $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
                $mime = match ($extension) {
                    'jpg', 'jpeg' => 'image/jpeg',
                    'png' => 'image/png',
                    'pdf' => 'application/pdf',
                    default => 'application/octet-stream',
                };
                $exists = Storage::disk('local')->exists($path);

                DB::table('qa_inspection_attachments')->insert([
                    'qa_inspection_id' => $inspection->id,
                    'original_name' => basename($path),
                    'stored_path' => $path,
                    'mime_type' => $mime,
                    'file_size' => $exists ? Storage::disk('local')->size($path) : 0,
                    'uploaded_by' => $inspection->inspected_by_id,
                    'created_at' => $inspection->created_at,
                    'updated_at' => $inspection->updated_at,
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('qa_inspection_attachments');
    }
};
