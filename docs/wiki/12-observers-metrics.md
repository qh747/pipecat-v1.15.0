# 12 · 观察者与指标

[← 上一章：RTVI 协议](11-rtvi.md) | [Wiki 首页](README.md) | [下一章：测试与行为评估 →](13-testing-evals.md)

> **本页要点**
>
> - Observer 是**旁路监控**：两个钩子 `on_process_frame`（处理器处理帧时）与 `on_push_frame`（帧在处理器间推送时），不修改帧流
> - 指标分三层：**延迟**（TTFB / TTFA / 处理耗时）、**用量**（LLM token、STT 音频、TTS 字符）、**轮次**（TurnMetricsData）
> - `PipelineWorker(observers=[...])` 注入；Worker 内部还自带 idle 观察、turn tracking、turn trace
> - RTVI 观察者（上一章）就是 Observer 模型最大的消费者——「帧流即事件流」

源码：`src/pipecat/observers/`、`src/pipecat/metrics/metrics.py`。

## 12.1 Observer 模型

```python
# observers/base_observer.py:48-71
@dataclass
class FramePushed:
    """Data pushed when a frame is pushed between processors.

    Parameters:
        source: The processor sending the frame.
        destination: The processor receiving the frame.
        frame: The frame being transferred.
        direction: The direction of the transfer.
        timestamp: The time when the frame is pushed, based on the pipeline clock.
        first_push: Whether this is the first time the frame is pushed.
    """

@dataclass
class FrameProcessed:
    """Data pushed when a processor processes a frame.
    (processor, frame, direction, timestamp)
    """
```

两个钩子的区别：

| 钩子 | 触发点 | 数据 | 典型用途 |
| ---- | ---- | ---- | ---- |
| `on_process_frame(FrameProcessed)` | 每个处理器**开始处理**帧时（`process_frame` 开头，`frame_processor.py:855-861`） | processor + frame | 统计单处理器耗时、审计 |
| `on_push_frame(FramePushed)` | 帧在**处理器之间**推送时（`__internal_push_frame`，含 source/destination） | source + destination + frame | 追踪帧轨迹、事件流（RTVI 用它） |

- 构造时可传 `observe_every_push=False`：只看「首次推送」（`first_push=True`），大幅降噪——内置的 `IdleFrameObserver` 就这么用（`pipeline/worker.py:133`）。
- 复合处理器（Pipeline/ParallelPipeline）通过 `processors` property 暴露子处理器；`ProcessorSetUp` 数据（`:75`）报告每个处理器的 setup 起始时间（启动计时用）。

**用法**（通过 `PipelineWorker(observers=[...])` 注入）：

```python
from pipecat.observers.turn_tracking_observer import TurnTrackingObserver
from pipecat.observers.user_bot_latency_observer import UserBotLatencyObserver

worker = PipelineWorker(
    pipeline,
    observers=[TurnTrackingObserver(), UserBotLatencyObserver()],
)
```

## 12.2 内置观察者一览

| 观察者 | 文件 | 用途 |
| ---- | ---- | ---- |
| `TurnTrackingObserver` | `turn_tracking_observer.py` | 把 VAD/轮次帧整理成「轮次开始/结束」会话轨迹（`enable_turn_tracking=True` 时 Worker 自动注入） |
| `UserBotLatencyObserver` | `user_bot_latency_observer.py` | 测量用户说完 → bot 开始响应的延迟 |
| `TurnTraceObserver` | `utils/tracing/turn_trace_observer.py` | OpenTelemetry 轮次追踪 span（`enable_tracing=True`） |
| `IdleFrameObserver` | `pipeline/worker.py:117` | Worker 内部：特定帧推送即喂 `idle_event`（空闲检测的基础） |
| `ErrorObserver` | `error_observer.py` | 错误帧集中处理/上报 |
| `FunctionCallObserver` | `function_call_observer.py` | 函数调用生命周期旁路记录 |
| `ServiceMetricsObserver` | `service_metrics_observer.py` | 各服务指标汇聚 |
| `SpeakingObserver` | `speaking_observer.py` | 用户/bot 说话事件 |
| `StartupTimingObserver` | `startup_timing_observer.py` | 启动阶段计时（setup 耗时等） |
| `AICTytoObserver` | `aic_tyto_observer.py` | AIC（第三方质量分析）对接 |
| `EvalConversationObserver` | `evals/conversation_observer.py` | 把真实对话录成 `<stem>.conversation.json`，用评估 judge 复判（见 [13](13-testing-evals.md)） |
| loggers/ | `observers/loggers/` | 语音/文本/转录日志观察者（debug 用） |

