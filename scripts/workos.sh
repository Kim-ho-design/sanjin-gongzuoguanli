#!/usr/bin/env bash
# workos — 「三金打工清单」命令行工具（供 agent / 终端操作工作面板）
# 配置：环境变量 WORK_OS_BASE_URL、WORK_OS_API_TOKEN
#   或 ~/.config/workos/config（两行 KEY=VALUE，同名环境变量优先）
# 依赖：curl 必需；node 可选（仅 stats/unclaimed/add/report 的格式化用到）
set -euo pipefail

CONFIG_FILE="${WORK_OS_CONFIG:-$HOME/.config/workos/config}"
if [ -f "$CONFIG_FILE" ]; then
  # 只读取两个白名单键，避免 source 任意内容
  while IFS='=' read -r k v; do
    case "$k" in
      WORK_OS_BASE_URL) [ -z "${WORK_OS_BASE_URL:-}" ] && WORK_OS_BASE_URL="$v" ;;
      WORK_OS_API_TOKEN) [ -z "${WORK_OS_API_TOKEN:-}" ] && WORK_OS_API_TOKEN="$v" ;;
    esac
  done < "$CONFIG_FILE"
fi

BASE_URL="${WORK_OS_BASE_URL:-https://work.sanjin.art}"
TOKEN="${WORK_OS_API_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "错误：未配置 WORK_OS_API_TOKEN（设环境变量或写入 $CONFIG_FILE）" >&2
  exit 1
fi

req() { # req <METHOD> <PATH> [JSON_BODY]
  # body 走 stdin（--data-binary @-）而非 -d 参数：Windows 下 bash→curl 的 argv 会按系统代码页转码，中文入参会乱码
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
  if [ -n "$body" ]; then
    printf '%s' "$body" | curl "${args[@]}" --data-binary @- "$BASE_URL$path"
  else
    curl "${args[@]}" "$BASE_URL$path"
  fi
}

json_escape() { # 把参数转义成 JSON 字符串
  node -e 'console.log(JSON.stringify(process.argv[1]))' "$1"
}

url_encode() {
  node -e 'console.log(encodeURIComponent(process.argv[1]))' "$1"
}

fmt_stats() {
  node -e '
    const b = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const s = b.stats;
    console.log(`本周进度：${s.week_done}/${s.week_plan} 完成`);
    console.log(`超期未动：${s.overdue_count} 项`);
    console.log(`待认领：${s.unclaimed_count} 条`);
    console.log(`项目数：${b.projects.length}，父任务：${b.tasks.length}，子任务：${b.subtasks.length}`);
    if (b.overdue_items.length) {
      console.log("\n超期明细：");
      for (const o of b.overdue_items.slice(0, 20)) {
        console.log(`  [${o.date}] ${o.kind === "subtask" ? o.parent_name + " / " : ""}${o.name}`);
      }
    }'
}

usage() {
  cat <<'EOF'
workos — 三金打工清单 CLI

查询：
  workos board                          看板全量数据+统计（JSON）
  workos stats                          统计摘要（人类可读）
  workos tasks [status] [project_id]    任务列表（status: 待启动/进行中/已完成）
  workos task <id>                      任务详情（含日志/子任务）
  workos projects                       项目列表
  workos unclaimed                      待认领区列表（JSON）

录入（自然语言，DeepSeek 解析）：
  workos parse "原话"                   只解析不入库（返回 parsed JSON，先给用户看）
  workos apply "原话" '<parsed JSON>'   确认后落库
  workos add "原话"                     解析+直接落库一步完成（跳过人工确认）

任务操作：
  workos new "任务名" <project_id> [deadline]   手动建任务（不走 AI）
  workos done <id>                      标记完成（父任务会级联完成子任务）
  workos reopen <id>                    重新打开（恢复被级联完成的子任务）
  workos set <id> <field> <value>       改字段：name/deadline/planned_date/completed_date（value 为 null 表示清空）

周报与统计：
  workos report [brief|full] [start] [end]      AI 周报 markdown（默认近7天 brief）
  workos report-data [start] [end]              原始聚合数据 JSON（不经 LLM）
EOF
}

