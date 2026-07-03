# RAG 智能问答系统开发文档

## 1. 项目概述

本项目为一个基于 RAG（Retrieval-Augmented Generation，检索增强生成）的智能问答系统。系统面向企业知识库、业务文档、制度流程、产品资料等场景，支持用户通过自然语言提出问题，系统自动检索相关知识内容，并结合大语言模型生成清晰、可追溯的答案。

页面原型参考截图中的 Web 应用界面，核心体验为左侧会话导航 + 中央问答输入区 + 会话式答案输出。

### 1.1 参考项目调研

为了让系统设计更接近成熟 RAG 产品，本需求文档参考了以下公开项目的产品能力：

| 项目 | 可借鉴能力 | 对本项目的改进建议 |
| --- | --- | --- |
| FastGPT | 知识库管理、混合检索、引用反馈、应用编排、调用链日志 | 增加混合检索、重排、引用来源、问答日志、后续工作流扩展 |
| Dify | RAG Pipeline、模型管理、Prompt IDE、Agent、LLMOps、API 集成 | 增加模型供应商管理、Prompt 模板、评测与可观测性、开放 API |
| AnythingLLM | 本地优先、多用户、文档管道、向量数据库、拖拽上传、来源引用 | 增加多用户权限、文档解析管道、拖拽上传、本地部署和隐私配置 |

参考链接：

- FastGPT：https://github.com/labring/FastGPT
- Dify：https://github.com/langgenius/dify
- AnythingLLM：https://github.com/Mintplex-Labs/anything-llm

## 2. 页面目标

首页需要突出“把问题变成清晰答案”的产品定位，让用户进入页面后可以立即发起一次问答。

页面需要具备以下能力：

- 新建对话
- 查看历史对话
- 搜索历史对话
- 进入管理后台
- 输入问题并提交
- 选择问答模型或知识库范围
- 展示问答结果
- 支持实时问答、系统交互、业务系统接入等能力入口或状态说明

## 3. 用户角色

| 角色 | 描述 | 权限 |
| --- | --- | --- |
| 普通用户 | 使用系统进行知识问答 | 新建对话、提问、查看个人历史会话 |
| 管理员 | 管理知识库、模型配置、用户和系统参数 | 普通用户权限 + 后台管理权限 |
| 系统维护人员 | 负责部署、监控、日志和服务维护 | 系统配置、日志查看、服务状态维护 |

## 4. 页面结构

### 4.1 整体布局

页面采用三段式布局：

- 顶部区域：当前会话标题、用户菜单、收藏或常用操作入口
- 左侧边栏：产品标识、新建对话、管理后台、搜索、历史问题列表、当前用户信息
- 主内容区：欢迎语、输入框、辅助操作、功能能力说明、问答结果展示区域

### 4.2 左侧边栏

左侧边栏用于承载会话管理和入口导航。

功能要求：

- 展示系统名称：`RAG 智能问答`
- 展示当前产品版本，可显示为 `v1.0`
- 提供“新对话”按钮
- 提供“管理后台”入口
- 提供历史会话搜索框
- 展示最近问题列表
- 底部展示当前登录用户，例如 `admin`
- 支持折叠或自适应窄屏显示

历史问题列表展示示例：

- 销售数据统计内容
- 校园评价 AI 问答系统的设计
- 数据库表及接口说明
- 如何让 AI 辅助完成公文撰写
- SPSS 交叉表分析
- 阿里云产品介绍

### 4.3 主内容区

主内容区为空会话状态时，需要展示首页引导。

文案建议：

- 主标题：`把问题变成清晰答案`
- 副标题：`连接本地知识，知识检索与深度思考，一次对话给出可执行方案`

主输入框要求：

- 占据页面视觉中心
- 支持多行输入
- 占位提示：`输入需要系统回答的问题...`
- 支持回车发送
- 支持 `Shift + Enter` 换行
- 右侧提供发送按钮
- 可在输入框下方展示模型或知识库选择器

辅助提示：

- `Enter 发送`
- `Shift + Enter 换行`

### 4.4 功能能力区

首页下方展示三个核心能力：

