import { useEffect, useRef, useState } from "react";
import "./CalendarCat.css";

/** A small, decorative SVG companion. All motion stays in CSS. */
export function CalendarCat({ sleeping = false }: { sleeping?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    let inView = true;
    const update = () => setPaused(document.hidden || !inView);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
            update();
          });
    if (root.current) observer?.observe(root.current);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <div
      ref={root}
      className={`cat-stage ${sleeping ? "cat-sleeping" : "cat-day"}`}
      data-paused={paused}
      aria-hidden="true"
    >
      {sleeping && (
        <div className="cat-snores">
          <span>Z</span>
          <span>Z</span>
          <span>Z</span>
        </div>
      )}
      <div className="cat-traveler">
        <svg
          className="cat-art"
          viewBox="0 0 120 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
        >
          {sleeping ? (
            <g className="cat-breath">
              <ellipse cx="64" cy="73" rx="39" ry="23" fill="var(--cat-fur)" />
              <path
                d="M88 72C110 96 44 102 39 80"
                stroke="var(--cat-dark)"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path d="M23 65L21 43L39 53L53 44L58 68Z" fill="var(--cat-fur)" />
              <ellipse cx="39" cy="70" rx="23" ry="19" fill="var(--cat-fur)" />
              <path
                d="M26 50L28 59L34 56M49 51L43 56L51 59"
                fill="var(--cat-ear)"
              />
              <path
                d="M25 70Q30 75 35 70M42 70Q47 75 52 70"
                stroke="var(--cat-ink)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path d="M35 78L41 78L38 81Z" fill="var(--cat-ear)" />
              <ellipse cx="47" cy="89" rx="12" ry="5" fill="var(--cat-cream)" />
            </g>
          ) : (
            <>
              <path
                className="cat-tail"
                d="M47 79C17 86 15 65 20 48"
                stroke="var(--cat-dark)"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <g className="cat-walk-pose">
                <path
                  className="cat-leg cat-leg-back"
                  d="M43 74L37 93M77 74L83 93"
                  stroke="var(--cat-dark)"
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                <ellipse
                  cx="61"
                  cy="69"
                  rx="30"
                  ry="18"
                  fill="var(--cat-fur)"
                />
                <path
                  className="cat-leg cat-leg-front"
                  d="M48 75L52 93M81 73L75 93"
                  stroke="var(--cat-fur)"
                  strokeWidth="9"
                  strokeLinecap="round"
                />
              </g>
              <g className="cat-sit-pose">
                <path
                  d="M42 86Q37 70 57 54L80 54Q93 69 88 91L46 94Z"
                  fill="var(--cat-fur)"
                />
                <ellipse
                  cx="54"
                  cy="83"
                  rx="15"
                  ry="13"
                  fill="var(--cat-dark)"
                />
                <path
                  d="M72 71L70 92M83 71L82 92"
                  stroke="var(--cat-cream)"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
              </g>
              <g className="cat-head">
                <path
                  d="M62 52L59 25L76 35L94 24L98 52Z"
                  fill="var(--cat-fur)"
                />
                <path
                  d="M64 32L66 43L72 38M91 32L83 39L93 43"
                  fill="var(--cat-ear)"
                />
                <ellipse
                  cx="79"
                  cy="50"
                  rx="23"
                  ry="19"
                  fill="var(--cat-fur)"
                />
                <path
                  d="M75 33L77 40M83 33L82 40"
                  stroke="var(--cat-dark)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <g className="cat-eyes" fill="var(--cat-ink)">
                  <ellipse cx="70" cy="49" rx="2.3" ry="3.2" />
                  <ellipse cx="88" cy="49" rx="2.3" ry="3.2" />
                </g>
                <ellipse
                  cx="79"
                  cy="58"
                  rx="10"
                  ry="6"
                  fill="var(--cat-cream)"
                />
                <path d="M76 54L82 54L79 57Z" fill="var(--cat-ear)" />
                <path
                  d="M79 57V60M58 54L66 56M94 56L103 54"
                  stroke="var(--cat-ink)"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </g>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
