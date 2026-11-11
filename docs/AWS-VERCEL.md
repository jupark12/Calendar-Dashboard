# Deploy Home HQ on Vercel + AWS

This is the recommended hosted setup. Your Mac is needed for deployment commands, then can be switched off. The Android frame only needs the Vercel URL and its display password. No Google OAuth application or Google sign-in on the frame is needed.

## Architecture and costs

```text
Frame / phone → Vercel HTTPS (React static files)
                    └─ /api/* proxy → API Gateway HTTP API → API Lambda
                                                              ├─ DynamoDB: settings, lists, sessions
                                                              ├─ SSM: encrypted private configuration
                                                              └─ S3: sanitized integration snapshot + private photos
EventBridge (every hour) → Sync Lambda → Google ICS / Open-Meteo / NWS
                                      └─ S3: private raw caches + snapshot
```

There is no EC2 server, container, load balancer, NAT gateway, VPC, or always-running Node process. Lambda has no durable local database. SQLite remains available for local development and the alternative Docker deployment.

- **Vercel Hobby:** suitable for this personal household project; stay within its usage limits. [Hobby terms](https://vercel.com/docs/plans/hobby).
- **DynamoDB:** this template provisions 5 read and 5 write capacity units, below the published 25/25 allowance if your other tables have not consumed it. On-demand requests do not use that provisioned-capacity allowance. [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/).
- **AWS is not guaranteed permanently free.** API Gateway, S3 requests/storage, Lambda, logs, transfer, deployment artifacts, and optional backups can cost money. Eligibility depends on account age, plan, credits, region, and other workloads. API Gateway advertises time-limited allowances and credits for newer accounts. [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/), [Lambda pricing](https://aws.amazon.com/lambda/pricing/), [S3 pricing](https://aws.amazon.com/s3/pricing/), [SSM pricing](https://aws.amazon.com/systems-manager/pricing/).
- One continuously open frame polling every hour makes about **720 dashboard API calls per 30-day month**; scheduled sync runs about **720 times**. The photo tile adds an album-list request every five minutes and one private image request for each photo when opened or refreshed. Additional devices add API calls. S3 snapshot reads are cached in each warm Lambda for 30 seconds. The API uses ETags and private/no-store headers; authenticated responses must not enter a shared CDN cache.
- Before deploying, create an AWS Billing **monthly cost budget** (for example $5) with email alerts at 50%, 80%, and 100%, and enable Free Tier usage alerts. Budgets and API throttles are alerts/traffic controls, **not hard spending caps**. Check actual Billing usage after the first day and week.

## 1. Prepare tools and AWS credentials

**This step has been completed on Jun's Mac.** The following versions and AWS identity were verified during setup:

| Tool / check | Verified result |
| --- | --- |
| Node.js | `v24.22.2` |
| AWS CLI | `2.39.6` |
| AWS SAM CLI | `1.171.0` |
| AWS profile | `default` |
| Authenticated IAM user | `serverlessAdmin` |

The identity check confirms working credentials, but does not prove that the user has every permission required to deploy the stack. No new `home-hq` profile is needed for this Mac.

In each new terminal, select the Homebrew Node 24 installation and the existing AWS profile, then work from the repository root:

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
export AWS_PROFILE=default
export AWS_REGION=us-east-1
cd /Users/junpark/Desktop/Code_Projects/Calendar-Dashboard
node --version
aws --version
sam --version
aws sts get-caller-identity
```

Expect Node `v24.x.x`, AWS CLI `2.x.x`, a SAM CLI version, and identity JSON containing `UserId`, `Account`, and `Arn`. Confirm that `Account` is the account you intend to deploy into. The identity check is read-only. To keep Node 24 selected in new terminals, add the `export PATH` line above to `~/.zshrc` once. If you use nvm instead of Homebrew for Node, use `nvm use` in this repository instead of changing PATH.

Install project dependencies and validate:

```sh
npm ci
npm run validate
```

For a fresh Mac with Homebrew, install the tools first (this is already done on Jun's Mac):

```sh
brew install node@24 awscli aws-sam-cli
```

See the official [AWS CLI installation](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and [SAM installation](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) if Homebrew is unavailable. Docker is **not required** for these bundled Node artifacts. Node 24 is an [AWS Lambda supported runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html).

**Resolved setup issue:** `aws --version` initially failed with `No module named 'cryptography'`. Upgrading the old Homebrew AWS CLI from `2.24.23` to `2.39.6` repaired its Python dependency mismatch. Both the version check and AWS authentication succeeded afterward. If the same error occurs on an older Homebrew installation:

```sh
brew upgrade awscli
aws --version
aws sts get-caller-identity --profile default --region us-east-1
```

On another machine without working credentials, authenticate using that account's normal method. For IAM Identity Center/SSO, an alternative setup is:

```sh
aws configure sso --profile home-hq
aws sso login --profile home-hq
export AWS_PROFILE=home-hq
export AWS_REGION=us-east-1
aws sts get-caller-identity
```

If that account uses IAM access keys instead of SSO, use `aws configure --profile home-hq`, then the same two exports and identity check. These alternative setup commands are unnecessary for Jun's already-working `default` profile. Use an IAM identity, not root access keys. Never put AWS keys in this repository, `.env`, or Vercel. Keep the same profile/region for every deployment command. Re-export them when opening a new terminal.

Your deployment identity needs CloudFormation/SAM deployment permissions, IAM role creation and PassRole, and permission to manage Lambda, API Gateway v2, DynamoDB, S3, EventBridge rules, CloudWatch Logs, and SSM parameters. An existing personal-account administrator role can perform the initial deployment. The generated Lambda runtime roles are scoped to this stack's table/bucket/parameter.

You can check the current local setup without AWS credentials or network access:

```sh
npm run aws:config -- --dry-run
npm run aws:import -- --dry-run
```

## 2. Upload your existing private configuration

Your existing `.env` remains a **local-only** file. It already has the six feed URLs and two passwords. The upload command copies only `ADMIN_PASSWORD`, `DISPLAY_PASSWORD`, `CALENDAR_FEEDS`, and `WEATHER_USER_AGENT` into an encrypted SSM Standard parameter. It does not change your local origin or database configuration. Ensure `WEATHER_USER_AGENT` includes a real contact for NWS.

```sh
export CONFIG_PARAMETER=/home-hq/production/config
npm run aws:config
```

This sends the configuration directly to **your AWS account** using the SDK, without writing a plaintext export or printing secrets. It requires `DEMO_MODE=false`, distinct passwords (admin at least 20 characters, display at least 12 characters), and Google HTTPS feed URLs. The Standard parameter has a 4 KB limit; the six current feeds fit. The AWS-managed SSM encryption key is used. The parameter is deliberately managed outside CloudFormation, so its value never enters a template or change set.

If the parameter already exists and you intentionally want to replace it:

```sh
npm run aws:config -- --replace
```

Do not put these values in `VITE_*` variables or Vercel environment variables. The frontend needs **no secret configuration**.

## 3. Create the Vercel project and establish its permanent URL

Commit/push the prepared repository changes to your GitHub repository, then:

1. In Vercel, choose **Add New → Project**, import `jupark12/Calendar-Dashboard`, and use your personal **Hobby** account.
2. Set framework **Vite**, root directory the repository root, install command `npm ci`, build command `npm run build`, output directory `dist`, and Node.js version **24.x**.
3. Leave environment variables empty. Deploy.
4. Copy the stable **production domain**, for example `https://calendar-dashboard-yourname.vercel.app`. Use the project domain, not an individual deployment's generated preview URL. A paid custom domain is optional.

The first deployment's frontend will load, but login/API requests will fail because `vercel.json` intentionally contains a non-working placeholder backend. The next steps connect it. This prevents accidentally targeting another household's API.

If Vercel deployment protection is enabled for production, adjust it so the Android browser can reach this URL without a Vercel account. Home HQ still enforces its own display/admin passwords. Keep preview protection enabled if desired; preview URLs are not authorized production origins for login or edits.

## 4. Deploy the AWS backend

Replace the example below with the exact production URL from step 3, **without a trailing slash**:

```sh
export APP_ORIGIN=https://calendar-dashboard-yourname.vercel.app
npm run build:aws
sam validate --lint --template-file infra/template.yaml --region "$AWS_REGION"
sam deploy --guided --template-file infra/template.yaml --stack-name home-hq --region "$AWS_REGION" --parameter-overrides "AppOrigin=$APP_ORIGIN" "ConfigParameter=$CONFIG_PARAMETER"
```

The esbuild command creates `dist-aws/`; SAM packages that directory directly. **Do not run `sam build`** or try to deploy the local Express entrypoint.

For guided prompts:

- Stack name: `home-hq`; region: `us-east-1` (or your chosen region).
- AppOrigin: your exact production HTTPS URL; ConfigParameter: `/home-hq/production/config`.
- Confirm changes before deploy: **Y**.
- Allow SAM CLI IAM role creation: **Y**.
- Disable rollback: **N**.
- If asked whether the API function may be unauthenticated: **Y**. API Gateway itself is public; the Lambda implements application authentication and authorization. The dashboard/list data is not public.
- Save arguments to configuration: **Y**, default file/environment. `samconfig.toml` is ignored by Git. If SAM saves it beside the template, it is ignored there too.
- Review the change set and confirm deployment.

SAM creates an artifact bucket in addition to the application's cache bucket. It is used for code uploads. After deployment, capture outputs in the same shell:

```sh
export API_URL=$(aws cloudformation describe-stacks --stack-name home-hq --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue | [0]" --output text)
export TABLE_NAME=$(aws cloudformation describe-stacks --stack-name home-hq --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue | [0]" --output text)
export SYNC_FUNCTION=$(aws cloudformation describe-stacks --stack-name home-hq --query "Stacks[0].Outputs[?OutputKey=='SyncFunctionName'].OutputValue | [0]" --output text)
```

These are resource identifiers, not secrets. If any command returns `None`, stop and check the stack's CloudFormation Events/Outputs and selected profile/region.

## 5. Import the existing household

Pause edits in your local dashboard while importing. The read-only SQLite import takes a consistent snapshot, including committed WAL data. It copies **all six calendar definitions and names**, location/time zone, pickup/night settings, and grocery/to-do items with their versions. It does not copy sessions, passwords, or raw ICS caches.

```sh
npm run aws:import
```

The script uses `DATABASE_PATH` from your local `.env` and `TABLE_NAME` from step 4. It requires an existing live database and refuses to overwrite an initialized cloud household. Until it finishes, the cloud API blocks dashboard access and edits with a setup-incomplete response. On a partial failure, stop local edits and rerun using the same source; matching items can be resumed safely. Do not run imports concurrently. Once imported, AWS is the source of truth for the deployed app; future local SQLite changes do not synchronize to it.

Trigger the first integration refresh:

```sh
aws lambda invoke --function-name "$SYNC_FUNCTION" --cli-read-timeout 180 --payload '{}' /tmp/home-hq-sync-result.json
cat /tmp/home-hq-sync-result.json
```

Expected result is `{"ok":true}` with no `FunctionError` in the invocation metadata. `{"skipped":true}` means the scheduled worker currently holds the lock; wait a few minutes. This response contains only status, never calendar content. A successful invocation can still report individual provider failures in the app; verify them in step 7.

## 6. Connect Vercel to the new API

```sh
npm run vercel:configure -- "$API_URL"
git add vercel.json
git commit -m "Configure production Home HQ API proxy"
git push
```

The script checks that the URL is an AWS API Gateway default-stage HTTPS endpoint and updates the `/api/*` rewrite in `vercel.json`. This URL is public configuration and safe to commit. Wait for Vercel's Git-triggered **production deployment** to finish. If your changes are on a feature branch, merge them into the production branch first; a preview deployment does not change production.

[Vercel external rewrites](https://vercel.com/docs/routing/rewrites) proxy browser requests to AWS under the same Vercel origin. Secure, HttpOnly, SameSite=Strict cookies remain on that origin. CORS configuration and a separate API URL in the React code are unnecessary.

## 7. Verify and connect the frame

```sh
curl -fsS "$API_URL/api/health"
curl -fsS "$APP_ORIGIN/api/health"
curl -i "$APP_ORIGIN/api/dashboard"
```

Both health checks should return `{"ok":true}`; the unauthenticated dashboard must return **401**. The health route verifies routing and Lambda startup, not provider freshness.

Then check in a browser:

1. Open `APP_ORIGIN/manage`, sign in with the existing `.env` **admin password**. Verify all six calendar names, lists, location, and pickup schedules.
2. In Weather & status, verify successful sync timestamps. Confirm one known event and one recurring event against Google Calendar. The scheduler runs hourly, so calendar, weather, and alert updates may take about an hour, plus provider retry backoff or feed publication delay. Settings that change feed IDs/location/time zone show a waiting state until refreshed. Name/color/night/list edits apply immediately to the next dashboard poll.
3. Add/edit/delete a temporary list item. In a second browser session, refresh the page and confirm it appears. Without a refresh, it may take up to an hour. Try an invalid password and verify rejection.
4. Open the production URL in a private/incognito window, connect with the **display password**, and verify `/manage` cannot save changes as that role.
5. Open the same stable URL on the frame, connect with the display password, and follow the Android setup in the main README. No Google sign-in is needed.
6. Close the local development server and switch off the Mac. Confirm the frame continues refreshing. Test a brief Wi-Fi outage/reconnection and a frame reboot.

Display sessions last one year; admin sessions last 12 hours. Cloud sessions are stored as token hashes in DynamoDB and checked for expiry even before TTL cleanup. Rotating a role's password invalidates its existing cloud sessions after the configuration cache expires (up to 60 seconds). The cloud login limit is shared across the household: 10 attempts per 15-minute UTC window, including successful attempts.

## Updating, backup, recovery, and removal

For frontend changes, commit/push to Vercel's production branch. For backend/template changes, validate and redeploy as well. With the same exported variables from above:

```sh
npm ci
npm run validate
sam validate --lint --template-file infra/template.yaml --region "$AWS_REGION"
sam deploy --template-file infra/template.yaml --stack-name home-hq --region "$AWS_REGION" --resolve-s3 --capabilities CAPABILITY_IAM --parameter-overrides "AppOrigin=$APP_ORIGIN" "ConfigParameter=$CONFIG_PARAMETER" --confirm-changeset
```

Do **not** rerun the data import for normal updates. If the API URL changes, rerun `vercel:configure`, commit and redeploy Vercel. If the Vercel production domain changes, redeploy AWS with the new `AppOrigin` and reconnect devices; cookies belong to the old origin. Deploy backward-compatible AWS API changes before a frontend that depends on them.

To change calendar feeds/passwords, edit local `.env` and run `npm run aws:config -- --replace` in the correct account/region. Keep calendar IDs consistent with Home & calendars. No rebuild is required. Feed changes are detected on a subsequent sync and discard caches from the old configuration. Do not delete/reset feed URLs merely to redeploy.

**Backups:** DynamoDB and S3 survive function redeployments, but durability is not protection from accidental edits. Before a significant change, create a DynamoDB on-demand backup in AWS Console → DynamoDB → Tables → this table → Backups, or enable point-in-time recovery if its extra cost is acceptable. Backups/PITR are not enabled by this low-cost template. Keep your original local SQLite database until cloud verification is complete; it becomes stale after you start editing in the cloud. Integration cache objects can be rebuilt, but family photos cannot; keep originals elsewhere or arrange a separate backup. Never publish raw table exports, S3 objects, or SQLite files.

To restore, use DynamoDB's backup restore to a **new table**, then update both Lambda functions' `TABLE_NAME` to that restored table and adjust their IAM policies to its ARN. Incorporate the restored table into the CloudFormation template (or import it into the stack) before the next normal deploy so the change is not overwritten. Revoke restored sessions by rotating both passwords. A restore is a deliberate recovery operation; test it separately before relying on it.

**Troubleshooting:**

- **403 on login/save:** `AppOrigin` must exactly match the browser's production origin. Preview URLs, HTTP, trailing slashes in the parameter, or an old custom domain are common causes.
- **502/proxy failure:** check `vercel.json` destination, the latest production deployment, and direct API health. Never point the rewrite at localhost.
- **503 setup incomplete:** finish `aws:import` against the correct table/region.
- **503 service unavailable:** check CloudWatch Logs for the API function, SSM parameter existence/type, IAM permissions, and DynamoDB capacity/throttling. Infrastructure logs deliberately omit secrets and request bodies.
- **Missing events:** verify Settings IDs match the SSM feeds object, use the sync status panel, and check the Sync function logs/EventBridge schedule. Feed URLs must be Google HTTPS URLs. Never paste live feed URLs into public logs or issue reports.
- **Missing first snapshot:** invoke the Sync function and wait 30 seconds for the API's warm cache to expire.
- **Stuck old frontend:** reload; if necessary clear site data for the production origin and reconnect. The service worker caches the app shell, never authenticated API responses.
- **Deployment failed:** inspect CloudFormation Events, fix the error, and rerun. If a new stack is stuck in `ROLLBACK_COMPLETE`, delete the failed stack before recreating it; inspect any retained resources so you do not lose track of them.

**Removal:** disable/delete the Vercel project, then use `sam delete --stack-name home-hq --region "$AWS_REGION"` for compute/API/schedule/log resources. The household table and cache bucket deliberately have **Retain** policies, so stack deletion does not erase private household data. To stop all associated storage/capacity costs, separately delete those retained resources when no longer needed, remove old DynamoDB backups and deployment artifacts as appropriate, and delete `/home-hq/production/config` from SSM. Review the SAM artifact bucket before deleting it; it may serve other stacks.

## Verification boundary

Repository checks cover TypeScript, lint, local HTTP behavior, cloud handler authentication/authorization/conflicts, DynamoDB request conditions/pagination, sync locking/races, production frontend compilation, and loading/exercising the actual Lambda bundles with synthetic calendar data. CloudFormation lint is checked without account access. These checks do not provision AWS resources or prove IAM, live proxy cookies, account quota eligibility, provider connectivity from Lambda, or the physical frame. Steps 4–7 are the required real deployment acceptance checks.
