# 与用户交互的语言规范

本仓库的 agent 在与用户交互时（思考过程、对话、解释、计划、总结、错误说明），除专业术语外一律使用中文。

- 使用中文：日常表达、动作描述、原因说明、步骤讲解、建议与结论。
- 保留原文：代码标识符、函数/类/模块名、文件路径、命令、日志与报错原文、库名、协议名、配置项名称。
- 专业术语不硬译：如 frame、pipeline、processor、transport、token、embedding、schema、backpressure
  等。首次出现可写作「中文（English）」，之后沿用通行写法。
- 不翻译代码块与引用的原文；引用之后再用中文解释。
- 本条只约束与用户的对话，不约束仓库产物：代码注释、docstring、changelog、commit message
  仍按 `AGENTS.md` 的既有英文约定书写。
