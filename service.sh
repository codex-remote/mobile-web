#!/usr/bin/env bash

if [[ -z "${BASH_VERSION:-}" ]]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
domain="gui/$(id -u)"
relay_url="http://127.0.0.1:18875/status"
run_dir="${project_dir}/.run/mobileweb"
service_mode="${2:-test}"
supervised_transport="${3:-sse}"
workspace_dir="$(cd "${project_dir}/.." && pwd)"

case "${service_mode}" in
  test)
    label="com.codexremote.mobile-web.test"
    port=4174
    log_file="${run_dir}/mobile-web.log"
    ;;
  poll)
    label="com.codexremote.mobile-web.poll"
    port=4175
    log_file="${run_dir}/poll.log"
    ;;
  codex)
    label="com.codexremote.mobile-web.codex"
    port=4173
    log_file="${run_dir}/codex.log"
    ;;
  gateway)
    label="com.codexremote.mobile-web.gateway"
    port=18774
    log_file="${run_dir}/gateway.log"
    ;;
  gateway-debug)
    label="com.codexremote.mobile-web.gateway-debug"
    port=18874
    log_file="${run_dir}/gateway-debug.log"
    ;;
  supervised)
    case "${supervised_transport}" in
      sse)
        label="com.codexremote.runtime.dev.sse"
        port=18874
        relay_port=18875
        auth_control_port=18876
        ;;
      poll)
        label="com.codexremote.runtime.dev.poll"
        port=18884
        relay_port=18885
        auth_control_port=18886
        ;;
      *)
        printf '错误：supervised 模式必须指定 sse 或 poll。\n' >&2
        exit 2
        ;;
    esac
    relay_url="http://127.0.0.1:${relay_port}/status"
    log_file="${run_dir}/supervisor-${supervised_transport}.log"
    ;;
  *)
    printf '错误：未知服务模式 %s；必须是 test、poll、codex、gateway、gateway-debug 或 supervised。\n' "${service_mode}" >&2
    exit 2
    ;;
esac

service_target="${domain}/${label}"
web_url="http://127.0.0.1:${port}/"
health_url="${web_url}"
if [[ "${service_mode}" == "gateway" || "${service_mode}" == "gateway-debug" || "${service_mode}" == "supervised" ]]; then
  health_url="http://127.0.0.1:${port}/gateway/healthz"
fi

usage() {
  cat <<'EOF'
Codex Remote Mobile Web Service

用法:
  ./service.sh restart [test|poll|codex|gateway|gateway-debug|supervised] [sse|poll]   由 launchd 重启并持续守护指定服务
  ./service.sh status [test|poll|codex|gateway|gateway-debug|supervised] [sse|poll]    检查进程、端口、页面、Relay 和 Agent
  ./service.sh stop [test|poll|codex|gateway|gateway-debug|supervised] [sse|poll]      停止 launchd 托管的指定服务
  ./service.sh --help                 显示帮助

省略模式时默认管理 test（4174）。日常重启不启动浏览器。
EOF
}

info() {
  printf '%s\n' "$1"
}

failure() {
  printf '错误：%s\n' "$1" >&2
}

listener_pids() {
  if [[ "${service_mode}" == "supervised" ]]; then
    {
      lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true
      lsof -tiTCP:"${relay_port}" -sTCP:LISTEN 2>/dev/null || true
      lsof -tiTCP:"${auth_control_port}" -sTCP:LISTEN 2>/dev/null || true
    } | sort -u
    return
  fi
  lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true
}

launchd_running() {
  launchctl print "${service_target}" >/dev/null 2>&1
}

web_ready() {
  curl -fsS --max-time 2 "${health_url}" >/dev/null 2>&1
}

relay_status_json() {
  curl -fsS --max-time 2 "${relay_url}" 2>/dev/null
}

agent_connected() {
  local status_json="$1"

  STATUS_JSON="${status_json}" node -e '
    try {
      const status = JSON.parse(process.env.STATUS_JSON);
      process.exit(status.agent_connected === true ? 0 : 1);
    } catch {
      process.exit(2);
    }
  ' >/dev/null 2>&1
}

