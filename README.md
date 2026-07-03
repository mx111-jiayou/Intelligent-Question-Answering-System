# Intelligent-Question-Answering-System

基于开发文档实现的 RAG 智能问答系统原型。项目参考 FastGPT、Dify、AnythingLLM 等开源 RAG 产品的成熟能力，优先实现“知识库 + 混合检索 + 会话问答 + 引用来源 + 管理后台”的核心闭环。

## 功能

- 左侧会话导航、历史搜索、新建对话
- 中央问答输入区，支持 Enter 发送和 Shift + Enter 换行
- 本地知识库管理，支持新增知识库和粘贴文本入库
- 混合检索、关键词检索、语义检索三种模式
- 回答展示引用来源、文档名称和检索分数
- 管理后台包含知识库、文档入库、检索测试、模型配置
- 会话重命名、会话删除、文档删除
- 答案复制、点赞/点踩反馈、问答日志记录
- 仪表盘统计：知识库数量、文档数量、解析成功率、问答趋势
- 知识库卡片页：新建知识库、管理文档、开始问答
- 模型管理页：OpenAI、DeepSeek、通义千问、文心一言配置与测试
- 语音配置页：百度 ASR、阿里云语音识别配置、默认 Provider 选择
- 权限管理页：用户角色状态、未分配角色提示、角色切换
- 浏览器 localStorage 本地持久化
- 深色主题切换和会话 Markdown 导出

## 使用

直接用浏览器打开：

```text
index.html
```

无需安装依赖，也不需要启动后端服务。

如果需要体验服务端 RAG、问题重写、多轮历史记录和 SSE 流式输出，运行：

```powershell
node server.js
```

然后访问：

```text
http://127.0.0.1:5173
```

## 服务端能力

- `/api/chat/stream`：SSE 流式问答接口
- `/api/search-test`：Top-K Retriever 检索测试
- `/api/conversations`：历史会话读取
- `/api/knowledge-bases`：知识库读取和新建
- 本地 JSON 模拟数据库，保存多轮历史聊天、问答日志和知识库
- 简化版问题重写：结合最近历史消息补全追问上下文
- 简化版 Embedding/Retriever：使用分词、关键词和语义相似度模拟向量召回

## 测试

需要 Node.js：

```powershell
node tests/rag.test.js
```

## 说明

当前版本提供无依赖 Node.js 后端来模拟 FastAPI、LangChain、ChromaDB、Embedding、Retriever 和 SSE 的核心行为。后续可按 `RAG智能问答系统开发文档.md` 将模拟实现替换为真实 FastAPI 服务、Embedding 模型、ChromaDB 向量库和重排模型。
