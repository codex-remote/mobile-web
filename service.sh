#!/usr/bin/env bash

if [[ -z "${BASH_VERSION:-}" ]]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
domain="gui/$(id -u)"
relay_url="http://127.0.0.1:18775/status"
run_dir="${project_dir}/.run/mobileweb"
service_mode="${2:-test}"

case "${service_mode}" in
  test)
    label="com.codexremote.mobile-web.test"
    port=4174
    log_file="${run_dir}/mobile-web.log"
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
  *)
    printf '错误：未知服务模式 %s；必须是 test、codex 或 gateway。\n' "${service_mode}" >&2
    exit 2
    ;;
esac

service_target="${domain}/${label}"
web_url="http://127.0.0.1:${port}/"
health_url="${web_url}"
if [[ "${service_mode}" == "gateway" ]]; then
  health_url="http://127.0.0.1:${port}/gateway/healthz"
fi

usage() {
  cat <<'EOF'
Codex Remote Mobile Web Service

用法:
  ./service.sh restart [test|codex|gateway]   由 launchd 重启并持续守护指定服务
  ./service.sh status [test|codex|gateway]    检查进程、端口、页面、Relay 和 Agent
  ./service.sh stop [test|codex|gateway]      停止 launchd 托管的指定服务
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
  if [[ "${service_mode}" != "gateway" ]]; then
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

  for _ in {1..40}; do
    remaining="$(listener_pids)"
    [[ -z "${remaining}" ]] && return 0
    sleep 0.1
  done

  failure "端口 ${port} 仍被 PID ${remaining//$'\n'/, } 监听；未强制终止未知进程。"
  return 1
}

submit_service() {
  local service_path="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

  if [[ "${service_mode}" != "gateway" ]]; then
    service_path="$(dirname "$(command -v node)"):${service_path}"
  fi
  mkdir -p "${run_dir}"

  launchctl submit \
    -l "${label}" \
    -o "${log_file}" \
    -e "${log_file}" \
    -- /usr/bin/env \
    "NO_COLOR=1" \
    "PATH=${service_path}" \
    "${project_dir}/start.sh" "${service_mode}"
}

wait_for_health() {
  local status_json=""

  for _ in {1..40}; do
    if launchd_running && [[ -n "$(listener_pids)" ]] && web_ready; then
      if [[ "${service_mode}" == "gateway" ]]; then
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

  if [[ "${service_mode}" != "gateway" ]]; then
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
    failure "重启后健康检查未通过。运行 ./service.sh status ${service_mode}，并查看 ${log_file}。"
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

if [[ "$#" -gt 2 ]]; then
  failure "参数过多。"
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
