import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";
import { secretSchema } from "../aws/model";
try {
  process.loadEnvFile(".env");
  const name = process.env.CONFIG_PARAMETER || "/home-hq/production/config";
  if (!/^\/[a-zA-Z0-9_/.-]+$/.test(name))
    throw new Error("Invalid parameter name");
  const config = secretSchema.safeParse({
    adminPassword: process.env.ADMIN_PASSWORD,
    displayPassword: process.env.DISPLAY_PASSWORD,
    feeds: JSON.parse(process.env.CALENDAR_FEEDS || "{}"),
    userAgent: process.env.WEATHER_USER_AGENT || "HomeHQ/1.0",
  });
  if (!config.success || process.env.DEMO_MODE !== "false")
    throw new Error("Invalid live configuration");
  const value = JSON.stringify(config.data);
  if (Buffer.byteLength(value) > 4096)
    throw new Error("Configuration exceeds Standard parameter size");
  if (process.argv.includes("--dry-run")) {
    console.log(
      `Validated ${Object.keys(config.data.feeds).length} private feeds and both passwords; configuration fits the SSM Standard limit. Nothing was uploaded.`,
    );
  } else {
    await new SSMClient({}).send(
      new PutParameterCommand({
        Name: name,
        Type: "SecureString",
        Tier: "Standard",
        Value: value,
        Overwrite: process.argv.includes("--replace"),
        Description: "Home HQ private backend configuration",
      }),
    );
    console.log(
      `Saved private configuration to ${name}. No secret values were printed.`,
    );
  }
} catch {
  console.error(
    "Configuration upload failed. Check AWS credentials/region, live .env values, and the 4 KB limit. If intentionally replacing an existing parameter, add --replace.",
  );
  process.exitCode = 1;
}
