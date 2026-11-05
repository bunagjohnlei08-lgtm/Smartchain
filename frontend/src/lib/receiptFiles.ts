export const RECEIPT_MAX_FILES = 4;
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export function createReceiptPreview(file: File, urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL) {
  let url: string | null = null;
  if (file.type.startsWith('image/')) {
    try { url = urls.createObjectURL(file); } catch { /* Keep the filename if preview creation fails. */ }
  }
  return {
    url,
    dispose: () => { if (url) { try { urls.revokeObjectURL(url); } catch { /* Cleanup must not interrupt the form. */ } } },
  };
}

export function validateReceiptFile(file: File): string | null {
  const extensions: Record<string, RegExp> = {
    'image/jpeg': /\.jpe?g$/i,
    'image/png': /\.png$/i,
    'application/pdf': /\.pdf$/i,
  };
  if (!extensions[file.type]?.test(file.name)) return `${file.name}: use JPG, PNG, or PDF with a matching file extension.`;
  if (file.size === 0) return `${file.name}: the receipt is empty.`;
  if (file.size > RECEIPT_MAX_BYTES) return `${file.name}: each receipt must not exceed 10 MB.`;
  return null;
}

export async function appendReceiptFiles(
  files: File[], incoming: File[], hashFile: (file: File) => Promise<string>,
): Promise<{ files: File[]; error: string | null }> {
  if (!incoming.length) return { files, error: null };
  if (files.length + incoming.length > RECEIPT_MAX_FILES) {
    return { files, error: 'A receiving may contain no more than 4 supplier receipt files.' };
  }
  const validationError = incoming.map(validateReceiptFile).find(Boolean);
  if (validationError) return { files, error: validationError };
  try {
    const knownHashes = new Set(await Promise.all(files.map(hashFile)));
    for (const file of incoming) {
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const signature = file.type === 'image/png' ? [137,80,78,71,13,10,26,10]
        : file.type === 'image/jpeg' ? [255,216,255] : [37,80,68,70,45];
      if (!signature.every((byte, index) => header[index] === byte)) {
        return { files, error: `${file.name}: the receipt content does not match its file type.` };
      }
      const hash = await hashFile(file);
      if (knownHashes.has(hash)) return { files, error: 'Duplicate file detected. This exact receipt has already been added.' };
      knownHashes.add(hash);
    }
    return { files: [...files, ...incoming], error: null };
  } catch {
    return { files, error: 'We could not read one of the selected receipts. Please select it again.' };
  }
}
