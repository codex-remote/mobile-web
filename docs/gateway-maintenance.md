# Gateway Maintenance

## Runtime boundary

`deploy.sh` owns compilation. It builds `dist/index.html` and `bin/mobile-web-gateway` before restarting the Gateway service. `start.sh gateway` and `service.sh ... gateway` only validate and run those artifacts; they do not invoke Go, Node.js or npm.

Gateway process health is defined by its listener and `GET /gateway/healthz`. Relay and Agent health belong to full-stack deployment checks, so a temporarily unavailable upstream does not make launchd restart a healthy Gateway process.

## Incident: launchd could not find Go

Symptoms:

- `deploy.sh` reached `重启 Mobile Web Gateway 18774` and timed out.
- Port `18774` was closed while Relay `18775` and Auth Control `18776` were healthy.
- `.run/mobileweb/gateway.log` repeatedly printed `未找到 Go，无法构建 Gateway`.

Root cause:

The interactive shell resolved Go from `/opt/homebrew/opt/go@1.24/bin`, but the launchd service used a minimal PATH. The old Gateway launcher rebuilt on every process start, leaking a deployment toolchain dependency into runtime supervision.

Fast diagnosis:

```bash
./service.sh status gateway
tail -n 100 .run/mobileweb/gateway.log
curl -fsS http://127.0.0.1:18774/gateway/healthz
```

Recovery:

```bash
./deploy.sh
```

Run recovery from an external Terminal or Codex Desktop task, never from a Turn hosted by the Mac Agent that deployment will replace.

Prevention and verification:

- Keep compilation in `deploy.sh`; do not add toolchain discovery back to the Gateway runtime launcher.
- Validate `bash -n start.sh service.sh deploy.sh` and `validate_service.sh ... gateway 18774`.
- Test Gateway startup with a minimal launchd PATH and confirm `/gateway/healthz` reports `run-server-v1`.
