"""最小 Grok MCP 服务：把 xAI API 暴露成三个工具，供 Claude Code / Codex 调用。

依赖：pip install "mcp>=1.2"
环境变量：XAI_API_KEY（必填），GROK_MODEL（可选，默认 grok-4）

工具：
  grok_ask      —— 普通问答 / 第二意见
  grok_search   —— 带 Web + X 实时检索的问答，返回答案与引用链接
  grok_review   —— 对抗式审查：给 diff 或计划，返回问题清单

xAI 接口名称与参数会变，所有 HTTP 细节集中在 _post() 和两个 payload 里，
接口变化时只改这里。首次使用先跑：python grok_mcp.py --smoke
"""
import json
import os
import sys
import urllib.request

API_BASE = os.environ.get("XAI_API_BASE", "https://api.x.ai/v1")
MODEL = os.environ.get("GROK_MODEL", "grok-4")
TIMEOUT = int(os.environ.get("GROK_TIMEOUT", "120"))
MAX_INPUT_CHARS = 60_000  # 防止把整个仓库塞给 Grok

REVIEW_PROMPT = (
    "你是严格的代码/方案审查者，只找问题，不夸奖。"
    "按严重程度排序列出：[严重度] 位置 —— 问题 —— 触发条件 —— 建议修复。"
    "没有确定的问题就明确说没有，不要编造。"
)


def _post(path, payload):
    key = os.environ.get("XAI_API_KEY")
    if not key:
        raise RuntimeError("缺少环境变量 XAI_API_KEY")
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.load(resp)


def _clip(text):
    if len(text) > MAX_INPUT_CHARS:
        return text[:MAX_INPUT_CHARS] + "\n\n[输入过长，已截断]"
    return text


def _chat(system, user):
    data = _post("/chat/completions", {
        "model": MODEL,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": _clip(user)}],
    })
    return data["choices"][0]["message"]["content"]


def _search(query):
    # Responses API + 服务端搜索工具（web_search / x_search）
    data = _post("/responses", {
        "model": MODEL,
        "input": [{"role": "user", "content": _clip(query)}],
        "tools": [{"type": "web_search"}, {"type": "x_search"}],
    })
    texts, links = [], []
    for item in data.get("output", []):
        for part in item.get("content", []) or []:
            if part.get("type") == "output_text":
                texts.append(part.get("text", ""))
                for ann in part.get("annotations", []) or []:
                    if ann.get("url"):
                        links.append(ann["url"])
    links += [c if isinstance(c, str) else c.get("url", "") for c in data.get("citations", [])]
    answer = "\n".join(texts) or json.dumps(data, ensure_ascii=False)[:4000]
    unique = list(dict.fromkeys(l for l in links if l))
    if unique:
        answer += "\n\n来源：\n" + "\n".join(f"- {u}" for u in unique)
    return answer


def build_server():
    from mcp.server.fastmcp import FastMCP

    mcp = FastMCP("grok")

    @mcp.tool()
    def grok_ask(question: str, context: str = "") -> str:
        """向 Grok 提问或要第二意见。context 放计划、代码片段等结构化材料。"""
        return _chat("回答要具体、可执行；不确定就直说。", f"{context}\n\n问题：{question}".strip())

    @mcp.tool()
    def grok_search(query: str) -> str:
        """用 Grok 做实时 Web + X 检索，返回答案和来源链接。用于最新信息、舆情、公开表态。"""
        return _search(query)

    @mcp.tool()
    def grok_review(material: str, focus: str = "正确性、边界条件、安全") -> str:
        """对抗式审查 diff 或计划。material 传 git diff 或 plan.md 内容。"""
        return _chat(REVIEW_PROMPT, f"审查重点：{focus}\n\n{material}")

    return mcp


if __name__ == "__main__":
    if "--smoke" in sys.argv:
        print("ask:", _chat("简短回答。", "回复 OK 两个字母")[:200])
        print("search:", _search("今天 X 上关于 xAI API 的最新公告是什么？一句话")[:800])
    else:
        build_server().run()  # stdio 传输
