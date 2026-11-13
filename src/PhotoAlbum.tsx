import { useEffect, useId, useRef, useState } from "react";
import { maxPhotos, type Photo } from "../shared/photos";
import { api } from "./data";

const albumPollMs = 60 * 60 * 1000;
type AlbumState = { photos: Photo[]; checkedAt: number; error: string };
let albumState: AlbumState = { photos: [], checkedAt: 0, error: "" };
let albumRequest: Promise<AlbumState> | null = null;
const photoSources = new Map<string, string>();
const photoRequests = new Map<string, Promise<string>>();

function loadPhoto(photo: Photo): Promise<string> {
  const cached = photoSources.get(photo.id);
  if (cached) return Promise.resolve(cached);
  const pending = photoRequests.get(photo.id);
  if (pending) return pending;
  const request = fetch(photo.url, { credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error("Photo unavailable");
      return response.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      photoSources.set(photo.id, url);
      return url;
    })
    .finally(() => photoRequests.delete(photo.id));
  photoRequests.set(photo.id, request);
  return request;
}

function checkAlbum(): Promise<AlbumState> {
  if (albumRequest) return albumRequest;
  if (Date.now() - albumState.checkedAt < albumPollMs)
    return Promise.resolve(albumState);
  const checkedAt = Date.now();
  albumState = { ...albumState, checkedAt };
  albumRequest = api("/photos")
    .then((result: { photos: Photo[] }) => {
      albumState = { photos: result.photos, checkedAt, error: "" };
      return albumState;
    })
    .catch(() => {
      albumState = {
        ...albumState,
        error: "Photos are temporarily unavailable.",
      };
      return albumState;
    })
    .finally(() => {
      albumRequest = null;
    });
  return albumRequest;
}

const eucalyptusPositions = [
  { x: 3, y: 6, rotation: -38, scale: 0.95, flip: false },
  { x: 23, y: 2, rotation: 22, scale: 0.82, flip: true },
  { x: 49, y: 4, rotation: -19, scale: 0.9, flip: false },
  { x: 72, y: 1, rotation: 31, scale: 0.83, flip: true },
  { x: 98, y: 7, rotation: 42, scale: 1, flip: true },
  { x: 1, y: 34, rotation: -61, scale: 0.89, flip: false },
  { x: 99, y: 39, rotation: 67, scale: 0.93, flip: true },
  { x: 2, y: 72, rotation: -42, scale: 0.84, flip: true },
  { x: 98, y: 76, rotation: 56, scale: 0.87, flip: false },
  { x: 9, y: 98, rotation: 151, scale: 0.94, flip: true },
  { x: 34, y: 96, rotation: 196, scale: 0.81, flip: false },
  { x: 61, y: 99, rotation: 165, scale: 0.87, flip: true },
  { x: 83, y: 95, rotation: 202, scale: 0.84, flip: false },
  { x: 99, y: 98, rotation: 147, scale: 0.9, flip: true },
] as const;

const carnationPositions = [
  { x: 11, y: 17, rotation: -18, scale: 0.86, pink: true },
  { x: 29, y: 39, rotation: 25, scale: 0.78, pink: false },
  { x: 79, y: 20, rotation: -26, scale: 0.89, pink: false },
  { x: 95, y: 33, rotation: 17, scale: 0.82, pink: true },
  { x: 6, y: 53, rotation: 13, scale: 0.95, pink: false },
  { x: 19, y: 81, rotation: -29, scale: 0.84, pink: true },
  { x: 37, y: 62, rotation: 14, scale: 0.79, pink: true },
  { x: 52, y: 24, rotation: -10, scale: 0.88, pink: false },
  { x: 66, y: 72, rotation: 31, scale: 0.83, pink: true },
  { x: 86, y: 57, rotation: -15, scale: 0.93, pink: true },
  { x: 97, y: 87, rotation: 24, scale: 0.81, pink: false },
  { x: 3, y: 92, rotation: -22, scale: 0.82, pink: true },
  { x: 42, y: 91, rotation: 18, scale: 0.87, pink: false },
  { x: 71, y: 34, rotation: -31, scale: 0.8, pink: false },
  { x: 24, y: 12, rotation: 27, scale: 0.78, pink: true },
  { x: 91, y: 94, rotation: -12, scale: 0.88, pink: true },
] as const;

