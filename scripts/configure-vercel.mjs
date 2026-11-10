import { readFile, writeFile } from "node:fs/promises";
const input = process.argv[2];
if (!input)
  throw new Error(
    "Usage: npm run vercel:configure -- https://ID.execute-api.REGION.amazonaws.com",
  );
const url = new URL(input);
if (
  url.protocol !== "https:" ||
  !/^[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname) ||
  url.username ||
  url.password ||
  url.port ||
  url.search ||
  url.hash ||
  url.pathname !== "/"
)
  throw new Error(
    "Expected the AWS stack ApiUrl output (HTTPS, default stage, no path)",
  );
const config = JSON.parse(await readFile("vercel.json", "utf8"));
config.rewrites[0].destination = `${url.origin}/api/:path*`;
await writeFile("vercel.json", JSON.stringify(config, null, 2) + "\n");
console.log(
  "Configured Vercel API proxy. Commit vercel.json; this endpoint URL is public configuration.",
);