| 能力 | 说明 |
| --- | --- |
| 实时答题 | 用户提出问题后，系统实时检索知识库并生成答案 |
| 系统交互 | 支持多轮上下文对话，保留当前会话语境 |
| 业务系统 | 可对接企业内部业务系统、文档系统或数据接口 |

## 5. 功能需求

### 5.1 用户登录

系统需要支持基础登录能力。

需求：

- 用户输入账号和密码登录
- 登录成功后进入问答首页
- 登录态失效时跳转登录页
- 管理员账号可访问管理后台
- 普通用户不可访问后台管理页面

### 5.2 新建对话

用户点击“新对话”后，系统创建一个新的会话。

需求：

- 新会话默认标题为 `新对话`
- 用户首次提问后，根据问题内容自动生成会话标题
- 新会话需要出现在左侧历史列表顶部
- 支持切换不同历史会话

### 5.3 历史会话搜索

用户可通过关键词搜索历史会话。

需求：

- 根据会话标题匹配
- 根据问题内容匹配
- 搜索结果实时刷新
- 无结果时展示空状态

### 5.4 智能问答

用户输入问题后，系统返回智能答案。

流程：

1. 用户输入问题
2. 前端提交问题、会话 ID、模型配置、知识库范围
3. 后端检索相关知识片段
4. 后端调用大语言模型生成答案
5. 前端流式展示回答内容
6. 保存问题、答案、引用来源和时间

答案展示要求：

- 支持 Markdown 渲染
- 支持代码块
- 支持表格
- 支持引用来源展示
- 支持复制答案
- 支持重新生成
- 支持点赞、点踩反馈

### 5.5 知识库检索

系统需要支持 RAG 检索。

需求：

- 支持上传文档进入知识库
- 支持 PDF、Word、Markdown、TXT、Excel 等常见格式
- 文档入库后自动切分为文本片段
- 文本片段生成向量并存入向量数据库
- 问答时根据用户问题召回相关片段
- 支持展示引用来源、文档名称和片段内容
- 支持关键词检索 + 向量检索的混合检索
- 支持对召回片段进行重排，提高答案相关性
- 支持单个知识库检索测试，方便管理员调试召回效果
- 支持手动编辑、删除、禁用文档片段
- 支持 URL 内容抓取入库，作为后续扩展能力

### 5.6 模型与 Prompt 管理

系统需要支持多模型配置，避免后续只能绑定单一模型。

需求：

- 支持配置多个模型供应商，例如 OpenAI API 兼容服务、通义千问、DeepSeek、智谱、Ollama、本地模型服务等
- 支持区分聊天模型、Embedding 模型和重排模型
- 支持设置默认模型
- 支持按知识库或应用配置不同模型
- 支持 Prompt 模板管理
- 支持系统提示词、检索增强提示词、回答格式提示词分开配置
- 支持 Prompt 调试，展示最终发送给模型的上下文
- API Key 仅后端保存，前端不返回明文

### 5.7 管理后台

管理员点击“管理后台”后进入后台页面。

后台模块建议：

- 用户管理
- 知识库管理
- 文档管理
- 模型配置
- 对话记录
- 系统日志
- 权限管理
- 问答评测
- 调用链路

知识库管理需求：

- 新建知识库
- 修改知识库名称和描述
- 上传文档
- 删除文档
- 查看文档解析状态
- 重新向量化文档

模型配置需求：

- 配置模型供应商
- 配置模型名称
- 配置 API 地址
- 配置 API Key
- 配置温度、最大输出长度、Top P 等参数

### 5.8 问答评测与反馈

为了持续优化 RAG 效果，系统需要记录问答质量反馈。

需求：

- 用户可以对答案点赞或点踩
- 用户可以提交反馈原因
- 管理员可以查看低质量回答列表
- 支持查看问题、召回片段、最终 Prompt、模型回答、耗时和 Token 消耗
- 支持人工标注标准答案
- 支持按知识库、模型、时间范围统计问答质量

### 5.9 开放 API 与嵌入

系统后续可作为企业内部问答能力提供给其他系统调用。

需求：

- 提供问答 API
- 提供知识库文档上传 API
- 提供会话记录 API
- 支持 API Key 鉴权
- 支持嵌入式问答组件，便于挂载到业务系统页面
- 支持 iframe 或 JS SDK 形式接入，作为后续扩展能力

