import { useState } from "react";
import { dateKey, weatherLabel } from "../shared/time";
import type { DashboardData } from "./data";
import { WeatherIcon } from "./WeatherIcon";
import { format, dayName } from "./dashboardFormat";
export function WeatherCard({ data, now }: { data: DashboardData; now: Date }) {
  const [forecast, setForecast] = useState(false);
  const weather = data.weather;
  const today = dateKey(now, data.settings.timezone);
  const daily = weather?.daily.find((d) => d.date === today);
  const hourly =
    weather?.hourly
      .filter((h) => Date.parse(h.time) >= now.getTime() - 3600000)
      .slice(0, 24) ?? [];
  const rain = hourly.find((h) => h.rain >= 40);
  return (
    <section className="weather panel">
      <div className="section-heading">
        <p className="eyebrow">{data.settings.location.name}</p>
        <button className="text-button" onClick={() => setForecast(!forecast)}>
          {forecast ? "Current weather" : "7-day forecast"} ↗
        </button>
      </div>
      {!weather ? (
        <p className="empty">
          Weather will appear after the first successful sync.
        </p>
      ) : forecast ? (
        <div className="daily-forecast">
          {weather.daily.map((d) => (
            <div key={d.date}>
              <span>
                {d.date === today
                  ? "Today"
                  : dayName(d.date, { weekday: "short" })}
              </span>
              <span className="weather-symbol">
                <WeatherIcon code={d.code} />
              </span>
              <strong>{Math.round(d.high)}°</strong>
              <span>{Math.round(d.low)}°</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="current-weather">
            <div>
              <div className="temperature">
                {Math.round(weather.current.temperature)}
                <span>°</span>
              </div>
              <p>{weatherLabel(weather.current.code)}</p>
              <small>
                Feels like {Math.round(weather.current.feelsLike)}°
                {daily &&
                  ` · H ${Math.round(daily.high)}°  L ${Math.round(daily.low)}°`}
              </small>
            </div>
            <div
              className="hero-weather"
              aria-label={weatherLabel(weather.current.code)}
            >
              <WeatherIcon code={weather.current.code} />
            </div>
          </div>
          <div className="hourly-forecast">
            {hourly
              .filter((_, i) => i % 3 === 0)
              .slice(0, 6)
              .map((h, i) => (
                <div key={h.time}>
                  <small>
                    {i === 0
                      ? "Now"
                      : format(new Date(h.time), data.settings.timezone, {
                          hour: "numeric",
                        })}
                  </small>
                  <span className="weather-symbol">
                    <WeatherIcon code={h.code} />
                  </span>
                  <strong>{Math.round(h.temperature)}°</strong>
                  <small className="rain-chance">{h.rain}%</small>
                </div>
              ))}
          </div>
          <div className="weather-note">
            <span>☂</span>
            {rain
              ? `${rain.rain}% chance of rain ${Math.max(0, Math.round((Date.parse(rain.time) - now.getTime()) / 3600000)) === 0 ? "this hour" : `in ~${Math.round((Date.parse(rain.time) - now.getTime()) / 3600000)} hours`}`
              : "Less than 40% rain chance in the next 24 hours"}
          </div>
          {daily && (
            <div className="sun-times">
              <span>
                ↑ Sunrise{" "}
                {format(new Date(daily.sunrise), data.settings.timezone, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <span>
                ↓ Sunset{" "}
                {format(new Date(daily.sunset), data.settings.timezone, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
