# AI Coach

A shared training pilot for front-office and back-office BPO teams. Trainers turn screenshots into interactive procedures, agents practise with an AI customer, and trainers approve assessment completion.

[Launch the live app](https://ai-coach-pilot.dipeshonnet.workers.dev/) · [GitHub repository](https://github.com/dipeshonnet/aicoach)

## Live pilot

The production app is hosted at [ai-coach-pilot.dipeshonnet.workers.dev](https://ai-coach-pilot.dipeshonnet.workers.dev/). Cloudflare Workers Builds is connected to this repository and deploys updates pushed to `main` to this URL.

The initial administrator login is saved privately in `.pilot-admin.json`; change its password in Account settings after signing in. This ignored file contains credentials and must stay private. Initial setup is complete, and the bootstrap secret has been removed.

The hosted pilot was verified with real Groq chat and turn-based voice assessments, private screenshot retrieval, trainer approval, and persisted completion across all required channels. Synthetic verification accounts and attempts are retained as examples.

## Stack

React + TypeScript + Vite, Hono on Cloudflare Workers, D1, private R2 screenshot storage, Better Auth email/password accounts, and Groq for conversation, coaching, grading, transcription, and speech.

## Run locally

Use Node.js 24 LTS.

1. Run `npm install`.
2. Add `GROQ_API_KEY` privately to `.dev.vars`. Never commit this file.
3. Run `npm run setup:local` to generate local authentication and bootstrap secrets. Existing Groq credentials are preserved.
4. Run `npm run db:local`.
5. Run `npm run dev` and open the printed local URL.
6. Create the first administrator in the setup screen using the private `BOOTSTRAP_TOKEN` from `.dev.vars`.

The first setup creates two published synthetic scenarios: delayed-order customer care and invoice-exception processing. No live customer information is included. Local and remote databases are separate.

Admins create accounts, client processes and batches, then grant trainers access to specific processes. Public registration is disabled. Agents sign in with their admin-created accounts and can change their passwords under Account settings. Admin password resets revoke existing sessions.

## Bulk people import

Admins and Trainers can use **People & access → Import CSV** to create or update up to 100 people per file. Download the template from the import dialog. Headers are `name,email,password,role,batchIds`; emails match existing accounts, roles are `agent`, `trainer`, or `admin`, and batch IDs are separated by semicolons. Existing memberships are preserved. A blank role preserves an existing role or defaults to agent for a new account.

New accounts require a password of 12–128 characters. Leave passwords blank for existing accounts; use the separate password reset action. Trainers can import agents only: new agents require an accessible batch, and existing agents must belong entirely to the trainer's assigned processes. The dialog reports created and updated counts and errors for individual rows. Files must be smaller than 500 KB.

## Training and authoring

- Author the scenario brief, reference instructions, expected outcome, and customer persona.
- Add ordered screenshot steps. Upload PNG, JPEG or WebP images up to 10 MB.
- Draw click regions and input fields, or add a centered region and edit its percentage coordinates.
- Configure required actions, accepted input answers, distractors, critical failures and critical steps.
- Preview the procedure, save the draft, then publish an immutable version.
- Use **Export SOP** on a scenario card or in the builder to download an editable Word document (`.docx`) with reference instructions, ordered steps, embedded screenshots, required inputs, and critical checks. Cards export the saved draft; the builder includes current unsaved edits. The document labels its draft revision or unsaved state, and exporting does not save or publish changes.
- Assign the published version to a batch or agent. Front-office assignments require chat, voice, or both; back-office assignments use workflow.
- Agents choose walkthrough, practice or assessment. Assessments omit reference instructions, hints and expected answers from the client.
- Review scored assessments and their action/transcript evidence. A passing assessment plus trainer approval completes that channel.

Practice and walkthrough attempts do not count toward completion. Failed attempts remain in history. Existing assignments stay pinned to their original published version when a trainer edits or republishes a scenario.

## Groq configuration

The default configurable models are:

| Variable          | Default                                |
| ----------------- | -------------------------------------- |
| `GROQ_TEXT_MODEL` | `openai/gpt-oss-120b` (hosted on Groq) |
| `GROQ_STT_MODEL`  | `whisper-large-v3-turbo`               |
| `GROQ_TTS_MODEL`  | `canopylabs/orpheus-v1-english`        |
| `GROQ_TTS_VOICE`  | `troy`                                 |

Groq organisation admins must accept the Orpheus model terms before speech generation is available: [Orpheus model page](https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english).

Voice is turn-based, with a 60-second recording limit. Audio is held transiently for transcription and playback; it is never stored in D1 or R2. Transcripts, actions, grades, feedback, and trainer decisions are retained. Communication scoring evaluates transcript content, not pronunciation or acoustic tone.

Missing credentials, provider failures and rate limits produce explicit errors. Saved dialogue and procedure progress survive failures. Retrying a failed customer reply does not append another agent message.

## Verify

- `npm test`: training rules, assessment redaction, critical failures, answer matching, per-channel completion, evidence validation, API routing and middleware boundaries, and overview access and query-count regressions.
- `npm run typecheck`: TypeScript checks.
- `npm run build`: production Worker and client builds.
- `npm run smoke`: local HTTP integration checks for accounts, roles, process isolation, D1 persistence, action validation, repeated requests, version history, retry history and trainer approval.
- `npm run smoke:ai`: live Groq chat, structured assessment, TTS, transcription, voice role-play and coaching. This makes billed provider requests.
- `node scripts/verify-client-secrets.mjs`: verifies that local runtime secret values are absent from the client build.

The smoke scripts operate only on localhost and create synthetic test data. They store random local test credentials in ignored `.local-*.json` files; they never print passwords or keys. Do not upload those files. `node scripts/browser-state.mjs` prepares a private Playwright session for local browser verification.

## Code organization

- `src/App.tsx` handles session state and loads the signed-in workspace on demand; `src/components/Workspace.tsx` owns navigation. `WorkspaceRoutes.tsx` owns role-specific routes and loads each screen on demand, with loading and recoverable error states.
- `src/pages/` has one module per screen. Shared dialogs, the screenshot editor, and assessment results live in `src/components/`.
- `src/lib/overview.tsx` provides workspace data to screens without importing the app entry point. `src/lib/query-keys.ts` keeps fetches, cache lookups, and invalidation on the same keys.
- `src/shared/` contains the types, validation schemas, and training rules shared by the frontend and Worker. Keep answer redaction and scoring rules here.
- `worker/index.ts` composes feature routers from `worker/routes/`. Register public authentication and setup routes before the session middleware, and keep every other API router after it.
- `worker/middleware.ts` owns request limits, origin checks, session checks, logging, and error responses; `worker/http.ts` handles JSON parsing. Database access and attempt locking remain in `worker/store.ts`, and provider calls remain in `worker/ai.ts`.
- `worker/overview.ts` loads workspace data with SQL access filters and a fixed number of reads (seven for staff, five for agents, excluding session lookup). Assignment history and batch membership are grouped once. `src/shared/collections.ts` provides the same ordered grouping helper for progress and batch screens.
- `tests/helpers/database.ts` provides an in-memory SQLite adapter for D1 integration tests and discovers all tracked SQL migrations in filename order. TypeScript rejects unused imports and parameters during type checking and builds.

After updating an existing installation, run `npm run db:local` locally and apply `npm run db:remote` before the next hosted deployment. Migration `0003_overview_indexes.sql` adds indexes for overview access queries without changing stored training data.

## Cloudflare deployment

The existing `ai-coach-pilot` Worker is connected directly to [dipeshonnet/aicoach](https://github.com/dipeshonnet/aicoach). Pushes to `main` trigger Cloudflare Workers Builds, using the repository root `/`, build command `npm run build`, and deploy command `npx wrangler deploy`. Deployment status and build logs are available in the Worker's Cloudflare dashboard. Production continues to use the existing D1 database, R2 bucket, and runtime secrets.

The steps below describe manual deployment and initial setup. For routine updates to this pilot, push to `main` and verify that its Cloudflare build succeeds.

To check automatic deployments, open [AI Coach deployments in Cloudflare](https://dash.cloudflare.com/68f7d76f0db9c20630b0b4b97505f5d0/workers/services/view/ai-coach-pilot/production/deployments). Confirm the latest commit is ready and serving production traffic before treating an update as live. If pushes do not start builds, check **Settings → Builds**: the Git repository should be `dipeshonnet/aicoach`, the production branch should be `main`, and **Disable builds** should be off.

1. Sign in with `npx wrangler login`. If browser callbacks are unavailable, use `npx wrangler login --device`.
2. Create a dedicated D1 database and R2 bucket: `npx wrangler d1 create ai-coach-pilot` and `npx wrangler r2 bucket create ai-coach-pilot-screenshots`.
3. Replace the local placeholder `database_id` in `wrangler.jsonc` with the returned D1 ID. Set `account_id` if your login has access to several accounts. Choose separate resource names if these names are already in use.
4. Apply the tracked migrations with `npm run db:remote`.
5. Build and deploy with `npm run deploy`.
6. Set `BETTER_AUTH_SECRET`, `BOOTSTRAP_TOKEN`, and `GROQ_API_KEY` using Cloudflare runtime secrets. Local `.dev.vars` credentials are not automatically configured on the hosted Worker.
7. Set `APP_URL` to the returned HTTPS URL and deploy again. Authentication must use the canonical origin.
8. Open the hosted setup screen and create the initial administrator. Remove `BOOTSTRAP_TOKEN` after setup with `npx wrangler secret delete BOOTSTRAP_TOKEN`.
9. Verify sign-in, screenshot retrieval, chat/voice practice, assessment submission, trainer approval, and progress against the hosted application.

R2 must be enabled on the Cloudflare account. Native scrypt password hashing is used through Better Auth's supported password hooks; verify the deployed account's Worker CPU allowance against login and account-creation requests. The application fails closed if its auth secret is missing.

The API and frontend share one origin. Secrets and expected answers remain server-side. Screenshots are served only after assignment or process-access checks, with private non-cacheable responses. Operational logs contain request IDs, paths, status codes and AI latency, without credentials or dialogue contents.
