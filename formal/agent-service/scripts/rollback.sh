#!/usr/bin/env bash
# rollback.sh — 回滚到 Node harness (关闭 Python agent-service 灰度)
#
# 用法: 在 mcloud 云函数侧执行 (改 env), 或在本机停止 Python 服务.
#   本脚本只停止 Python agent-service; 云函数侧 env 需在腾讯云控制台改.
set -euo pipefail
SERVICE_NAME="agent-service"

echo "=========================================="
echo "  回滚: 停止 Python agent-service"
echo "=========================================="

systemctl stop "$SERVICE_NAME" 2>/dev/null && echo "✅ 已停止 $SERVICE_NAME" || echo "服务未运行或非 systemd 管理"

echo ""
echo "⚠️  还需在腾讯云 mcloud 控制台设置:"
echo "  AGENT_USE_PYTHON=off"
echo "然后重新部署 mcloud 云函数."
echo ""
echo "回滚后所有流量回到 Node harness + MiMo (原稳定链路)."
echo "Python 侧已生成的 pendingWrite (waiting_confirm) 仍可被 Node 处理"
echo "(两端 pendingWrite 协议一致)."
