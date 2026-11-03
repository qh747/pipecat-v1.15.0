# 13 · 测试与行为评估

[← 上一章：观察者与指标](12-observers-metrics.md) | [Wiki 首页](README.md) | [下一章：示例导读 →](14-examples-guide.md)

> **本页要点**
>
> - 两层测试体系：**单元测试**（`run_test()` 断言帧进出）与**行为评估**（驱动真 bot 跑对话、判行为对不对）
> - 行为评估分两种场景：**scripted**（写死用户轮次 + 期望断言）与 **simulation**（LLM 扮演用户 + judge 评审）
> - CLI 三板斧：`pipecat eval run`（单场景）/ `suite`（发布套件并行）/ `judge`（离线重判已保存对话）
> - 评估通过 RTVI 协议连接 bot——协议即测试面

## 13.1 单元测试：帧进帧出

工具在 `src/pipecat/tests/utils.py`，核心是 `run_test()`：把帧送进一段管道，断言每个方向期望的输出帧。`SleepFrame(sleep=N)` 用来在帧间加延时。

```bash
uv run pytest                                   # 全部测试（每 CPU 核一个 worker）
uv run pytest tests/test_name.py                # 单文件
uv run pytest tests/test_name.py::test_function # 单测试
```

适用场景：验证处理器的帧转换逻辑（聚合器、过滤器、指标计算）。**不适合**验证「bot 听到打断会不会停下」这类时序行为——那属于行为评估。

## 13.2 行为评估（pipecat.evals）

`src/pipecat/evals/` 驱动一个**真 bot** 端到端跑对话，检查它的行为。评估端是一个 **RTVI 客户端**（`EvalTransportParams` / `fastapi_transport.py`），播放用户侧（音频模式下用 TTS 合成人声），评审 bot 侧。

### 13.2.1 场景 YAML 的两种形态

以 `scenarios:` 列表组织，每个场景有 `name:`；文件顶层的任意场景键成为全局默认，场景内同名键**整体替换**。每个场景独立跑、独立连 bot，命名 `<文件>/<场景>`。

**Scripted 场景**（`turns:` 键）——用户的话写死，逐轮断言 bot 的事件：

```yaml
scenarios:
  - name: interruption
    turns:
      - user: "给我讲个很长的故事"
        expect:
          latency:
            max_ms: 2000
          text_contains: ["long, long ago"]
      - user: "（打断）停！"        # 第二轮：用户插话
        expect:
          text_excludes: ["happily ever after"]
          function_call:
            name: stop_story
            eval: { volume: 0 }
          llm_marker:
            marker: incomplete      # complete | short | long | incomplete
            marker_first: true
            text_after: ["好的，我停下来了"]
```

断言类型速查：

| 断言 | 检查什么 |
| ---- | ---- |
| `latency` | 响应延迟（`max_ms`） |
| `text_contains` / `text_excludes` | 回复文本包含/排除的子串 |
| `text_matches` | 回复匹配的正则 |
| `function_call` + `eval:` | 函数名与参数判定（`args:` 不能逐字匹配，走 eval 规则） |
| `llm_marker` | LLM 自评的轮次 marker（`marker`/`marker_first`/`markers`/`text_after`） |
| （LLM judge） | 对回复的语义评审 |

确定性输入，钉死一种行为；场景可在不同 bot 间复用。运行结果记录每轮期望的匹配情况，**跑过的运行会保存它见到的 marker**。

**Simulation 场景**（`persona:` + `goal:` 键）——LLM 扮演用户 pursuing 目标，用 `end_call` 工具挂断；之后 judge 读整场对话（bot 的工具调用原样在场）评审：

```yaml
scenarios:
  - name: pizza-order
    persona: "一个着急的上班族，说话简短"
    goal: "订一份大号玛格丽特披萨并得到送达时间"
    metrics:
      - criterion: "每次回复都要确认订单细节（尺寸/口味/地址）"   # judged
        min_score: 0.8
      - measure: latency          # measured: turns | duration | words | latency
        max_value: 2000
      - measure: function_calls
        calls: ["create_order"]   # 期望的函数调用列表；[] 表示一个都不要
    success: "bot 完成点单并告知送达时间，没有编造菜单外选项"
    runs: 3                        # 全部通过才算过
```

- **judged 指标**（`criterion`，可选 `min_score`）：定义「每条回复该怎样」，评的是满足率（通过轮数占比）。
- **measured 指标**：从运行数据直接计算（`measure: turns|duration|words|latency` 配 `min_value`/`max_value`；`measure: function_calls` 配 `calls`）。
- 通过标准：goal 达成 + 无指标不达标；`runs` 次必须全过。

### 13.2.2 CLI 三板斧

