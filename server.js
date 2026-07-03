const http = require("http");
const fs = require("fs");
const path = require("path");
const { searchKnowledgeBase, generateAnswer, tokenize } = require("./app");

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "rag-db.json");

const types = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".md": "text/markdown;charset=utf-8",
  ".json": "application/json;charset=utf-8",
};

const defaultDb = {
  model: {
    provider: "Qwen 3 Compatible",
    name: "qwen3-rag-demo",
    prompt:
      "你是企业知识库智能问答助手。请结合检索片段回答，给出引用来源；如果知识库不足，请明确说明不确定性。",
  },
  knowledgeBases: [
    {
      id: "kb-enterprise-rag",
      name: "企业 RAG 知识库",
      description: "演示 RAG、SSE、多轮对话、问题重写和 Top-K Retriever 的知识库。",
      documents: [
        {
          id: "doc-rag-architecture",
          name: "融合检索增强生成 RAG 企业问答系统.md",
          content:
            "项目基于 RAG 构建企业知识库问答系统，支持语义检索、问题重写、多轮历史对话、文档重排序和流式输出。后端可使用 FastAPI 提供智能问答接口，使用 LangChain 组织 Retrieval-Augmented Generation 流程，使用 ChromaDB 保存 Embedding 向量，实现 Top-K 相似度召回。",
        },
        {
          id: "doc-sse",
          name: "SSE 流式输出说明.md",
          content:
            "Server-Sent Events 可以让服务端持续向浏览器推送模型生成内容。问答接口先返回检索状态、改写后的问题和引用来源，再分片推送答案 token，最后发送 done 事件。这样可以降低用户等待时间。",
        },
        {
          id: "doc-history",
          name: "多轮历史对话设计.md",
          content:
            "多轮对话需要从数据库读取历史聊天记录，将最近几轮问题和回答拼接为上下文。问题重写模块会结合历史上下文补全省略词、指代词和追问内容，提高 Retriever 检索效果。",
        },
      ],
    },
  ],
  conversations: [
    {
      id: "conv-server-demo",
      title: "服务端 RAG 演示",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    },
  ],
  qaLogs: [],
};

function ensureDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(defaultDb, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json;charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function getConversation(db, conversationId) {
  let conversation = db.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    conversation = {
      id: conversationId || createId("conv"),
      title: "新对话",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    db.conversations.unshift(conversation);
  }
  return conversation;
}

function rewriteQuestion(question, history) {
  const recent = history
    .slice(-4)
    .map((message) => message.content)
    .join(" ");
  const shortFollowUp = question.length < 16 || /这个|它|上面|继续|详细|为什么|怎么/.test(question);
  if (!recent || !shortFollowUp) return question;
  const keywords = tokenize(recent).slice(0, 8).join(" ");
  return `${question}（结合历史上下文：${keywords}）`;
}

function buildAnswer(question, rewrittenQuestion, references, db, history) {
  const base = generateAnswer(rewrittenQuestion, references, db.model);
  const historyNote = history.length
    ? `\n\n多轮上下文：已读取最近 ${Math.min(history.length, 6)} 条历史消息，并用于问题改写与检索。`
    : "\n\n多轮上下文：当前是本轮会话的首个问题。";
  return [
    `问题重写：${rewrittenQuestion}`,
    "",
    base,
    historyNote,
    "",
    "RAG 流程：问题重写 -> Embedding 向量化 -> Top-K Retriever 召回 -> 引用重排 -> SSE 流式输出。",
  ].join("\n");
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function handleChatStream(req, res, url) {
  const db = readDb();
  const question = url.searchParams.get("question") || "";
  const conversationId = url.searchParams.get("conversationId") || createId("conv");
  const knowledgeBaseId = url.searchParams.get("knowledgeBaseId") || "all";
  const retrievalMode = url.searchParams.get("retrievalMode") || "hybrid";
  const topK = Number(url.searchParams.get("topK") || 4);
  if (!question.trim()) {
    json(res, 400, { error: "question is required" });
    return;
  }

  const startedAt = Date.now();
  const conversation = getConversation(db, conversationId);
  const history = conversation.messages.slice(-6);
  const rewrittenQuestion = rewriteQuestion(question, history);
  const references = searchKnowledgeBase(rewrittenQuestion, db.knowledgeBases, {
    knowledgeBaseId,
    mode: retrievalMode,
    topK,
  });
  const answer = buildAnswer(question, rewrittenQuestion, references, db, history);
  const userMessage = {
    id: createId("msg"),
    role: "user",
    content: question,
    rewrittenQuestion,
    createdAt: new Date().toISOString(),
  };
  const assistantMessage = {
    id: createId("msg"),
    role: "assistant",
    content: answer,
    references,
    createdAt: new Date().toISOString(),
  };

  res.writeHead(200, {
    "Content-Type": "text/event-stream;charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  sendSse(res, "rewrite", { rewrittenQuestion });
  sendSse(res, "references", { references });

  const chunks = answer.match(/[\s\S]{1,24}/g) || [];
  let index = 0;
  const timer = setInterval(() => {
    if (index < chunks.length) {
      sendSse(res, "message", { content: chunks[index] });
      index += 1;
      return;
    }
    clearInterval(timer);
    conversation.messages.push(userMessage, assistantMessage);
    if (conversation.title === "新对话" || conversation.title === "服务端 RAG 演示") {
      conversation.title = question.slice(0, 28);
    }
    conversation.updatedAt = new Date().toISOString();
    db.qaLogs.push({
      id: createId("log"),
      messageId: assistantMessage.id,
      conversationId: conversation.id,
      question,
      rewrittenQuestion,
      retrievalMode,
      referencesCount: references.length,
      latencyMs: Date.now() - startedAt,
      modelName: db.model.name,
      createdAt: new Date().toISOString(),
    });
    writeDb(db);
    sendSse(res, "done", {
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      latencyMs: Date.now() - startedAt,
    });
    res.end();
  }, 35);

  req.on("close", () => clearInterval(timer));
}

async function handleApi(req, res, url) {
  const db = readDb();
  if (req.method === "GET" && url.pathname === "/api/state") {
    json(res, 200, db);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/conversations") {
    json(res, 200, db.conversations);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/knowledge-bases") {
    json(res, 200, db.knowledgeBases);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/chat/stream") {
    await handleChatStream(req, res, url);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/search-test") {
    const body = await readBody(req);
    const results = searchKnowledgeBase(body.query, db.knowledgeBases, {
      knowledgeBaseId: body.knowledgeBaseId || "all",
      mode: body.retrievalMode || "hybrid",
      topK: body.topK || 5,
    });
    json(res, 200, { rewrittenQuestion: rewriteQuestion(body.query || "", []), results });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/knowledge-bases") {
    const body = await readBody(req);
    const kb = {
      id: createId("kb"),
      name: body.name || "未命名知识库",
      description: body.description || "暂无描述",
      documents: [],
      createdAt: new Date().toISOString(),
    };
    db.knowledgeBases.push(kb);
    writeDb(db);
    json(res, 201, kb);
    return;
  }
  json(res, 404, { error: "api not found" });
}

function serveStatic(req, res, url) {
  const urlPath = decodeURIComponent(url.pathname);
  const target = path.resolve(root, urlPath === "/" ? "index.html" : `.${urlPath}`);
  if (!target.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(target, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(target)] || "application/octet-stream",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

ensureDb();
server.listen(port, "127.0.0.1", () => {
  console.log(`RAG QA running at http://127.0.0.1:${port}`);
  console.log(`SSE chat endpoint: http://127.0.0.1:${port}/api/chat/stream`);
});