## 6. 非功能需求

### 6.1 性能要求

- 首页首屏加载时间小于 2 秒
- 普通问答首字响应时间小于 3 秒
- 单次问答总响应时间建议小于 15 秒
- 历史会话列表分页加载
- 大文档解析任务异步处理

### 6.2 安全要求

- 密码加密存储
- API Key 不允许明文返回前端
- 管理接口需要权限校验
- 文件上传需要限制大小和类型
- 防止 Prompt Injection 影响系统指令
- 用户只能访问自己的会话记录

### 6.3 可用性要求

- 问答失败时提供明确错误提示
- 模型接口异常时支持重试
- 文档解析失败时展示失败原因
- 长答案生成时支持加载状态
- 页面适配桌面端和常见笔记本分辨率

### 6.4 可观测性要求

- 记录每次问答的请求时间、首字响应时间、总耗时
- 记录模型名称、Token 消耗、召回片段数量
- 记录检索命中分数和重排分数
- 记录异常日志和模型调用失败原因
- 管理后台可查看调用链路
- 支持按天统计问答量、活跃用户数、失败率和平均耗时

### 6.5 隐私与本地化部署

- 支持私有化部署
- 支持关闭外部遥测或埋点
- 文档原文、向量数据、对话记录默认保存在本地或企业私有环境
- 支持内网模型服务和本地 Embedding 模型
- 支持按用户、部门或知识库进行数据隔离

## 7. 技术架构建议

### 7.1 前端

建议技术栈：

- Vue 3 或 React
- TypeScript
- Vite
- Tailwind CSS 或 Ant Design Vue / Ant Design
- Markdown 渲染组件
- SSE 或 WebSocket 用于流式回答

前端模块：

- 登录模块
- 首页问答模块
- 会话管理模块
- 知识库管理模块
- 后台管理模块
- 用户权限模块

### 7.2 后端

建议技术栈：

- Python FastAPI 或 Java Spring Boot
- JWT 鉴权
- MySQL / PostgreSQL
- Redis
- Milvus / Chroma / FAISS / pgvector
- LangChain / LlamaIndex 可选

后端模块：

- 用户认证服务
- 会话服务
- 问答服务
- 文档解析服务
- 向量检索服务
- 模型调用服务
- 后台管理服务
- 日志与监控服务

### 7.3 RAG 流程

```mermaid
flowchart LR
    A[用户提问] --> B[问题预处理]
    B --> C[问题改写与意图识别]
    C --> D[向量化问题]
    C --> E[关键词检索]
    D --> F[向量数据库检索]
    E --> G[全文索引检索]
    F --> H[合并召回结果]
    G --> H
    H --> I[重排与过滤]
    I --> J[构造 Prompt]
    J --> K[调用大语言模型]
    K --> L[流式生成答案]
    L --> M[返回答案与引用来源]
    M --> N[记录日志与反馈]
```

### 7.4 文档入库流程

```mermaid
flowchart LR
    A[上传文档] --> B[文件校验]
    B --> C[文本解析]
    C --> D[清洗与结构化]
    D --> E[文本切分]
    E --> F[生成 Embedding]
    F --> G[写入向量库]
    E --> H[写入全文索引]
    G --> I[入库完成]
    H --> I
```

文档解析需要采用异步任务，前端展示解析状态。解析失败时，需要记录错误原因，并支持重新解析。

## 8. 数据库设计

### 8.1 用户表 users

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 用户 ID |
| username | varchar | 用户名 |
| password_hash | varchar | 密码哈希 |
| role | varchar | 用户角色 |
| status | tinyint | 状态 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 8.2 会话表 conversations

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 会话 ID |
| user_id | bigint | 用户 ID |
| title | varchar | 会话标题 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 8.3 消息表 messages

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 消息 ID |
| conversation_id | bigint | 会话 ID |
| role | varchar | user / assistant / system |
| content | text | 消息内容 |
| references | json | 引用来源 |
| created_at | datetime | 创建时间 |