```bash
# 1. 跑单场景（先起 bot：python bot.py --port 7860）
pipecat eval run scenarios/<name>.yaml --bot-url ws://localhost:7860/ws -v

# 2. 发布套件：按 manifest 并行起 bot、跑场景
pipecat eval suite evals/release/manifest.yaml -p <bot-pattern> -s <scenario>
pipecat eval suite evals/release/manifest.yaml -k simulation   # 只跑仿真

# 3. 离线重判已保存的对话（不需要 bot）
pipecat eval judge scenarios/<name>.yaml -s <name> logs/*.conversation.json -o judged.jsonl
```

每次仿真运行保存对话到 `<stem>.conversation.json`（格式见 `pipecat.evals.conversation` 模块 docstring：双方的话 + bot 的函数调用）。

### 13.2.3 发布验证清单（evals/release/）

`evals/release/manifest.yaml` 汇集可复用场景与发布前验证项。条目结构：

| 键 | 说明 |
| ---- | ---- |
| `name:` | 多个条目共用一个 bot 时区分运行标签 |
| `scenarios:` | 该 bot 跑的场景（两种皆可） |
| `runner_body:` | bot 正常拿到的 `/start` 请求体（`path:` 指文件或内联 `data:`） |
| `concurrency:` | 该条目自己的并发上限 |

**前置条件**：`TYPESAFE_API_KEY` 已导出（Jev 评审）；本地 Ollama `gemma4:12b`（评审解释器与仿真用户）；Kokoro/Moonshine（音频模式）。详见 `evals/release/README.md`。

### 13.2.4 Python API

```python
from pipecat.evals.scenario import EvalScenarioFile
from pipecat.evals.session import EvalSession, EvalSessionParams

scenario = EvalScenarioFile.load("scenarios/demo.yaml").scenarios[0]
result = await EvalSession.from_scenario(
    scenario, bot_url, params=EvalSessionParams(...)
).run()
# scripted → EvalScriptResult；simulation → EvalSimulationResult（results.py）
```

离线重判的等价物：

```python
from pipecat.evals.simulation_judge import EvalSimulationJudge
verdicts = await EvalSimulationJudge(simulation).judge(messages)   # 每个判定带 reason
```

用它在不重跑 bot 的情况下调 `criterion` 措辞——把已有 run 的对话拿回来反复评。

### 13.2.5 从 bot 录对话

`EvalConversationObserver`（`evals/conversation_observer.py`）挂在真实 bot 的管道上，录出与仿真同格式的 conversation.json——**线上真实通话也能用同一套 judge 评审**。

### 13.2.6 evals 模块地图

| 模块 | 职责 |
| ---- | ---- |
| `scenario.py` / `scenario_config.py` / `persona.py` | 场景文件加载与配置 |
| `session.py` + `script_session.py` / `simulation_session.py` | 会话编排（按场景类型建 driver） |
| `script.py` + `script_driver.py` | scripted 驱动（逐轮发文本/音频、收断言） |
| `simulation.py` + `simulation_driver.py` | 仿真驱动（LLM 用户 + end_call 工具） |
| `judge.py` / `simulation_judge.py` | LLM 评审（judged 指标与 success） |
| `results.py` / `events.py` / `matcher.py` | 结果模型 / 事件 / 期望匹配器 |
| `conversation.py` / `conversation_observer.py` | 对话录制格式与管道录制器 |
| `transport.py` / `fastapi_transport.py` / `client.py` / `client_transport.py` / `serializer.py` | RTVI 评估客户端 |
| `audio.py` / `tts.py` / `services.py` | 音频模式（合成人声）与服务装配 |
| `harness.py` / `suite.py` / `base_driver.py` / `_session_subprocess.py` | 套件并行编排与子进程管理 |
| `__main__.py` | `python -m pipecat.evals`（旧入口） |

## 13.3 开发流程建议

1. 改处理器逻辑 → 单元测试（`run_test`）守住帧级行为；
2. 改对话行为（策略、prompt、打断）→ 写一个 scripted 场景钉住它；
3. 上线前 → simulation 场景 + 发布套件（`evals/release/manifest.yaml`）整体回归；
4. 线上问题 → `EvalConversationObserver` 录对话，`pipecat eval judge` 离线复盘。

## 13.4 小结

- **帧级用 pytest，行为用 eval**——评估框架是 Pipecat 质量策略的核心：每个行为特性（打断、函数调用、DTMF、轮次 marker）在 `evals/release/` 里都有一个场景。
- scripted 钉单点行为，simulation 测整段对话能力；两者都以 RTVI 客户端身份连 bot，无差别适用。
- `judge` 子命令把「评估」从「跑测试」解耦成「评审数据」——criterion 措辞可以拿旧数据快速迭代。

[← 上一章：观察者与指标](12-observers-metrics.md) | [Wiki 首页](README.md) | [下一章：示例导读 →](14-examples-guide.md)