detect_lan_ip() {
  local default_interface=""
  local detected_ip=""

  if command -v route >/dev/null 2>&1 && command -v ipconfig >/dev/null 2>&1; then
    default_interface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
    if [[ -n "${default_interface}" ]]; then
      detected_ip="$(ipconfig getifaddr "${default_interface}" 2>/dev/null || true)"
    fi
  fi

  printf '%s' "${detected_ip}"
}

ensure_node_toolchain_path() {
  local candidate_dir

  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  for candidate_dir in /opt/homebrew/bin /usr/local/bin; do
    if [[ -x "${candidate_dir}/node" && -x "${candidate_dir}/npm" ]]; then
      PATH="${candidate_dir}:${PATH:-/usr/bin:/bin}"
      export PATH
      return 0
    fi
  done
}

require_tools() {
  local tool

  for tool in curl launchctl lsof; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
      failure "未找到 ${tool}。"
      exit 1
    fi
  done
  if [[ "${service_mode}" != "gateway" && "${service_mode}" != "gateway-debug" && "${service_mode}" != "supervised" ]]; then
    ensure_node_toolchain_path
    for tool in node npm; do
      if ! command -v "${tool}" >/dev/null 2>&1; then
        failure "未找到 ${tool}；已检查当前 PATH、/opt/homebrew/bin 与 /usr/local/bin。"
        exit 1
      fi
    done
  fi
}

wait_for_port_clear() {
  local remaining=""
  local attempts=40

  if [[ "${service_mode}" == "supervised" ]]; then
    attempts=200
  fi

  for ((attempt = 0; attempt < attempts; attempt++)); do
    remaining="$(listener_pids)"
    if [[ -z "${remaining}" ]] && ! launchd_running; then
      return 0
    fi
    sleep 0.1
  done

  failure "${service_mode} 的旧 launchd 实例或端口仍未退出（PID ${remaining//$'\n'/, }）；未启动竞争实例。"
  return 1
}

submit_service() {
  local service_path="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  local supervisor_bin="${project_dir}/bin/codex-remote-dev-supervisor"
  local codex_binary="${CODEX_BINARY:-$(command -v codex || true)}"

  if [[ "${service_mode}" != "gateway" && "${service_mode}" != "gateway-debug" && "${service_mode}" != "supervised" ]]; then
    service_path="$(dirname "$(command -v node)"):${service_path}"
  fi
  mkdir -p "${run_dir}"

  if [[ "${service_mode}" == "supervised" ]]; then
    [[ -x "${supervisor_bin}" ]] || { failure "缺少开发 Supervisor：${supervisor_bin}，请先运行 deploy.sh。"; return 1; }
    [[ -x "${workspace_dir}/relay-server/bin/relay" ]] || { failure "缺少 Relay 构建产物。"; return 1; }
    [[ -x "${workspace_dir}/mac-agent/bin/mac-agent" ]] || { failure "缺少 Mac Agent 构建产物。"; return 1; }
    [[ -x "${project_dir}/bin/mobile-web-gateway" ]] || { failure "缺少 Mobile Web Gateway 构建产物。"; return 1; }
    [[ -f "${project_dir}/dist/index.html" ]] || { failure "缺少 Mobile Web dist/index.html。"; return 1; }
    [[ -n "${codex_binary}" && -x "${codex_binary}" ]] || { failure "未找到可执行 Codex；请设置 CODEX_BINARY。"; return 1; }
    launchctl submit \
      -l "${label}" \
      -o "${log_file}" \
      -e "${log_file}" \
      -- /usr/bin/env \
      "NO_COLOR=1" \
      "CODEXREMOTE_LAUNCHD_SERVICE=1" \
      "PATH=${service_path}" \
      "${supervisor_bin}" dev-supervisor \
      --relay "${workspace_dir}/relay-server/bin/relay" \
      --agent "${workspace_dir}/mac-agent/bin/mac-agent" \
      --gateway "${project_dir}/bin/mobile-web-gateway" \
      --static "${project_dir}/dist" \
      --codex-binary "${codex_binary}" \
      --auth-control-addr "127.0.0.1:${auth_control_port}" \
      --gateway-addr "0.0.0.0:${port}" \
      --database-url "${RUNTIME_DATABASE_URL:-postgres://codexremote:codexremote@127.0.0.1:54329/codexremote?sslmode=disable}" \
      --redis-url "${RUNTIME_REDIS_URL:-redis://default:codexremote@127.0.0.1:63799/0}" \
      --relay-addr "127.0.0.1:${relay_port}" \
      --log-dir "${run_dir}/supervisor-${supervised_transport}" \
      --workspace-root "${CODEXREMOTE_WORKSPACE_ROOT:-${HOME}}"
    return
  fi

  launchctl submit \
    -l "${label}" \
    -o "${log_file}" \
    -e "${log_file}" \
    -- /usr/bin/env \
    "NO_COLOR=1" \
    "CODEXREMOTE_LAUNCHD_SERVICE=1" \
    "PATH=${service_path}" \
    "${project_dir}/start.sh" "${service_mode}"
}

