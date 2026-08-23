#!/usr/bin/env bash

if [[ -z "${BASH_VERSION:-}" ]]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
workspace_dir="$(cd "${project_dir}/.." && pwd)"
relay_dir="${workspace_dir}/relay-server"
agent_dir="${workspace_dir}/mac-agent"
run_dir="${project_dir}/.run/mobileweb"
lock_dir="${run_dir}/deploy.lock"
go_cache_dir="${CODEXREMOTE_GO_CACHE:-/private/tmp/codexremote-go-cache}"
relay_port=18775
run_checks=0

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  RESET=$'\033[0m'
  BOLD=$'\033[1m'
  GREEN=$'\033[32m'
  CYAN=$'\033[36m'
  YELLOW=$'\033[33m'
  RED=$'\033[31m'
else
  RESET=""
  BOLD=""
  GREEN=""
  CYAN=""
  YELLOW=""
  RED=""
fi

usage() {
  cat <<'EOF'
Codex Remote Mobile Web 快速部署

用法:
  ./deploy.sh [--quick]   构建并重启 Mobile Web、Relay 和 Mac Agent
  ./deploy.sh --check     先运行三个仓库的测试，再执行相同部署
  ./deploy.sh --help      显示帮助

此脚本必须从 Terminal 或 Codex Desktop 执行，不能由将被重启的 Mac Agent Turn 调用。
EOF
}

info() {
  printf '%s==>%s %s\n' "${CYAN}" "${RESET}" "$1"
}

failure() {
  printf '%s错误：%s%s\n' "${RED}" "$1" "${RESET}" >&2
}

box_border() {
  local edge="$1"
  local fill
  printf -v fill '%*s' 52 ''
  fill="${fill// /─}"
  printf '%s%s%s%s%s\n' "${CYAN}" "${edge:0:1}" "${fill}" "${edge:1:1}" "${RESET}"
}

box_open() {
  local title="$1"
  local fill
  if (( ${#title} > 46 )); then
    title="${title:0:43}..."
  fi
  printf -v fill '%*s' "$((49 - ${#title}))" ''
  fill="${fill// /─}"
  printf '%s┌─ %s%s%s%s %s┐%s\n' "${CYAN}" "${BOLD}" "${title}" "${RESET}" "${CYAN}" "${fill}" "${RESET}"
}

box_field() {
  local text="$1"
  local width="$2"
  local text_length="${#text}"
  if (( text_length > width )); then
    text="${text:0:width-3}..."
    text_length="${#text}"
  fi
  printf '%s' "${text}"
  printf '%*s' "$((width - text_length))" ''
}

box_row() {
  local label="$1"
  local value="$2"
  local color="${3:-${GREEN}}"
  printf '%s│%s ' "${CYAN}" "${RESET}"
  box_field "${label}" 12
  printf ' %s' "${color}"
  box_field "${value}" 37
  printf '%s %s│%s\n' "${RESET}" "${CYAN}" "${RESET}"
}

box_close() {
  box_border "└┘"
}

run_logged() {
  local label="$1"
  local log_file="$2"
  shift 2

  if "$@" >"${log_file}" 2>&1; then
    return 0
  fi
  failure "${label}失败，诊断日志：${log_file}"
  tail -n 24 "${log_file}" >&2 || true
  return 1
}

build_mobile_web() {
  (cd "${project_dir}" && npm run build -- --logLevel error)
}

build_gateway() {
  mkdir -p "${project_dir}/bin"
  (cd "${project_dir}/gateway" && go build -o "${project_dir}/bin/mobile-web-gateway" .)
}

restart_runtime() {
  "${agent_dir}/dev" mobileweb
}

restart_gateway() {
  "${project_dir}/service.sh" restart gateway
}

restart_codex_web() {
  "${project_dir}/service.sh" restart codex
}

restart_test_web() {
  "${project_dir}/service.sh" restart test
}

running_inside_mobileweb_agent() {
  case "${CODEX_REMOTE_EXECUTION_ORIGIN:-auto}" in
    mobileweb-agent) return 0 ;;
    external) return 1 ;;
    auto) ;;
    *)
      failure "CODEX_REMOTE_EXECUTION_ORIGIN 必须是 auto、external 或 mobileweb-agent。"
      exit 2
      ;;
  esac

  local candidate_pid="${PPID}"
  local command=""
  local parent_pid=""
  while [[ "${candidate_pid}" =~ ^[0-9]+$ && "${candidate_pid}" -gt 1 ]]; do
    command="$(ps -p "${candidate_pid}" -o command= 2>/dev/null || true)"
    if [[ "${command}" == *"mac-agent serve"* && "${command}" == *":${relay_port}/ws/agent"* ]]; then
      return 0
    fi
    parent_pid="$(ps -p "${candidate_pid}" -o ppid= 2>/dev/null | tr -d '[:space:]')"
    [[ -n "${parent_pid}" && "${parent_pid}" != "${candidate_pid}" ]] || break
    candidate_pid="${parent_pid}"
  done
  return 1
}

