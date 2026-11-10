import { weatherLabel } from "../shared/time";

export function WeatherIcon({ code }: { code: number }) {
  const cloud = <path d="M7 18h11a4 4 0 0 0 .1-8 6 6 0 0 0-11.5 1.5A3.25 3.25 0 0 0 7 18Z" />;
  const sun = <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" /></>;
  let drawing;
  if (code === 0) drawing = sun;
  else if (code <= 3) drawing = cloud;
  else if (code <= 48) drawing = <path d="M3 8c3-2 5 2 8 0s5-2 10 0M3 13c3-2 5 2 8 0s5-2 10 0M3 18c3-2 5 2 8 0s5-2 10 0" />;
  else if (code <= 67 || (code > 77 && code <= 82)) drawing = <>{cloud}<path d="m9 20-1 2m5-2-1 2m5-2-1 2" /></>;
  else if (code <= 86) drawing = <>{cloud}<path d="M9 20v3m-1.5-1.5h3m3.5-1.5v3m-1.5-1.5h3" /></>;
  else drawing = <>{cloud}<path d="m13 18-3 4h3l-1 3 5-6h-3l1-1" /></>;
  return <svg className="weather-icon" viewBox="0 0 24 26" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={weatherLabel(code)}>{drawing}</svg>;
}
