import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./CatParty.css";

const colors = [
  "#f6b653",
  "#ed83a7",
  "#86bca5",
  "#9d95df",
  "#69bce0",
  "#ed795c",
];

function PartyCat() {
  return (
    <svg viewBox="0 0 100 110" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M68 84Q101 98 88 61"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <ellipse cx="49" cy="77" rx="26" ry="26" fill="currentColor" />
      <ellipse cx="49" cy="81" rx="13" ry="17" fill="#fff4de" />
      <path d="M21 45L18 10L40 24L59 24L81 10L78 45Z" fill="currentColor" />
      <path d="M25 21L27 37L37 29M74 21L62 29L72 37" fill="#f5a9b5" />
      <ellipse cx="50" cy="46" rx="31" ry="26" fill="currentColor" />
      <path
        d="M32 45Q37 38 42 45M58 45Q63 38 68 45"
        stroke="#333849"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M45 51H55L50 57Z" fill="#d9758c" />
      <path
        d="M50 57Q44 64 40 57M50 57Q56 64 60 57M13 50L29 53M12 59L28 58M71 53L87 50M72 58L88 59"
        stroke="#333849"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M30 96V101M65 96V101"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function useCatParty() {
  const [party, setParty] = useState<{
    id: number;
    particles: CSSProperties[];
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const sequence = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  function celebrate() {
    clearTimeout(timer.current);
    setParty({
      id: ++sequence.current,
      particles: Array.from(
        { length: 100 },
        (_, index) =>
          ({
            left: `${Math.random() * 100}%`,
            color: colors[index % colors.length],
            "--size": `${index % 4 === 0 ? 85 + Math.random() * 75 : 18 + Math.random() * 28}px`,
            "--delay": `${Math.random() * 1.6}s`,
            "--duration": `${3 + Math.random() * 2}s`,
            "--drift": `${(Math.random() - 0.5) * 280}px`,
            "--spin": `${(Math.random() - 0.5) * 1080}deg`,
          }) as CSSProperties,
      ),
    });
    timer.current = setTimeout(() => setParty(null), 7000);
  }

  const confetti = (
    <>
      {party &&
        createPortal(
          <div key={party.id} className="cat-party-rain" aria-hidden="true">
            {party.particles.map((style, index) => (
              <div
                key={index}
                className={`cat-party-particle ${index % 4 === 0 ? "is-cat" : `is-confetti shape-${index % 3}`}`}
                style={style}
              >
                {index % 4 === 0 && <PartyCat />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );

  return { celebrate, confetti };
}
