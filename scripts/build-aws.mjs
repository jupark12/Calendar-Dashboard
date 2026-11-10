import { build } from "esbuild";
import { rm, mkdir, writeFile } from "node:fs/promises";
await rm("dist-aws", { recursive: true, force: true });
await mkdir("dist-aws", { recursive: true });
await build({
  entryPoints: ["aws/api.ts", "aws/sync.ts"],
  outdir: "dist-aws",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  sourcemap: false,
  logLevel: "info",
});
// Explicit CommonJS allows the artifact to be imported locally from this ESM repo too.
await writeFile("dist-aws/package.json", JSON.stringify({ type: "commonjs" }));
