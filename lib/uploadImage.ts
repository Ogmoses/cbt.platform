import { createClient } from "@/lib/supabase/client";

export type ImageBucket = "question-images" | "school-assets";

const LIMITS: Record<ImageBucket, { maxBytes: number; types: string[]; label: string }> = {
  "question-images": { maxBytes: 5 * 1024 * 1024, types: ["image/png", "image/jpeg", "image/webp", "image/gif"], label: "PNG, JPG, WebP or GIF" },
  // PNG/JPEG only: @react-pdf/renderer (report cards) can't draw SVG or WebP.
  "school-assets": { maxBytes: 2 * 1024 * 1024, types: ["image/png", "image/jpeg"], label: "PNG or JPG" },
};

/**
 * Phone photos are often 3–8 MB. Downscales anything large to at most
 * `maxDim` px on its longest side before upload (GIFs are left alone so
 * animation isn't flattened). Falls back to the original file on any failure.
 */
async function shrinkIfLarge(file: File, maxDim = 1600): Promise<File> {
  if (file.type === "image/gif" || file.size < 1.2 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const keepPng = file.type === "image/png";
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, keepPng ? "image/png" : "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: blob.type });
  } catch {
    return file;
  }
}

/**
 * Uploads an image to Supabase Storage and returns its public URL.
 * Throws an Error with a user-readable message on any failure.
 *
 * - question-images: stored under `<user id>/<uuid>.<ext>` (RLS only lets a
 *   teacher write inside their own folder)
 * - school-assets: stored under `logo/<uuid>.<ext>` (admin-only)
 */
export async function uploadImage(bucket: ImageBucket, file: File): Promise<string> {
  const limits = LIMITS[bucket];
  if (!limits.types.includes(file.type)) throw new Error(`Unsupported image type. Use ${limits.label}.`);

  const toUpload = await shrinkIfLarge(file);
  if (toUpload.size > limits.maxBytes) {
    throw new Error(`That image is too large (max ${Math.round(limits.maxBytes / 1024 / 1024)} MB).`);
  }

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You're signed out. Sign in again and retry.");

  const ext = (toUpload.type.split("/")[1] ?? "png").replace("jpeg", "jpg");
  const folder = bucket === "question-images" ? auth.user.id : "logo";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, toUpload, { contentType: toUpload.type, upsert: false });
  if (error) throw new Error(error.message || "Upload failed. Try again.");

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