run_full_checks() {
  local mobile_pid
  local relay_pid
  local agent_pid
  local failed=0

  info "并行运行三个仓库的测试"
  (cd "${project_dir}" && npm test) &
  mobile_pid=$!
  (cd "${relay_dir}" && go test ./...) &
  relay_pid=$!
  (cd "${agent_dir}" && go test ./...) &
  agent_pid=$!

  wait "${mobile_pid}" || failed=1
  wait "${relay_pid}" || failed=1
  wait "${agent_pid}" || failed=1
  (cd "${project_dir}/gateway" && go test ./...) || failed=1
  if [[ "${failed}" -ne 0 ]]; then
    failure "测试未通过，未重启任何服务。"
    return 1
  fi
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --quick)
      shift
      ;;
    --check)
      run_checks=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      failure "未知参数：$1"
      usage >&2
      exit 2
      ;;
  esac
done

if running_inside_mobileweb_agent; then
  failure "拒绝从 mobileweb Mac Agent 承载的 Turn 内同步重启该 Agent。"
  failure "请从 Terminal 或 Codex Desktop 执行 ${project_dir}/deploy.sh。"
  exit 1
fi

for required_path in "${relay_dir}/run" "${relay_dir}/pairqr.sh" "${agent_dir}/dev" "${project_dir}/service.sh"; do
  if [[ ! -x "${required_path}" ]]; then
    failure "缺少可执行部署入口：${required_path}"
    exit 1
  fi
done

for tool in curl go launchctl lsof make node npm ps; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    failure "未找到必需命令：${tool}"
    exit 1
  fi
done

mkdir -p "${go_cache_dir}"
GOCACHE="${go_cache_dir}"
export GOCACHE

mkdir -p "${run_dir}"
if ! mkdir "${lock_dir}" 2>/dev/null; then
  failure "另一个 mobileweb 部署正在进行。"
  exit 1
fi
trap 'rmdir "${lock_dir}" 2>/dev/null || true' EXIT

SECONDS=0
if [[ ! -x "${project_dir}/node_modules/.bin/vite" || "${project_dir}/package.json" -nt "${project_dir}/node_modules/.package-lock.json" || "${project_dir}/package-lock.json" -nt "${project_dir}/node_modules/.package-lock.json" ]]; then
  run_logged "同步 Mobile Web 依赖" "${run_dir}/dependencies.log" \
    bash -c 'cd "$1" && npm install --no-audit --no-fund' _ "${project_dir}"
fi

if [[ "${run_checks}" -eq 1 ]]; then
  run_full_checks
fi

info "正在构建并启动 Mobile Web..."
run_logged "构建 Mobile Web" "${run_dir}/frontend-build.log" build_mobile_web

run_logged "构建 Mobile Web Gateway" "${run_dir}/gateway-build.log" build_gateway

run_logged "重启 Run Server 与 Mac Agent" "${run_dir}/runtime-restart.log" restart_runtime

run_logged "重启 Mobile Web Gateway" "${run_dir}/gateway-restart.log" restart_gateway
run_logged "重启 Codex Web" "${run_dir}/codex-web-restart.log" restart_codex_web
run_logged "重启 Test Web" "${run_dir}/test-web-restart.log" restart_test_web

status_json="$(curl -fsS --max-time 3 "http://127.0.0.1:${relay_port}/status")"
if [[ "${status_json}" != *'"agent_connected":true'* ]]; then
  failure "部署后 Agent 未连接：${status_json}"
  exit 1
fi

lan_interface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
lan_ip=""
if [[ -n "${lan_interface}" ]]; then
  lan_ip="$(ipconfig getifaddr "${lan_interface}" 2>/dev/null || true)"
fi

printf '\n'
box_open "MOBILE WEB"
box_row "STATUS" "READY · ${SECONDS}s · AGENT CONNECTED"
if [[ -n "${lan_ip}" ]]; then
  box_row "ADDRESS" "http://${lan_ip}:18774/" "${CYAN}"
else
  box_row "ADDRESS" "http://127.0.0.1:18774/" "${CYAN}"
fi
if [[ -t 1 ]]; then
  box_row "PAIRING" "SCAN QR · ONE TIME · 10 MIN" "${YELLOW}"
  box_close
  "${relay_dir}/pairqr.sh" --print-link=false --print-metadata=false --terminal-render compact --terminal-indent 4
else
  box_close
  info "非交互输出，跳过一次性配对二维码"
fi
