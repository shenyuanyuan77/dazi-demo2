"""自定义异常。

对应原 Node `_providerErrorMessage` 把 MiMo 错误映射到中文用户提示的能力,
在 LangGraph 节点和 FastAPI handler 中统一捕获。
"""

from __future__ import annotations


class AgentError(Exception):
    """Agent 内部一般错误。"""


class ProviderError(AgentError):
    """LLM/向量库等外部 provider 调用失败。"""

    # 对应原 MIMO_AUTH_FAILED / MIMO_RATE_LIMITED / MIMO_TIMEOUT 错误码
    AUTH_FAILED = "auth_failed"
    RATE_LIMITED = "rate_limited"
    TIMEOUT = "timeout"
    UNKNOWN = "unknown"

    def __init__(self, message: str, *, kind: str = UNKNOWN) -> None:
        super().__init__(message)
        self.kind = kind

    def render_user_message(self) -> str:
        """返回给小程序端的中文提示。"""
        mapping = {
            self.AUTH_FAILED: "AI 服务鉴权失败，请联系管理员检查 API Key",
            self.RATE_LIMITED: "当前咨询量较大，请稍后再试",
            self.TIMEOUT: "AI 服务响应超时，请重试",
            self.UNKNOWN: "AI 服务暂时不可用，请稍后再试",
        }
        return mapping.get(self.kind, str(self.args[0]) if self.args else "未知错误")