cmd="${1:-}"; shift || true
case "$cmd" in
  board)     req GET /api/board ;;
  stats)     req GET /api/board | fmt_stats ;;
  tasks)
    qs=""
    [ -n "${1:-}" ] && qs="status=$(url_encode "$1")"
    [ -n "${2:-}" ] && qs="${qs:+$qs&}project_id=$2"
    req GET "/api/tasks${qs:+?$qs}" ;;
  task)      req GET "/api/tasks/$1" ;;
  projects)  req GET /api/projects ;;
  unclaimed)
    req GET /api/board | node -e '
      const b = JSON.parse(require("fs").readFileSync(0, "utf8"));
      console.log(JSON.stringify(b.unclaimed, null, 2));' ;;

  parse)
    [ -z "${1:-}" ] && { echo "用法：workos parse \"原话\"" >&2; exit 1; }
    req POST /api/parse "{\"text\":$(json_escape "$1")}" ;;
  apply)
    { [ -z "${1:-}" ] || [ -z "${2:-}" ]; } && { echo "用法：workos apply \"原话\" '<parsed JSON>'" >&2; exit 1; }
    req POST /api/parse/confirm "{\"raw_text\":$(json_escape "$1"),\"parsed\":$2}" ;;
  add)
    [ -z "${1:-}" ] && { echo "用法：workos add \"原话\"" >&2; exit 1; }
    resp=$(req POST /api/parse "{\"text\":$(json_escape "$1")}")
    parsed=$(node -e '
      const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
      if (r.error) { console.error("解析失败：" + r.error); process.exit(1); }
      console.log(JSON.stringify(r.parsed));' <<< "$resp")
    req POST /api/parse/confirm "{\"raw_text\":$(json_escape "$1"),\"parsed\":$parsed}" ;;

  new)
    { [ -z "${1:-}" ] || [ -z "${2:-}" ]; } && { echo "用法：workos new \"任务名\" <project_id> [deadline]" >&2; exit 1; }
    body="{\"name\":$(json_escape "$1"),\"project_id\":$2"
    [ -n "${3:-}" ] && body="$body,\"deadline\":\"$3\""
    req POST /api/tasks "$body}" ;;
  done)
    req PATCH "/api/tasks/$1" '{"status":"已完成"}' ;;
  reopen)
    req PATCH "/api/tasks/$1" '{"status":"待启动"}' ;;
  set)
    { [ -z "${1:-}" ] || [ -z "${2:-}" ]; } && { echo "用法：workos set <id> <field> <value>" >&2; exit 1; }
    case "$2" in
      name|deadline|planned_date|completed_date)
        val="null"
        { [ -n "${3:-}" ] && [ "$3" != "null" ]; } && val=$(json_escape "$3")
        req PATCH "/api/tasks/$1" "{\"$2\":$val}" ;;
      *) echo "field 只支持 name/deadline/planned_date/completed_date" >&2; exit 1 ;;
    esac ;;

  report)
    type="${1:-brief}"; start="${2:-}"; end="${3:-}"
    qs="type=$type"
    [ -n "$start" ] && qs="$qs&start=$start"
    [ -n "$end" ] && qs="$qs&end=$end"
    req GET "/api/report?$qs" | node -e '
      const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
      if (r.error) { console.error("错误：" + r.error); process.exit(1); }
      console.log(r.markdown);
      if (r.fallback) console.error("\n（提示：DeepSeek 不可用，以上为模板回退版）");' ;;
  report-data)
    qs="format=data"
    [ -n "${1:-}" ] && qs="$qs&start=$1"
    [ -n "${2:-}" ] && qs="$qs&end=$2"
    req GET "/api/report?$qs" ;;

  ""|-h|--help|help) usage ;;
  *) echo "未知命令：$cmd" >&2; usage >&2; exit 1 ;;
esac
