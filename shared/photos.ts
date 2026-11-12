import { z } from "zod";

export const maxPhotos = 100;
export const maxPhotoBytes = 300_000;
export const photoIdSchema = z.string().uuid();
export const photoUploadSchema = z.object({
  data: z.string().max(Math.ceil((maxPhotoBytes * 4) / 3) + 100),
});
export type Photo = { id: string; url: string };

export function decodePhoto(data: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0)
    throw new Error("Invalid photo data");
  const bytes = Buffer.from(data, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > maxPhotoBytes ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  )
    throw new Error("Upload a JPEG photo under 300 KB");
  return bytes;
}
