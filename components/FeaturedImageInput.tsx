"use client";

import { useRef, useState } from "react";

export function FeaturedImageInput() {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <>
    <input ref={input} accept="image/jpeg,image/png,image/webp" name="featured_image_file" type="file" onChange={async () => {
      const element = input.current;
      const file = element?.files?.[0];
      if (!element || !file) return;
      setMessage("");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        element.value = "";
        setMessage("Choose a JPG, PNG, or WebP image.");
        return;
      }
      if (file.size <= 2 * 1024 * 1024) return;
      setBusy(true);
      // Prevent submitting the original large file while preparing its replacement.
      element.setCustomValidity("Please wait while the image is prepared.");
      let bitmap: ImageBitmap | undefined;
      try {
        bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare image.");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        let blob: Blob | null = null;
        for (const quality of [0.9, 0.8, 0.65, 0.5]) {
          blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
          if (blob && blob.size <= 2 * 1024 * 1024) break;
        }
        if (!blob || blob.size > 2 * 1024 * 1024) throw new Error("Please choose a smaller image.");
        const transfer = new DataTransfer();
        transfer.items.add(new File([blob], file.name.replace(/\.[^.]+$/, "") + (blob.type === "image/webp" ? ".webp" : ".png"), { type: blob.type }));
        element.files = transfer.files;
        setMessage("Image resized and ready to upload.");
      } catch {
        element.value = "";
        setMessage("Could not resize this image. Please choose a JPG, PNG, or WebP smaller than 2 MB.");
      } finally {
        bitmap?.close();
        element.setCustomValidity("");
        setBusy(false);
      }
    }} />
    <small role="status">{busy ? "Preparing image…" : message || "JPG, PNG, or WebP. Large images are resized automatically."}</small>
  </>;
}