wait_for_health() {
  local status_json=""

  for _ in {1..40}; do
    if launchd_running && [[ -n "$(listener_pids)" ]] && web_ready; then
      if [[ "${service_mode}" == "gateway" || "${service_mode}" == "gateway-debug" ]]; then
        return 0
      fi
      status_json="$(relay_status_json || true)"
      if [[ -n "${status_json}" ]] && agent_connected "${status_json}"; then
        return 0
      fi
    fi
    sleep 0.25
  done

  return 1
}

print_urls() {
  local lan_ip

  lan_ip="$(detect_lan_ip)"
  info "本机地址: ${web_url}"
  if [[ -n "${lan_ip}" ]]; then
    info "局域网地址: http://${lan_ip}:${port}/"
  else
    info "局域网地址: 未检测到"
  fi
}

status_service() {
  local healthy=0
  local pids=""
  local status_json=""
  local launchd_pid=""

  if launchd_running; then
    launchd_pid="$(launchctl print "${service_target}" 2>/dev/null | awk '/^[[:space:]]*pid = / {print $3; exit}')"
    info "launchd: 正在运行${launchd_pid:+ (PID ${launchd_pid})}"
  else
    info "launchd: 未运行"
    healthy=1
  fi

  pids="$(listener_pids)"
  if [[ -n "${pids}" ]]; then
    info "端口 ${port}: 正在监听 (PID ${pids//$'\n'/, })"
  else
    info "端口 ${port}: 未监听"
    healthy=1
  fi

  if web_ready; then
    info "Mobile Web (${service_mode}): HTTP 正常"
  else
    info "Mobile Web (${service_mode}): HTTP 不可用"
    healthy=1
  fi

  if [[ "${service_mode}" != "gateway" && "${service_mode}" != "gateway-debug" ]]; then
    status_json="$(relay_status_json || true)"
    if [[ -z "${status_json}" ]]; then
      info "Relay: 不可用"
      healthy=1
    elif agent_connected "${status_json}"; then
      info "Relay: 正常，Agent 在线"
    else
      info "Relay: 正常，Agent 离线"
      healthy=1
    fi
  fi

  print_urls
  return "${healthy}"
}

restart_service() {
  if launchd_running; then
    info "正在移除旧的 launchd 服务 ${label}"
    launchctl remove "${label}"
  fi

  wait_for_port_clear
  info "正在提交 launchd 守护服务"
  submit_service

  if ! wait_for_health; then
    if [[ "${service_mode}" == "supervised" ]]; then
      failure "重启后健康检查未通过。运行 ./service.sh status supervised ${supervised_transport}，并查看 ${log_file}。"
    else
      failure "重启后健康检查未通过。运行 ./service.sh status ${service_mode}，并查看 ${log_file}。"
    fi
    return 1
  fi

  info "重启完成；异常退出后 launchd 会自动拉起。"
  status_service
}

stop_service() {
  if launchd_running; then
    launchctl remove "${label}"
    wait_for_port_clear
    info "服务已停止。"
  else
    info "服务未运行。"
  fi
}

require_tools
cd "${project_dir}"

if [[ "$#" -gt 3 ]]; then
  failure "参数过多。"
  usage >&2
  exit 2
fi
if [[ "$#" -eq 3 && "${service_mode}" != "supervised" ]]; then
  failure "只有 supervised 模式接受第三个 sse/poll 参数。"
  usage >&2
  exit 2
fi

case "${1:-}" in
  restart)
    restart_service
    ;;
  status)
    status_service
    ;;
  stop)
    stop_service
    ;;
  -h|--help)
    usage
    ;;
  *)
    failure "必须指定 restart、status 或 stop。"
    usage >&2
    exit 2
    ;;
esac
