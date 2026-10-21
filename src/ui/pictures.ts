/** Portraits are shrunk before saving, so a phone photo doesn't add megabytes to the book. */
const MAX_SIDE = 600;
const KEEP_AS_IS_BYTES = 300_000;

export async function shrinkPicture(file: File): Promise<{ data: Uint8Array; type: string }> {
  const original = async () => ({ data: new Uint8Array(await file.arrayBuffer()), type: file.type || 'image/jpeg' });
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= KEEP_AS_IS_BYTES) return original();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return blob ? { data: new Uint8Array(await blob.arrayBuffer()), type: 'image/jpeg' } : original();
  } catch {
    return original();
  }
}
