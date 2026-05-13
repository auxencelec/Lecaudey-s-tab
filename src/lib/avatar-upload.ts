"use client";

/**
 * Client-side helper to resize an image (max 512px on the longest edge),
 * encode as JPEG, and upload to the Supabase "avatars" bucket.
 * Returns the public URL of the uploaded file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_DIM = 512;
const QUALITY = 0.85;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function resizeToBlob(file: File): Promise<Blob> {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponible.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encodage échoué."))),
      "image/jpeg",
      QUALITY
    )
  );
}

export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<{ url?: string; error?: string }> {
  try {
    const blob = await resizeToBlob(file);
    const path = `${userId}/avatar-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "3600",
      });
    if (error) return { error: error.message };

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return { url: data.publicUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'envoi." };
  }
}
