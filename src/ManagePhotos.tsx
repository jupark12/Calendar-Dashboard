import { useEffect, useState } from "react";
import type { Photo } from "../shared/photos";
import { api } from "./data";

async function resize(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      1600 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare photos.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.82;
    let data = canvas.toDataURL("image/jpeg", quality).split(",")[1];
    while (Math.floor((data.length * 3) / 4) > 700_000 && quality > 0.4) {
      quality -= 0.1;
      data = canvas.toDataURL("image/jpeg", quality).split(",")[1];
    }
    if (Math.floor((data.length * 3) / 4) > 700_000)
      throw new Error("This photo is too detailed. Try a smaller image.");
    return data;
  } catch (error) {
    if (error instanceof DOMException)
      throw new Error("This image format cannot be opened on this device.");
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ManagePhotos({
  act,
  busy,
}: {
  act: (fn: () => Promise<unknown>) => Promise<boolean>;
  busy: boolean;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState("");
  async function refresh() {
    const result = (await api("/photos")) as { photos: Photo[] };
    setPhotos(result.photos);
  }
  useEffect(() => {
    void refresh().catch(() => setError("Unable to load photos."));
  }, []);
  return (
    <section className="panel settings-panel manage-photos">
      <h2>Family photos</h2>
      <p>
        Add up to 10 photos. The display changes photos every 10 seconds; swipe
        or tap a dot to move through them.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <label className="photo-upload">
        Add photos
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={busy || photos.length >= 10}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            setError("");
            if (files.length > 10 - photos.length) {
              setError(`Choose at most ${10 - photos.length} more photos.`);
              return;
            }
            void act(async () => {
              for (const file of files)
                await api("/photos", { data: await resize(file) });
              await refresh();
            });
          }}
        />
      </label>
      <div className="photo-manage-grid">
        {photos.map((photo, index) => (
          <div className="photo-manage-item" key={photo.id}>
            <img src={photo.url} alt={`Album photo ${index + 1}`} />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api(`/photos/${photo.id}`, {}, "DELETE");
                  await refresh();
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <small>{photos.length} of 10 photos</small>
    </section>
  );
}
