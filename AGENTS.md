# Repository Guidelines

## Project Structure & Module Organization
The primary entry point is `server.js`, an Express webhook that accepts WhatsApp messages, normalizes URLs, enriches them, and forwards structured payloads to the Base44 API. Dependencies are managed at the repository root via `package.json`. A sibling folder, `base44-gpt-helper/`, holds experimental agent tooling and has its own Node manifest; it is not required for the webhook runtime. Environment variables (e.g., `BASE44_ENTITY_URL`, `BASE44_API_KEY`, `PORT`) should be kept in a local `.env` file that mirrors the keys referenced in `server.js`.

## Build, Test, and Development Commands
Run `npm install` once to sync dependencies. Use `npm start` to launch the webhook on `localhost:3000`; pair it with a tunnel such as `ngrok http 3000` when testing inbound WhatsApp traffic. The current `npm test` placeholder exits with code 1; replace it with meaningful coverage before relying on CI. For quick smoke checks, prefer `node --watch server.js` during local iteration.

## Coding Style & Naming Conventions
Code is written in modern ECMAScript modules (`type: "module"`). Follow the existing two-space indentation, trailing semicolons, and single-quote strings inside template literals. Keep route handlers small and delegate complex logic into helper functions near the top of `server.js`. When adding files, use descriptive camelCase for utilities (`cleanLinkedInUrl`), PascalCase for classes, and kebab-case for new filenames.

## Testing Guidelines
Automated tests are not yet in place; add Jest or a similar framework under a new `__tests__/` directory and update `npm test` accordingly. Name test files `<feature>.test.js` and cover both webhook branches (command messages such as `show`/`clear`) and API forwarding logic. When mocking `fetch`, assert that outbound payloads include `tags`, `category`, and `status`. For manual verification, send sample payloads with `curl` against `http://localhost:3000/api/whatsapp-webhook`.

## Commit & Pull Request Guidelines
Recent history favors short, imperative subject lines (`Add refresh, category…`, `Fix LinkedIn link cleaner`). Keep messages under 72 characters, and expand on context in the body if needed. Each PR should: describe the scenario being addressed, call out environment or configuration changes, attach screenshots or curl transcripts for webhook behavior, and link to any Base44 ticket. Request at least one review before merging.

## Configuration & Security Notes
Never commit `.env` files or Base44 API keys. Rotate keys after sharing test endpoints and clean up stale tunnels. Log statements in `server.js` prefix entries with contextual emojis; maintain that convention but avoid writing sensitive data to logs.