## 12.3 指标体系（metrics.py）

全部指标数据都是 Pydantic `MetricsData(BaseModel)` 子类（`:19`），由各处理器构造、装进 `MetricsFrame`（SystemFrame，`frames.py:1671`）沿管道流动。

### 12.3.1 延迟指标

| 类 | 行号 | 含义 |
| ---- | ---- | ---- |
| `TTFBMetricsData` | `:31` | Time To First Byte——每个服务从收到请求到产出第一字节的耗时（`processor` + `model` + `value` 秒） |
| `TTFAMetricsData` | `:41` | Time To First Audio——用户听到第一个音频的端到端延迟 |
| `TTFATMetricsData` | `:64` | Time To First Audio Token（realtime/逐 token 音频模型） |
| `ProcessingMetricsData` | `:99` | 处理耗时（如一次 TTS 合成耗了多少秒） |

开关在 `PipelineParams(enable_metrics=True, enable_usage_metrics=True)`；`report_only_initial_ttfb=True` 只报每轮首个 TTFB（省日志）。

### 12.3.2 用量指标

| 类 | 行号 | 含义 |
| ---- | ---- | ---- |
| `LLMTokenUsage` / `LLMUsageMetricsData` | `:109` / `:153` | prompt/completion/cached tokens |
| `STTUsage` / `STTUsageMetricsData` | `:163` / `:183` | 转写音频时长（按服务计费口径） |
| `TTSUsageMetricsData` | `:193` | 合成字符量 |
| `TextAggregationMetricsData` | `:203` | 文本聚合批大小（聚合效率分析） |

### 12.3.3 轮次指标

| 类 | 行号 | 含义 |
| ---- | ---- | ---- |
| `TurnMetricsData` | `:216` | 一轮对话的起止/延迟汇总 |
| `SmartTurnMetricsData` | `:235` | SmartTurn 轮次分析器的判定指标 |

指标帧的消费方：RTVIObserver（`metrics_enabled=True` 时发 `metrics` 消息给客户端）、`ServiceMetricsObserver`、应用自己的 observer。

## 12.4 追踪（OpenTelemetry）

- `PipelineWorker(enable_tracing=True)` + `TracingContext`（`utils/tracing/tracing_context.py`）；可用性探测 `is_tracing_available()`。
- `TurnTraceObserver` 把每轮对话做成 span 链（用户轮次 → LLM → TTS），可导入 Langfuse 等追踪平台；`additional_span_attributes` 参数可附加自定义 span 属性。
- tracing 依赖是可选 extra（`pyproject.toml` 的 tracing 组）。

## 12.5 自定义观察者骨架

```python
from pipecat.observers.base_observer import BaseObserver, FramePushed

class MyLatencyLogger(BaseObserver):
    """记录每次 LLM 输出首块的推送时间。"""

    def __init__(self):
        super().__init__()          # observe_every_push 默认 True

    async def on_push_frame(self, data: FramePushed):
        from pipecat.frames.frames import LLMTextFrame
        if isinstance(data.frame, LLMTextFrame) and data.first_push:
            print(f"first LLM chunk at {data.timestamp}")
```

**选型口诀**：要「每处理器一跳」用 `on_process_frame`；要「跟随帧的轨迹」用 `on_push_frame`；只想看首次推送就 `observe_every_push=False`。观察者**绝不能改帧**——需要改帧请写 FrameProcessor。

## 12.6 小结

- Observer 是 Pipecat 的「事件总线补充」：RTVI 出站、空闲检测、轮次追踪、错误上报全部构建在同一模型上。
- 指标三类九种：延迟（TTFB/TTFA/TTFAT/Processing）、用量（LLM/STT/TTS）、轮次（Turn/SmartTurn）——都经 `MetricsFrame` 流动，观察者按需取用。
- 打开姿势：`PipelineParams(enable_metrics=True, enable_usage_metrics=True)` + `PipelineWorker(observers=[...])`。

[← 上一章：RTVI 协议](11-rtvi.md) | [Wiki 首页](README.md) | [下一章：测试与行为评估 →](13-testing-evals.md)
