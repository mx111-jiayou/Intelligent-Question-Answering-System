(function () {
  const STORAGE_KEY = "rag-qa-system-state";

  const defaultPrompt =
    "你是企业知识库智能问答助手。回答时优先依据检索到的知识片段，说明结论、步骤和依据；如果知识库不足，要明确说明不确定性。";

  const seedState = {
    activeConversationId: "conv-1",
    darkMode: false,
    model: {
      provider: "OpenAI Compatible",
      name: "demo-rag-model",
      prompt: defaultPrompt,
    },
    knowledgeBases: [
      {
        id: "kb-default",
        name: "示例知识库",
        description: "内置制度、产品和系统说明示例，可在管理后台继续添加文档。",
        documents: [
          {
            id: "doc-rag",
            name: "RAG 智能问答系统说明.md",
            content:
              "RAG 智能问答系统通过问题预处理、关键词检索、向量语义检索、召回重排和大语言模型生成答案。系统应展示引用来源、文档名称、片段内容和检索分数。管理员可以上传文档、管理知识库、配置模型、查看问答日志和用户反馈。",
          },
          {
            id: "doc-policy",
            name: "企业报销制度.txt",
            content:
              "员工报销需要提交发票、审批单和费用说明。普通报销由直属主管审批，金额超过五千元需要部门负责人复核。差旅报销应在行程结束后十五个工作日内提交，逾期需要补充说明。",
          },
          {
            id: "doc-product",
            name: "业务系统接入指南.md",
            content:
              "智能问答系统支持通过 API 接入业务系统。调用方需要申请 API Key，提交 conversationId、question、knowledgeBaseId 和 retrievalMode。系统可以通过 SSE 返回流式答案，并在回答完成后返回 messageId 和引用来源。",
          },
        ],
      },
    ],
    conversations: [
      {
        id: "conv-1",
        title: "新对话",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      },
    ],
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    const normalized = normalizeText(text);
    const asciiTokens = normalized.match(/[a-z0-9]+/g) || [];
    const cjkTokens = [];
    const compact = normalized.replace(/\s+/g, "");
    for (let i = 0; i < compact.length; i += 1) {
      const char = compact[i];
      if (/[\u4e00-\u9fa5]/.test(char)) {
        cjkTokens.push(char);
        if (i < compact.length - 1) {
          const next = compact[i + 1];
          if (/[\u4e00-\u9fa5]/.test(next)) {
            cjkTokens.push(`${char}${next}`);
          }
        }
      }
    }
    return [...new Set([...asciiTokens, ...cjkTokens])];
  }

  function chunkDocument(document, knowledgeBase) {
    const clean = String(document.content || "").replace(/\s+/g, " ").trim();
    const chunks = [];
    const size = 150;
    const overlap = 35;
    for (let start = 0; start < clean.length; start += size - overlap) {
      const content = clean.slice(start, start + size).trim();
      if (content.length >= 12) {
        chunks.push({
          id: `${document.id}-${chunks.length + 1}`,
          documentId: document.id,
          documentName: document.name,
          knowledgeBaseId: knowledgeBase.id,
          knowledgeBaseName: knowledgeBase.name,
          content,
          tokens: tokenize(content),
        });
      }
    }
    return chunks;
  }

  function buildChunks(knowledgeBases, selectedKnowledgeBaseId) {
    return knowledgeBases
      .filter((kb) => selectedKnowledgeBaseId === "all" || kb.id === selectedKnowledgeBaseId)
      .flatMap((kb) => kb.documents.flatMap((doc) => chunkDocument(doc, kb)));
  }

  function jaccardScore(queryTokens, chunkTokens) {
    if (!queryTokens.length || !chunkTokens.length) return 0;
    const chunkSet = new Set(chunkTokens);
    const intersection = queryTokens.filter((token) => chunkSet.has(token)).length;
    const union = new Set([...queryTokens, ...chunkTokens]).size;
    return intersection / union;
  }

  function keywordScore(query, content) {
    const normalizedQuery = normalizeText(query);
    const normalizedContent = normalizeText(content);
    if (!normalizedQuery || !normalizedContent) return 0;
    const queryTokens = tokenize(query);
    const hits = queryTokens.filter((token) => normalizedContent.includes(token)).length;
    const direct = normalizedContent.includes(normalizedQuery) ? 1 : 0;
    return Math.min(1, hits / Math.max(queryTokens.length, 1) + direct * 0.25);
  }

  function searchKnowledgeBase(query, knowledgeBases, options = {}) {
    const mode = options.mode || "hybrid";
    const topK = Number(options.topK || 4);
    const selectedKnowledgeBaseId = options.knowledgeBaseId || "all";
    const queryTokens = tokenize(query);
    return buildChunks(knowledgeBases, selectedKnowledgeBaseId)
      .map((chunk) => {
        const semantic = jaccardScore(queryTokens, chunk.tokens);
        const keyword = keywordScore(query, chunk.content);
        const hybrid = semantic * 0.55 + keyword * 0.45;
        const score = mode === "vector" ? semantic : mode === "keyword" ? keyword : hybrid;
        return { ...chunk, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  function generateAnswer(question, references, model) {
    if (!references.length) {
      return [
        `我没有在当前知识库中检索到与“${question}”高度相关的内容。`,
        "建议补充相关文档，或在管理后台运行检索测试确认知识库是否已完成入库。",
      ].join("\n\n");
    }

    const topic = question.replace(/[?？。！!]/g, "").trim();
    const evidence = references
      .slice(0, 3)
      .map((item, index) => `${index + 1}. ${item.content}`)
      .join("\n");

    return [
      `根据当前知识库，关于“${topic}”可以这样处理：`,
      "",
      "核心结论：",
      summarizeByTokens(question, references),
      "",
      "执行建议：",
      "- 优先采用检索分数最高的片段作为回答依据。",
      "- 对制度、流程、接口类问题，应同时返回步骤、限制条件和引用来源。",
      "- 如果需要上线，应接入真实 Embedding、重排模型和 SSE 流式接口。",
      "",
      "参考依据：",
      evidence,
      "",
      `当前模型配置：${model.provider} / ${model.name}`,
    ].join("\n");
  }

  function summarizeByTokens(question, references) {
    const tokens = tokenize(question);
    const joined = references.map((item) => item.content).join(" ");
    const sentences = joined
      .split(/[。！？.!?]/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const ranked = sentences
      .map((sentence) => ({
        sentence,
        score: tokens.reduce((sum, token) => sum + (sentence.includes(token) ? 1 : 0), 0),
      }))
      .sort((a, b) => b.score - a.score);
    const selected = ranked.slice(0, 2).map((item) => item.sentence);
    return selected.length ? selected.join("；") + "。" : references[0].content;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(seedState);
      const parsed = JSON.parse(raw);
      return {
        ...clone(seedState),
        ...parsed,
        model: { ...clone(seedState).model, ...(parsed.model || {}) },
      };
    } catch (error) {
      console.warn("Failed to load state", error);
      return clone(seedState);
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function initApp() {
    const state = loadState();
    const $ = (selector) => document.querySelector(selector);
    const elements = {
      body: document.body,
      hero: $("#hero"),
      messages: $("#messages"),
      conversationList: $("#conversationList"),
      conversationTitle: $("#conversationTitle"),
      searchInput: $("#searchInput"),
      questionInput: $("#questionInput"),
      sendBtn: $("#sendBtn"),
      statusText: $("#statusText"),
      kbSelect: $("#kbSelect"),
      retrievalMode: $("#retrievalMode"),
      topKInput: $("#topKInput"),
      adminDialog: $("#adminDialog"),
      kbAdminList: $("#kbAdminList"),
      docAdminList: $("#docAdminList"),
      uploadKbSelect: $("#uploadKbSelect"),
      kbNameInput: $("#kbNameInput"),
      kbDescInput: $("#kbDescInput"),
      documentName: $("#documentName"),
      documentText: $("#documentText"),
      searchTestInput: $("#searchTestInput"),
      searchResults: $("#searchResults"),
      providerSelect: $("#providerSelect"),
      modelNameInput: $("#modelNameInput"),
      promptInput: $("#promptInput"),
    };

    function activeConversation() {
      return state.conversations.find((item) => item.id === state.activeConversationId);
    }

    function persistAndRender() {
      saveState(state);
      render();
    }

    function toast(message) {
      const node = document.createElement("div");
      node.className = "toast";
      node.textContent = message;
      document.body.appendChild(node);
      window.setTimeout(() => node.remove(), 2200);
    }

    function renderKnowledgeBaseOptions() {
      const options = [
        `<option value="all">全部知识库</option>`,
        ...state.knowledgeBases.map((kb) => `<option value="${kb.id}">${escapeHtml(kb.name)}</option>`),
      ].join("");
      elements.kbSelect.innerHTML = options;
      elements.uploadKbSelect.innerHTML = state.knowledgeBases
        .map((kb) => `<option value="${kb.id}">${escapeHtml(kb.name)}</option>`)
        .join("");
    }

    function renderConversations() {
      const keyword = normalizeText(elements.searchInput.value);
      const items = state.conversations
        .filter((conversation) => {
          const haystack = normalizeText(
            `${conversation.title} ${conversation.messages.map((message) => message.content).join(" ")}`,
          );
          return !keyword || haystack.includes(keyword);
        })
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      elements.conversationList.innerHTML = items
        .map(
          (conversation) => `
            <button class="conversation-item ${conversation.id === state.activeConversationId ? "active" : ""}" data-conversation-id="${conversation.id}" type="button">
              <strong>${escapeHtml(conversation.title)}</strong>
              <span>${conversation.messages.length ? escapeHtml(conversation.messages.at(-1).content) : "尚未开始提问"}</span>
            </button>
          `,
        )
        .join("");
    }

    function renderMessages() {
      const conversation = activeConversation();
      elements.conversationTitle.textContent = conversation.title;
      elements.hero.classList.toggle("hidden", conversation.messages.length > 0);
      elements.messages.innerHTML = conversation.messages.map(renderMessage).join("");
    }

    function renderMessage(message) {
      const references = message.references?.length
        ? `
          <div class="references">
            <strong>参考来源</strong>
            ${message.references
              .map(
                (item) => `
                <div class="reference">
                  <strong>${escapeHtml(item.documentName)} · ${Math.round(item.score * 100)}%</strong>
                  ${escapeHtml(item.content)}
                </div>
              `,
              )
              .join("")}
          </div>
        `
        : "";

      return `
        <article class="message ${message.role}">
          <div class="message-meta">
            <span>${message.role === "user" ? "你" : "AI 助手"}</span>
            <span>${formatTime(message.createdAt)}</span>
          </div>
          <div class="message-content">${escapeHtml(message.content)}</div>
          ${references}
        </article>
      `;
    }

    function renderAdmin() {
      elements.kbAdminList.innerHTML = state.knowledgeBases
        .map(
          (kb) => `
            <div class="admin-card">
              <strong>${escapeHtml(kb.name)}</strong>
              <span>${escapeHtml(kb.description)}</span>
              <div><span class="pill">${kb.documents.length} 个文档</span></div>
            </div>
          `,
        )
        .join("");

      const selectedKb = state.knowledgeBases.find((kb) => kb.id === elements.uploadKbSelect.value) || state.knowledgeBases[0];
      elements.docAdminList.innerHTML = selectedKb
        ? selectedKb.documents
            .map(
              (doc) => `
                <div class="admin-card">
                  <strong>${escapeHtml(doc.name)}</strong>
                  <span>${escapeHtml(doc.content.slice(0, 88))}${doc.content.length > 88 ? "..." : ""}</span>
                </div>
              `,
            )
            .join("")
        : "";

      elements.providerSelect.value = state.model.provider;
      elements.modelNameInput.value = state.model.name;
      elements.promptInput.value = state.model.prompt;
    }

    function render() {
      elements.body.classList.toggle("dark", state.darkMode);
      renderKnowledgeBaseOptions();
      renderConversations();
      renderMessages();
      renderAdmin();
    }

    function sendQuestion() {
      const question = elements.questionInput.value.trim();
      if (!question) return;
      const conversation = activeConversation();
      const now = new Date().toISOString();
      const references = searchKnowledgeBase(question, state.knowledgeBases, {
        knowledgeBaseId: elements.kbSelect.value,
        mode: elements.retrievalMode.value,
        topK: elements.topKInput.value,
      });

      conversation.messages.push({
        id: createId("msg"),
        role: "user",
        content: question,
        createdAt: now,
      });

      if (conversation.title === "新对话") {
        conversation.title = question.slice(0, 24);
      }
      conversation.updatedAt = now;
      elements.questionInput.value = "";
      elements.sendBtn.disabled = true;
      elements.statusText.textContent = "正在检索知识库...";
      persistAndRender();

      window.setTimeout(() => {
        const answer = generateAnswer(question, references, state.model);
        conversation.messages.push({
          id: createId("msg"),
          role: "assistant",
          content: answer,
          references,
          createdAt: new Date().toISOString(),
        });
        conversation.updatedAt = new Date().toISOString();
        elements.sendBtn.disabled = false;
        elements.statusText.textContent = `已召回 ${references.length} 条知识片段`;
        persistAndRender();
      }, 520);
    }

    function createConversation() {
      const conversation = {
        id: createId("conv"),
        title: "新对话",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      state.conversations.unshift(conversation);
      state.activeConversationId = conversation.id;
      persistAndRender();
    }

    function addKnowledgeBase() {
      const name = elements.kbNameInput.value.trim();
      if (!name) {
        toast("请输入知识库名称");
        return;
      }
      state.knowledgeBases.push({
        id: createId("kb"),
        name,
        description: elements.kbDescInput.value.trim() || "未填写描述",
        documents: [],
      });
      elements.kbNameInput.value = "";
      elements.kbDescInput.value = "";
      persistAndRender();
      toast("知识库已创建");
    }

    function addDocument() {
      const kb = state.knowledgeBases.find((item) => item.id === elements.uploadKbSelect.value);
      const content = elements.documentText.value.trim();
      if (!kb || !content) {
        toast("请选择知识库并填写文档内容");
        return;
      }
      kb.documents.push({
        id: createId("doc"),
        name: elements.documentName.value.trim() || `未命名文档-${kb.documents.length + 1}`,
        content,
      });
      elements.documentName.value = "";
      elements.documentText.value = "";
      persistAndRender();
      toast("文档已入库");
    }

    function runSearchTest() {
      const query = elements.searchTestInput.value.trim();
      if (!query) return;
      const results = searchKnowledgeBase(query, state.knowledgeBases, {
        knowledgeBaseId: elements.uploadKbSelect.value,
        mode: elements.retrievalMode.value,
        topK: 5,
      });
      elements.searchResults.innerHTML = results.length
        ? results
            .map(
              (item) => `
                <div class="result-card">
                  <strong>${escapeHtml(item.documentName)} · ${Math.round(item.score * 100)}%</strong>
                  ${escapeHtml(item.content)}
                </div>
              `,
            )
            .join("")
        : `<div class="result-card">未检索到相关片段</div>`;
    }

    function saveModelConfig() {
      state.model = {
        provider: elements.providerSelect.value,
        name: elements.modelNameInput.value.trim() || "demo-rag-model",
        prompt: elements.promptInput.value.trim() || defaultPrompt,
      };
      persistAndRender();
      toast("模型配置已保存");
    }

    function exportConversation() {
      const conversation = activeConversation();
      const content = conversation.messages
        .map((message) => `## ${message.role === "user" ? "用户" : "AI 助手"}\n\n${message.content}`)
        .join("\n\n");
      const blob = new Blob([`# ${conversation.title}\n\n${content}`], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${conversation.title || "conversation"}.md`;
      link.click();
      URL.revokeObjectURL(url);
    }

    document.querySelector("#newChatBtn").addEventListener("click", createConversation);
    document.querySelector("#adminBtn").addEventListener("click", () => elements.adminDialog.showModal());
    document.querySelector("#sendBtn").addEventListener("click", sendQuestion);
    document.querySelector("#addKbBtn").addEventListener("click", addKnowledgeBase);
    document.querySelector("#addDocBtn").addEventListener("click", addDocument);
    document.querySelector("#searchTestBtn").addEventListener("click", runSearchTest);
    document.querySelector("#saveModelBtn").addEventListener("click", saveModelConfig);
    document.querySelector("#exportBtn").addEventListener("click", exportConversation);
    document.querySelector("#themeBtn").addEventListener("click", () => {
      state.darkMode = !state.darkMode;
      persistAndRender();
    });
    elements.searchInput.addEventListener("input", renderConversations);
    elements.uploadKbSelect.addEventListener("change", renderAdmin);
    elements.conversationList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-conversation-id]");
      if (!button) return;
      state.activeConversationId = button.dataset.conversationId;
      persistAndRender();
    });
    elements.questionInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendQuestion();
      }
    });

    render();
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const api = {
    tokenize,
    chunkDocument,
    searchKnowledgeBase,
    generateAnswer,
    normalizeText,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (typeof window !== "undefined") {
    window.RagQa = api;
    window.addEventListener("DOMContentLoaded", initApp);
  }
})();
