#!/usr/bin/env bash
# deploy.sh — agent-service 一键部署脚本 (Linux)
#
# 用法 (在目标服务器上):
#   scp -r agent-service user@server:/opt/
#   ssh user@server
#   cd /opt/agent-service && sudo bash scripts/deploy.sh
#
# 执行后:
#   1. 创建 venv + 装依赖
#   2. 生成 .env (若不存在, 从 .env.example 复制, 提示填 API Key)
#   3. 安装 systemd service
#   4. 启动 + 开机自启
#   5. 健康检查
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$APP_DIR/.venv"
SERVICE_NAME="agent-service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "=========================================="
echo "  agent-service 一键部署"
echo "=========================================="
echo "APP_DIR: $APP_DIR"

# 1. Python 检查
if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found. 请先安装 Python 3.10+"
    exit 1
fi
PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "Python: $PY_VER"

# 2. venv + 依赖
if [ ! -d "$VENV" ]; then
    echo "[1/5] 创建 venv..."
    python3 -m venv "$VENV"
fi
echo "[1/5] 安装依赖..."
"$VENV/bin/pip" install --upgrade pip -q
"$VENV/bin/pip" install fastapi "uvicorn[standard]" pydantic pydantic-settings \
    langgraph langchain-core langchain-openai httpx structlog tenacity -q

# 3. .env
if [ ! -f "$APP_DIR/.env" ]; then
    echo "[2/5] 生成 .env (从 .env.example)..."
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    echo "  ⚠️  请编辑 $APP_DIR/.env 填写 MIMO_API_KEY 和 AGENT_INTERNAL_TOKEN"
else
    echo "[2/5] .env 已存在, 跳过"
fi

# 4. systemd unit
echo "[3/5] 安装 systemd service..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Fitness Agent Service (LangGraph)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$VENV/bin/uvicorn app.main:app --host 0.0.0.0 --port 8787 --workers 4
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
EOF

# 5. 启动
echo "[4/5] 启动服务..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# 6. 健康检查
echo "[5/5] 健康检查..."
sleep 3
for i in 1 2 3 4 5; do
    if curl -sf http://127.0.0.1:8787/health >/dev/null 2>&1; then
        echo "=========================================="
        echo "  ✅ 部署成功!"
        echo "=========================================="
        curl -s http://127.0.0.1:8787/health | python3 -m json.tool
        echo ""
        echo "下一步 (腾讯云 mcloud 配置):"
        echo "  AGENT_USE_PYTHON=gray"
        echo "  AGENT_GRAY_PERCENT=1"
        echo "  AGENT_SERVICE_URL=http://<本机内网IP>:8787"
        echo "  AGENT_INTERNAL_TOKEN=<与 .env 中 AGENT_INTERNAL_TOKEN 一致>"
        echo "=========================================="
        exit 0
    fi
    echo "  等待启动... ($i/5)"
    sleep 2
done

echo "❌ 健康检查失败, 查看日志:"
echo "  journalctl -u $SERVICE_NAME -n 50"
exit 1