### 8.4 知识库表 knowledge_bases

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 知识库 ID |
| name | varchar | 知识库名称 |
| description | text | 描述 |
| owner_id | bigint | 创建人 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 8.5 文档表 documents

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 文档 ID |
| knowledge_base_id | bigint | 知识库 ID |
| filename | varchar | 文件名 |
| file_type | varchar | 文件类型 |
| file_size | bigint | 文件大小 |
| status | varchar | pending / parsing / completed / failed |
| error_message | text | 错误信息 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 8.6 文档片段表 document_chunks

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 片段 ID |
| document_id | bigint | 文档 ID |
| chunk_index | int | 片段序号 |
| content | text | 片段内容 |
| vector_id | varchar | 向量数据库 ID |
| metadata | json | 元数据 |
| created_at | datetime | 创建时间 |

### 8.7 模型配置表 model_configs

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 模型配置 ID |
| provider | varchar | 模型供应商 |
| model_type | varchar | chat / embedding / rerank |
| model_name | varchar | 模型名称 |
| api_base | varchar | API 地址 |
| api_key_encrypted | varchar | 加密后的 API Key |
| parameters | json | 模型参数 |
| is_default | tinyint | 是否默认 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 8.8 问答日志表 qa_logs

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 日志 ID |
| message_id | bigint | 消息 ID |
| user_id | bigint | 用户 ID |
| model_name | varchar | 使用模型 |
| retrieved_chunks | json | 召回片段 |
| prompt | text | 最终 Prompt |
| latency_ms | int | 总耗时 |
| first_token_ms | int | 首字耗时 |
| token_usage | json | Token 消耗 |
| error_message | text | 错误信息 |
| created_at | datetime | 创建时间 |

### 8.9 反馈表 message_feedback

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 反馈 ID |
| message_id | bigint | 消息 ID |
| user_id | bigint | 用户 ID |
| rating | varchar | like / dislike |
| reason | text | 反馈原因 |
| created_at | datetime | 创建时间 |

## 9. API 设计

### 9.1 登录

```http
POST /api/auth/login
```

请求：

```json
{
  "username": "admin",
  "password": "123456"
}
```

响应：

```json
{
  "token": "jwt-token",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

### 9.2 创建会话

```http
POST /api/conversations
```

响应：

```json
{
  "id": 1001,
  "title": "新对话"
}
```

### 9.3 获取会话列表

```http
GET /api/conversations?keyword=&page=1&pageSize=20
```

### 9.4 获取会话消息

```http
GET /api/conversations/{conversationId}/messages
```

### 9.5 发送问题

```http
POST /api/chat
```

请求：

```json
{
  "conversationId": 1001,
  "question": "请总结这份制度文档的核心要求",
  "knowledgeBaseId": 1,
  "model": "default"
}
```

响应方式建议使用 SSE：

```http
Content-Type: text/event-stream
```

事件示例：

```text
event: message
data: {"content":"根据知识库内容，"}

event: message
data: {"content":"核心要求包括..."}

