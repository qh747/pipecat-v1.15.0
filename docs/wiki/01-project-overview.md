# 01 · 项目概览

[← Wiki 首页](README.md) | [下一章：核心架构 →](02-core-architecture.md)

## Pipecat 是什么

Pipecat 是一个开源 Python 框架，用于构建**实时语音与多模态对话 AI 智能体**。它把构建语音 Agent 时最繁琐的三类工程问题收敛成一套统一模型：

1. **实时音频/视频 I/O** —— WebRTC、WebSocket、电话协议（μ-law 编码、8kHz 采样）等各不相同，Pipecat 用传输层（Transport）统一抽象；
2. **AI 服务编排** —— STT、LLM、TTS、VAD、图像生成等 60+ 家供应商接口各异，Pipecat 用统一的基类（`STTService` / `TTSService` / `LLMService`…）和帧流衔接它们；
3. **对话状态与低延迟** —— 轮次管理、打断、上下文聚合这些「语音对话特有」的难题，框架内置了成熟的解决方案。

核心设计哲学只有一句话：**一切皆帧（Frame），一切皆处理器（FrameProcessor）**。数据在处理器组成的管道中流动，每个处理器独立、可组合、可替换。

## 你能用它构建什么

| 场景 | 说明 | 相关示例 |
| ---- | ---- | ---- |
| 语音助手 | 流式对话，端到端低延迟 | `examples/getting-started/06-voice-agent.py` |
| 多智能体系统 | 专家 Agent 之间交接（handoff）、并行扇出（fan-out）、旁挂（sidecar），通过共享总线协调，可跨进程/跨机器 | `examples/multi-worker/` |
| AI 陪伴/教练 | 角色、情感表达（expressive conversation） | `examples/expressive-conversation/` |
| 多模态交互 | 语音 + 视频 + 图像生成 + 视觉理解 | `examples/vision/`、`examples/video-processing/` |
| 电话业务机器人 | 接入 Twilio/Plivo/Telnyx 等电话网络 | `examples/transports/`（电话相关示例） |
| 结构化对话流 | 预定义/动态对话路径与状态管理（Pipecat Flows） | `examples/flows/` |

## 为什么选 Pipecat

- **Voice-first**：语音识别、合成、对话处理一体化集成，不是「聊天框架加了个音频插件」。
- **可插拔**：60+ 服务供应商（Deepgram、OpenAI、Cartesia、ElevenLabs、Azure、Google……），切换供应商通常只改一行构造函数。
- **可组合管道**：复杂行为由模块化处理器拼装，每个处理器只做一件事。
- **多智能体就绪**：每条管道就是一个 Agent，通过交接、并行扇出、旁挂 Worker 或分布式部署组合（v1.3.0 起内建 Worker/Bus/Job 模型）。
- **实时性**：帧级流式处理 + 可观测的延迟指标（TTFB、处理耗时），针对超低延迟交互优化。

## 核心特性速览

| 特性 | 入口 |
| ---- | ---- |
| 帧驱动管道 | [03 帧系统](03-frames.md)、[04 FrameProcessor](04-frame-processor.md) |
| 多传输支持（Daily / LiveKit / WebSocket / 电话 / 本地） | [08 传输层](08-transports-serializers.md) |
| 60+ AI 服务 + 表情表达能力适配 | [09 服务集成](09-services.md) |
| 轮次管理、打断、VAD | [07 轮次管理](07-turn-management.md) |
| 多 Worker、消息总线、Job RPC | [10 多 Worker 协作](10-multi-worker.md) |
| RTVI 客户端协议 | [11 RTVI](11-rtvi.md) |
| 观察者、指标、追踪 | [12 观察者与指标](12-observers-metrics.md) |
| 行为评估框架 | [13 测试与评估](13-testing-evals.md) |

## 生态一览

Pipecat 框架本体之外，官方维护着一套完整生态：

- **客户端 SDK**：JavaScript / React / React Native / Swift / Kotlin / C++ / ESP32，均可通过 RTVI 协议连接 Pipecat bot。
- **Pipecat Flows**：内建的结构化对话引擎（预定义或动态对话路径、状态管理），见 `src/pipecat/flows/`。
- **Pipecat UI**：基于 shadcn 的语音 AI 前端组件库（`pipecat-ui` 仓库）。
- **Pipecat CLI**：随 `pipecat-ai` 安装，`pipecat init` 一分钟脚手架项目，`pipecat eval` 运行行为评估。
- **Whisker**：实时管道调试器，可视化帧流动。
- **Tail**：终端仪表盘。

## 仓库目录导览

| 目录 | 内容 |
| ---- | ---- |
| `src/pipecat/frames/` | 帧定义（100+ 种帧类型） |
| `src/pipecat/processors/` | `FrameProcessor` 基类、聚合器、过滤器、音频处理 |
| `src/pipecat/pipeline/` | 管道编排：`Pipeline`、`PipelineWorker`、Job RPC |
| `src/pipecat/workers/` | Worker 模型：`BaseWorker`、`WorkerRunner`、LLM/UI Worker |
| `src/pipecat/bus/` | Worker 间消息总线（本地队列 + pgmq/redis 分布式实现） |
| `src/pipecat/registry/` | Worker 注册表（本地 + 远程追踪） |
| `src/pipecat/services/` | 60+ AI 服务集成 |
| `src/pipecat/transports/` | 传输层（Daily、LiveKit、WebSocket、Local 等） |
| `src/pipecat/serializers/` | WebSocket 帧序列化（含电话协议） |
| `src/pipecat/observers/` | 管道观察者 |
| `src/pipecat/audio/` | VAD、音频过滤器、混音器、轮次检测、DTMF |
| `src/pipecat/turns/` | 用户轮次管理 |
| `src/pipecat/adapters/` | LLM/TTS 适配器（上下文、工具、表情能力转换） |
| `src/pipecat/evals/` | 行为评估框架（经 `pipecat eval` 使用） |
| `src/pipecat/runner/` | 开发运行器（多传输 bot 托管） |
| `examples/` | 25+ 个分类示例 |
| `evals/` | 评估套件，`evals/release/` 为发布验证清单 |
| `tests/` | 单元测试 |

## 总结

- Pipecat 用「帧 + 管道」一个模型统一了实时多模态 Agent 的全部工程复杂度。
- 框架解决三件难事：实时 I/O 抽象、AI 服务编排、对话状态管理。
- 单机器人够简单（30 行起步），多智能体够强大（内建 Worker/Bus/Job）。
- 下一章进入核心架构，看一帧语音是如何变成一句回答的。

[← Wiki 首页](README.md) | [下一章：核心架构 →](02-core-architecture.md)
