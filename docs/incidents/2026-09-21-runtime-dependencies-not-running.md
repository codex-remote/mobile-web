# Development Runtime dependencies not running

## Symptom

`devrun crweb` builds successfully, but `service.sh restart supervised sse` fails its health check. The Supervisor log repeats `Relay: health check timed out`, ports `18874` and `18875` do not remain available, and launchd repeatedly starts a new Supervisor process.

## Affected scope

Only the source-worktree development stack is affected. The installed Runtime uses its own dynamically allocated PostgreSQL and Valkey ports and can remain healthy at the same time.

## Root cause and fast diagnosis

Relay exits before opening `/healthz` when its default development PostgreSQL on `127.0.0.1:54329` or Redis on `127.0.0.1:63799` is unavailable. Confirm the actual cause in `.run/mobileweb/supervisor-sse/relay.stderr.log`, then inspect the two ports or the `relay-server-postgres-1` and `relay-server-redis-1` containers. Do not infer dependency health from the installed Runtime.

## Recovery and prevention

Run `devrun crweb` again. The canonical deployment entry point now runs `docker compose up -d --wait postgres redis` from the Relay repository before building or restarting the development stack. It starts only the missing default data services and preserves their named volumes. When external data services are intentional, set `RUNTIME_DATABASE_URL` and `RUNTIME_REDIS_URL`; the launcher skips the corresponding default containers.

If startup fails, inspect `.run/mobileweb/runtime-dependencies.log`. Start Docker Desktop when Docker or Compose is unavailable, then rerun the same command. Do not point the development stack at the installed Runtime's private data services.

## Verification

A successful deployment requires both dependency containers to report healthy, Gateway `/gateway/healthz` to respond on `18874`, Relay `/status` to respond on `18875`, and `agent_connected` to be `true`.
