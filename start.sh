#!/usr/bin/env bash

if [[ -z "${BASH_VERSION:-}" ]]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  RESET=$'\033[0m'
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  GREEN=$'\033[32m'
  CYAN=$'\033[36m'
  YELLOW=$'\033[33m'
  RED=$'\033[31m'
else
  RESET=""
  BOLD=""
  DIM=""
  GREEN=""
  CYAN=""
  YELLOW=""
  RED=""
fi

usage() {
  cat <<EOF
${BOLD}Codex Remote Mobile Web${RESET}

用法:
  ./start.sh test       单独启动人工测试服务，固定端口 4174
  ./start.sh codex      单独启动 Codex 调试服务，固定端口 4173
  ./start.sh --help     显示帮助

每次只启动所选模式，仅清理该模式对应端口，不影响另一个实例。
EOF
}

info() {
  printf '%s●%s %s\n' "$CYAN" "$RESET" "$1"
}

success() {
  printf '%s✓%s %s\n' "$GREEN" "$RESET" "$1"
}

warning() {
  printf '%s!%s %s\n' "$YELLOW" "$RESET" "$1"
}

failure() {
  printf '%s✕%s %s\n' "$RED" "$RESET" "$1" >&2
}

mode="${1:-}"
case "$mode" in
  test)
    port=4174
    label="人工测试"
    ;;
  codex)
    port=4173
    label="Codex 调试"
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    failure "必须指定启动模式：test 或 codex"
    usage >&2
    exit 2
    ;;
esac

project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$project_dir"

if ! command -v npm >/dev/null 2>&1; then
  failure "未找到 npm，请先安装 Node.js。"
  exit 1
fi

if ! command -v lsof >/dev/null 2>&1; then
  failure "未找到 lsof，无法安全检查固定端口。"
  exit 1
fi

if [[ ! -x "node_modules/.bin/vite" ]]; then
  warning "前端依赖尚未安装，正在执行 npm install"
  npm install
fi

stop_port_listeners() {
  local target_port="$1"
  local port_pids
  local remaining_pids
  local pid

  port_pids="$(lsof -tiTCP:"$target_port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$port_pids" ]]; then
    return 0
  fi

  warning "端口 $target_port 已被占用，停止监听进程：${port_pids//$'\n'/, }"
  for pid in $port_pids; do
    [[ "$pid" =~ ^[0-9]+$ ]] && kill -TERM "$pid" 2>/dev/null || true
  done

  for _ in {1..20}; do
    [[ -z "$(lsof -tiTCP:"$target_port" -sTCP:LISTEN 2>/dev/null || true)" ]] && break
    sleep 0.1
  done

  remaining_pids="$(lsof -tiTCP:"$target_port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$remaining_pids" ]]; then
    warning "进程未按时退出，强制释放端口 $target_port：${remaining_pids//$'\n'/, }"
    for pid in $remaining_pids; do
      [[ "$pid" =~ ^[0-9]+$ ]] && kill -KILL "$pid" 2>/dev/null || true
    done
  fi
}

detect_lan_ip() {
  local default_interface=""
  local detected_ip=""

  if command -v route >/dev/null 2>&1 && command -v ipconfig >/dev/null 2>&1; then
    default_interface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
    if [[ -n "$default_interface" ]]; then
      detected_ip="$(ipconfig getifaddr "$default_interface" 2>/dev/null || true)"
    fi
  fi

  if [[ -z "$detected_ip" ]] && command -v hostname >/dev/null 2>&1; then
    detected_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi

  printf '%s' "$detected_ip"
}

stop_port_listeners "$port"

lan_ip="$(detect_lan_ip)"
local_url="http://127.0.0.1:$port/"
lan_url=""
if [[ -n "$lan_ip" ]]; then
  lan_url="http://$lan_ip:$port/"
fi
runtime_host="${lan_ip:-127.0.0.1}"
if [[ -n "${VITE_RUNTIME_URL:-}" ]]; then
  runtime_url="$VITE_RUNTIME_URL"
else
  runtime_url="http://${runtime_host}:18775（页面自动跟随访问主机）"
fi

server_pid=""
stop_server() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    printf '\n'
    info "正在停止 $label 服务（PID ${server_pid}）"
    kill -TERM "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap stop_server EXIT INT TERM

printf '\n%s%sCodex Remote Mobile Web%s\n' "$BOLD" "$CYAN" "$RESET"
printf '%s────────────────────────────────%s\n' "$DIM" "$RESET"
printf '模式      %s%s%s\n' "$BOLD" "$label" "$RESET"
printf '固定端口  %s\n' "$port"
printf '项目目录  %s\n' "$project_dir"
printf 'Run Server %s\n' "$runtime_url"
printf '%s────────────────────────────────%s\n' "$DIM" "$RESET"

info "正在启动 Vite 开发服务"
"node_modules/.bin/vite" --host 0.0.0.0 --port "$port" --strictPort --clearScreen false &
server_pid=$!

for _ in {1..40}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid" || true
    failure "$label 服务在端口打开前退出。"
    exit 1
  fi
  if curl -fsS "$local_url" >/dev/null 2>&1; then
    printf '\n'
    success "$label 服务已就绪"
    printf '本机地址  %s%s%s\n' "$BOLD" "$local_url" "$RESET"
    if [[ -n "$lan_url" ]]; then
      printf '局域网    %s%s%s\n' "$BOLD" "$lan_url" "$RESET"
    else
      warning "未检测到可用的局域网 IPv4 地址"
    fi
    printf '%s按 Ctrl+C 停止当前实例%s\n\n' "$DIM" "$RESET"
    break
  fi
  sleep 0.25
done

if ! curl -fsS "$local_url" >/dev/null 2>&1; then
  failure "等待 $label 服务就绪超时。"
  exit 1
fi

if wait "$server_pid"; then
  server_pid=""
  exit 0
else
  exit_code=$?
  server_pid=""
  exit "$exit_code"
fi
