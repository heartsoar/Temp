# AGENTS.md（Claude Code 与 Codex 共用的项目规则）

> 落地时复制到仓库根目录为 AGENTS.md，并新建 CLAUDE.md，内容只有一行：`@AGENTS.md`

## 项目
- 41 人投资观点研究台：静态网页（index.html / app.js / desk.js / ui.js）+ 本地 Python 服务（server.py、tools/）。
- Python 3.9+，标准库优先，不引入 pip 依赖（docs/multi-agent 下的工具除外）。

## 必跑检查
- `python3 -m unittest discover -s tests -v`
- `node tests/test_ui.cjs`
- 改动 tools/build_html.py 或前端文件后重新生成 index.html。

## 不可违反的规则
- 核验状态只由人工记录决定；任何 Agent 不得把“线索”自动改成“已核查”。
- 不伪造行情、收益率、AUM；缺数据就标缺数据。
- 历史版本只追加不修改。

## 协作约定
- 计划写在 `plans/<日期>-<主题>.md`，含：目标、改动文件、验收标准、不做什么。
- 实现者只改计划列出的文件；超出范围先在计划里追加再动手。
- 交接只传：计划文件路径、git diff、测试输出。不传整段聊天记录。
- Grok 检索结果必须附来源链接，进入数据前由人工核对。