event: done
data: {"messageId":2001}
```

### 9.6 停止生成

```http
POST /api/chat/{messageId}/stop
```

### 9.7 上传文档

```http
POST /api/knowledge-bases/{knowledgeBaseId}/documents
Content-Type: multipart/form-data
```

### 9.8 获取文档列表

```http
GET /api/knowledge-bases/{knowledgeBaseId}/documents
```

### 9.9 检索测试

```http
POST /api/knowledge-bases/{knowledgeBaseId}/search-test
```

请求：

```json
{
  "query": "报销流程是什么？",
  "topK": 5,
  "retrievalMode": "hybrid"
}
```

响应：

```json
{
  "items": [
    {
      "documentId": 1,
      "documentName": "财务制度.pdf",
      "chunkId": 10,
      "content": "员工报销需要提交发票、审批单...",
      "score": 0.87
    }
  ]
}
```

### 9.10 用户反馈

```http
POST /api/messages/{messageId}/feedback
```

请求：

```json
{
  "rating": "like",
  "reason": "回答准确，引用清晰"
}
```

## 10. 前端交互细节

### 10.1 输入框

- 输入为空时，发送按钮禁用
- 正在生成答案时，发送按钮变为停止按钮
- 用户可点击停止按钮中断生成
- 输入框高度随内容自动增长，但需设置最大高度

### 10.2 会话列表

- 当前会话高亮显示
- 鼠标悬停时展示更多操作
- 更多操作包括重命名、删除
- 删除会话前需要二次确认

### 10.3 问答结果

- 用户问题靠右或采用明显区分样式
- AI 回答靠左展示
- 回答生成中显示加载动画
- 回答完成后展示复制、重新生成、反馈按钮
- 有引用来源时在答案下方展示“参考来源”

### 10.4 错误状态

常见错误提示：

- `网络异常，请稍后重试`
- `模型服务暂时不可用`
- `未检索到相关知识，请换个问题试试`
- `文件解析失败，请检查文件格式`
- `登录已过期，请重新登录`

## 11. 验收标准

### 11.1 首页

- 页面布局与截图保持一致：左侧导航 + 主问答区
- 标题和输入框居中展示
- 新建对话、管理后台、历史列表入口可见
- 输入问题后可以成功生成答案

### 11.2 会话

- 可以创建新会话
- 可以查看历史会话
- 可以搜索历史会话
- 可以切换历史会话并恢复消息内容

### 11.3 RAG 问答

- 问答能够检索知识库内容
- 答案中能够展示引用来源
- 支持流式输出
- 支持多轮上下文

### 11.4 后台

- 管理员可以进入后台
- 可以上传文档
- 可以查看文档解析状态
- 可以配置模型参数

## 12. 开发里程碑

| 阶段 | 内容 | 交付物 |
| --- | --- | --- |
| 第 1 阶段 | 项目初始化、登录、基础布局 | 可访问首页 |
| 第 2 阶段 | 会话管理、历史搜索、消息展示 | 可进行普通对话 |
| 第 3 阶段 | 文档上传、解析、向量化、全文索引 | 可管理知识库 |
| 第 4 阶段 | 混合检索、重排、模型调用、流式回答 | 可完成知识问答 |
| 第 5 阶段 | 后台管理、权限控制、调用链日志、反馈 | 管理功能完整 |
| 第 6 阶段 | API 接入、嵌入组件、测试、优化、部署 | 可上线版本 |

## 13. 页面视觉规范

### 13.1 色彩

- 主色：蓝色，用于标题重点、按钮、选中态
- 背景色：浅色背景，保持清爽简洁
- 侧边栏：白色或浅灰
- 辅助色：浅蓝、浅绿、浅黄，用于功能说明和状态提示

### 13.2 字体

- 系统默认中文字体
- 主标题建议 32px - 40px
- 正文建议 14px - 16px
- 侧边栏列表建议 13px - 14px

### 13.3 间距

- 页面左右留白充足
- 主输入框宽度建议 640px - 820px
- 左侧边栏宽度建议 240px - 280px
- 卡片和按钮圆角建议 8px - 12px

## 14. 部署建议

### 14.1 基础部署

- 前端使用 Nginx 部署静态资源
- 后端使用 Docker 部署服务
- 数据库使用 MySQL 或 PostgreSQL
- 向量数据库根据数据规模选择 Chroma、Milvus 或 pgvector
- Redis 用于缓存和任务状态

### 14.2 环境变量

```env
APP_ENV=production
DATABASE_URL=mysql://user:password@localhost:3306/rag_qa
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=change-me
LLM_API_BASE=https://api.example.com/v1
LLM_API_KEY=change-me
VECTOR_DB_TYPE=pgvector
UPLOAD_DIR=./uploads
```

## 15. 测试清单

- 登录成功和失败测试
- 权限拦截测试
- 新建会话测试
- 会话搜索测试
- 提问和回答测试
- 流式输出测试
- 多轮对话测试
- 文档上传测试
- 文档解析失败测试
- 知识库检索准确性测试
- 管理后台权限测试
- 移动端和窄屏适配测试

## 16. 后续可扩展能力

- 多知识库同时检索
- 企业微信、钉钉、飞书接入
- 对话分享
- 答案导出为 Word 或 PDF
- 问答质量评估
- 用户行为统计
- 文档权限隔离
- 私有化模型部署
- 问答审计与敏感词过滤
- Agent 工具调用
- 工作流编排
- 模型自动路由
- 检索策略 A/B 测试
- 多模态文档解析
- 站点嵌入式问答组件