function EucalyptusSprig() {
  const leafId = useId();
  return (
    <svg
      className="photo-eucalyptus"
      viewBox="0 0 130 150"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <path
          id={leafId}
          d="M0 0 C12 -15 29 -18 38 -7 C28 4 13 9 0 0Z"
          fill="#819b83"
        />
      </defs>
      <g fill="none" stroke="#708b75" strokeWidth="1.7" strokeLinecap="round">
        <path d="M-12 2 C25 42 61 63 119 107" />
        <path d="M8 27 L1 65 M32 50 L54 25 M55 70 L42 104 M78 83 L103 52 M101 101 L88 135" />
      </g>
      <g opacity=".72">
        <use
          href={`#${leafId}`}
          transform="translate(1 65) rotate(-87) scale(.78)"
        />
        <use
          href={`#${leafId}`}
          transform="translate(54 25) rotate(-29) scale(.74)"
        />
        <use
          href={`#${leafId}`}
          transform="translate(42 104) rotate(-86) scale(.83)"
        />
        <use
          href={`#${leafId}`}
          transform="translate(103 52) rotate(-28) scale(.8)"
        />
        <use
          href={`#${leafId}`}
          transform="translate(88 135) rotate(-82) scale(.71)"
        />
      </g>
    </svg>
  );
}

function AlbumCarnation({ pink }: { pink: boolean }) {
  return (
    <svg className="photo-carnation" viewBox="0 0 80 100" aria-hidden="true">
      <g>
        <path
          d="M40 91 C39 72 42 59 40 45 M40 72 C29 68 23 64 19 57 M41 65 C52 61 57 56 61 51"
          fill="none"
          stroke="#718977"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M39 73 C27 62 17 66 17 57 C29 56 36 62 39 73 Z M41 66 C51 54 62 58 63 49 C52 49 44 55 41 66 Z"
          fill="#78937b"
          opacity=".8"
        />
        <g
          fill={pink ? "#d9afb6" : "#e7dfd2"}
          stroke="#ad8790"
          strokeWidth=".7"
        >
          <path d="M40 45 C22 51 16 37 22 26 L19 22 L24 20 L23 16 L29 17 L30 12 L35 16 L40 10 L45 16 L50 12 L52 18 L58 16 L57 21 L63 23 L59 27 C65 41 55 52 40 45 Z" />
          <path
            d="M40 45 C30 45 25 37 29 29 L27 26 L32 25 L32 21 L37 24 L40 20 L44 24 L49 21 L49 26 L54 27 L51 30 C55 38 49 45 40 45 Z"
            fill="none"
          />
          <path
            d="M31 32 Q35 27 40 32 Q45 27 49 32 M34 39 Q40 35 46 39"
            fill="none"
          />
        </g>
        <path
          d="M34 46 Q40 53 46 46"
          fill="none"
          stroke="#718977"
          strokeWidth="2"
        />
      </g>
    </svg>
  );
}

