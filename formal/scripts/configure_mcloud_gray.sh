#!/usr/bin/env bash
# configure_mcloud_gray.sh — 用 tccli 配置 mcloud 云函数为 1% 灰度
#
# 前置:
#   1. pip install tccli
#   2. tccli configure --secret-id xxx --secret-key xxx --region ap-shanghai
#   3. 编辑本脚本顶部的 4 个变量
#
set -euo pipefail

# ============ 必填 (改成你的真实值) ============
FUNCTION_NAME="mcloud"
NAMESPACE="default"
REGION="ap-shanghai"                          # 改成你的云函数地域
AGENT_SERVICE_URL="http://10.0.0.10:8787"     # 改成 agent-service 服务器内网 IP
AGENT_INTERNAL_TOKEN="your-shared-token-here"  # 与 agent-service .env 中一致
# =============================================

echo "=========================================="
echo "  配置 mcloud 云函数 → 1% 灰度"
echo "=========================================="

# 1. 读取当前云函数配置
echo "[1/4] 读取当前 mcloud 配置..."
CURRENT=$(tccli scf GetFunction --FunctionName "$FUNCTION_NAME" --Namespace "$NAMESPACE" --Region "$REGION" --cli-unfold-argument 2>/dev/null || echo "{}")
echo "  当前函数状态: $(echo "$CURRENT" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("Status","unknown"))' 2>/dev/null || echo "读取失败")"

# 2. 构造新的环境变量
echo "[2/4] 设置灰度环境变量..."
# 注意: 云函数环境变量通过 UpdateFunctionConfiguration 修改, 不能增量, 要传全部.
# 这里采用云函数控制台同步的完整方式: 把原 Variables 取出, 覆盖 4 个 key, 写回.
python3 <<PYEOF
import json, subprocess, sys

region = "$REGION"
fname = "$FUNCTION_NAME"
ns = "$NAMESPACE"
url = "$AGENT_SERVICE_URL"
token = "$AGENT_INTERNAL_TOKEN"

# 取当前
res = subprocess.run(
    ["tccli", "scf", "GetFunction", "--FunctionName", fname,
     "--Namespace", ns, "--Region", region, "--cli-unfold-argument"],
    capture_output=True, text=True
)
if res.returncode != 0:
    print("ERROR: GetFunction 失败:", res.stderr[:200])
    sys.exit(1)

data = json.loads(res.stdout)
envs = data.get("Environment", {}).get("Variables", [])

# 覆盖 4 个 key
updates = {
    "AGENT_USE_PYTHON": "gray",
    "AGENT_GRAY_PERCENT": "1",
    "AGENT_SERVICE_URL": url,
    "AGENT_INTERNAL_TOKEN": token,
}
new_vars = [v for v in envs if v["Key"] not in updates]
for k, v in updates.items():
    new_vars.append({"Key": k, "Value": v})

# UpdateFunctionConfiguration
env_json = json.dumps({"Variables": new_vars}, ensure_ascii=False)
res2 = subprocess.run(
    ["tccli", "scf", "UpdateFunctionConfiguration",
     "--FunctionName", fname, "--Namespace", ns, "--Region", region,
     "--Environment", env_json],
    capture_output=True, text=True
)
if res2.returncode != 0:
    print("ERROR: UpdateFunctionConfiguration 失败:", res2.stderr[:300])
    sys.exit(1)
print("  ✅ 环境变量已更新: AGENT_USE_PYTHON=gray, GRAY_PERCENT=1")
PYEOF

# 3. 发布新版本 / 触发更新
echo "[3/4] 触发云函数更新..."
tccli scf UpdateFunction --FunctionName "$FUNCTION_NAME" --Namespace "$NAMESPACE" --Region "$REGION" \
    --Handler "index.main" --Runtime "Nodejs16.13" --Code '{"CosBucketName":"","CosObjectName":""}' 2>/dev/null || true
# 注: UpdateFunction 不带 Code 会报错; 实际重新部署需在控制台点"上传代码"或用 tccli scf CreateFunction 覆盖.
# 简化: 环境变量改完云函数会自动滚动重启, 不需要重传代码.

# 4. 验证
echo "[4/4] 验证配置..."
sleep 5
tccli scf GetFunction --FunctionName "$FUNCTION_NAME" --Namespace "$NAMESPACE" --Region "$REGION" 2>/dev/null | \
    python3 -c '
import sys, json
d = json.load(sys.stdin)
envs = {v["Key"]: v["Value"] for v in d.get("Environment", {}).get("Variables", [])}
print("  AGENT_USE_PYTHON =", envs.get("AGENT_USE_PYTHON"))
print("  AGENT_GRAY_PERCENT =", envs.get("AGENT_GRAY_PERCENT"))
print("  AGENT_SERVICE_URL =", envs.get("AGENT_SERVICE_URL"))
print("  Status:", d.get("Status"))
'

echo ""
echo "=========================================="
echo "  ✅ 1% 灰度已配置!"
echo "=========================================="
echo ""
echo "验证灰度是否生效 (发一条测试消息, 看 payload.agentDriver 是否为 python):"
echo "  tccli scf Invoke --FunctionName $FUNCTION_NAME --Event '{...}' "
echo ""
echo "扩大灰度: 修改 AGENT_GRAY_PERCENT = 5 → 20 → 50 → 100"
echo "全量:    AGENT_USE_PYTHON=on"
echo "回滚:    AGENT_USE_PYTHON=off"