export function PhotoAlbum() {
  const [photos, setPhotos] = useState<Photo[]>(() => albumState.photos);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(() => albumState.error);
  const [sources, setSources] = useState<Record<string, string>>(() =>
    Object.fromEntries(photoSources),
  );
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const firstDot = Math.min(
    Math.max(0, index - 2),
    Math.max(0, photos.length - 5),
  );
  const visibleDots = photos.slice(firstDot, firstDot + 5);
  useEffect(() => {
    let active = true;
    let timer: number;
    function schedule() {
      window.clearTimeout(timer);
      if (!active || document.hidden) return;
      timer = window.setTimeout(
        () => void refresh(),
        Math.max(1000, albumState.checkedAt + albumPollMs - Date.now()),
      );
    }
    async function refresh() {
      if (document.hidden) return;
      const result = await checkAlbum();
      if (!active) return;
      setPhotos(result.photos);
      setIndex((current) =>
        Math.min(current, Math.max(0, result.photos.length - 1)),
      );
      setError(result.error);
      schedule();
    }
    function onVisibilityChange() {
      if (document.hidden) window.clearTimeout(timer);
      else void refresh();
    }
    void refresh();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const currentIds = new Set(photos.map((photo) => photo.id));
    let removed = false;
    for (const [id, url] of photoSources) {
      if (currentIds.has(id)) continue;
      URL.revokeObjectURL(url);
      photoSources.delete(id);
      removed = true;
    }
    if (removed) setSources(Object.fromEntries(photoSources));
    const lookahead = [photos[index], photos[(index + 1) % photos.length]];
    for (const photo of lookahead) {
      if (!photo) continue;
      void loadPhoto(photo)
        .then((url) => {
          if (active)
            setSources((current) => ({ ...current, [photo.id]: url }));
        })
        .catch(() => {
          /* Keep the album available if one image fails. */
        });
    }
    return () => {
      active = false;
    };
  }, [photos, index]);
  useEffect(() => {
    if (photos.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden)
        setIndex((current) => (current + 1) % photos.length);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [photos.length, index]);
  function move(direction: number) {
    setIndex(
      (current) => (current + direction + photos.length) % photos.length,
    );
  }
  return (
    <section
      className="photo-album panel"
      aria-label="Family photo album"
      tabIndex={0}
      onKeyDown={(event) => {
        if (photos.length < 2) return;
        if (event.key === "ArrowRight") move(1);
        if (event.key === "ArrowLeft") move(-1);
      }}
      onTouchStart={(event) => {
        touchStart.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      }}
      onTouchEnd={(event) => {
        if (!touchStart.current || photos.length < 2) return;
        const dx = event.changedTouches[0].clientX - touchStart.current.x;
        const dy = event.changedTouches[0].clientY - touchStart.current.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy))
          move(dx < 0 ? 1 : -1);
        touchStart.current = null;
      }}
    >
      <div className="photo-botanicals" aria-hidden="true">
        {eucalyptusPositions.map((position, index) => (
          <div
            className="photo-eucalyptus-placement"
            key={index}
            style={{
              left: `${position.x}%`,
              top: `${position.y}%`,
              transform: `translate(-50%, -50%) rotate(${position.rotation}deg) scale(${position.scale}) scaleX(${position.flip ? -1 : 1})`,
            }}
          >
            <EucalyptusSprig />
          </div>
        ))}
      </div>
      <div className="photo-carnations" aria-hidden="true">
        {carnationPositions.map((position, index) => (
          <div
            className="photo-carnation-placement"
            key={index}
            style={{
              left: `${position.x}%`,
              top: `${position.y}%`,
              transform: `translate(-50%, -50%) rotate(${position.rotation}deg) scale(${position.scale})`,
            }}
          >
            <AlbumCarnation pink={position.pink} />
          </div>
        ))}
      </div>
      {photos.length ? (
        sources[photos[index].id] ? (
          <img
            key={photos[index].id}
            src={sources[photos[index].id]}
            alt={`Family photo ${index + 1} of ${photos.length}`}
            draggable={false}
          />
        ) : (
          <div className="photo-empty">Loading photo…</div>
        )
      ) : (
        <div className="photo-empty">
          <span>✿</span>
          <h2>Your family album</h2>
          <p>
            {error ||
              `Add up to ${maxPhotos} photos in Manage to start the slideshow.`}
          </p>
          <a href="/manage">Manage photos ↗</a>
        </div>
      )}
      {photos.length > 1 && (
        <div
          className="photo-dots"
          aria-label="Choose a photo"
          role="group"
          onTouchStart={(event) => event.stopPropagation()}
          onTouchEnd={(event) => event.stopPropagation()}
        >
          <button
            className="photo-step"
            type="button"
            aria-label="Previous photo"
            onClick={() => move(-1)}
          >
            ‹
          </button>
          {visibleDots.map((photo, position) => (
            <button
              key={photo.id}
              className="photo-dot"
              type="button"
              aria-label={`Show photo ${firstDot + position + 1}`}
              aria-current={firstDot + position === index ? "true" : undefined}
              onClick={() => setIndex(firstDot + position)}
            />
          ))}
          <button
            className="photo-step"
            type="button"
            aria-label="Next photo"
            onClick={() => move(1)}
          >
            ›
          </button>
          <span className="photo-position">
            {index + 1}/{photos.length}
          </span>
        </div>
      )}
    </section>
  );
}
