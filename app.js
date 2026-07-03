(function () {
  const STORAGE_KEY = "rag-qa-system-state";

  const defaultPrompt =
    "你是企业知识库智能问答助手。回答时优先依据检索到的知识片段，说明结论、步骤和依据；如果知识库不足，要明确说明不确定性。";

  const seedState = {
    activeConversationId: "conv-1",
    activePage: "chat",
    selectedKnowledgeBaseId: "all",
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
    qaLogs: [],
    modelConfigs: [
      { id: "openai", name: "OpenAI", apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", status: "不可用" },
      { id: "deepseek", name: "DeepSeek", apiKey: "已配置", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", status: "可用" },
      { id: "dashscope", name: "通义千问 (DashScope)", apiKey: "", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-max", status: "未测试" },
      { id: "ernie", name: "文心一言 (千帆)", apiKey: "", baseUrl: "https://qianfan.baidubce.com/v2", model: "ERNIE-4.0-8K", status: "未测试" },
    ],
    voiceConfigs: [
      { id: "baidu-asr", name: "百度智能云 ASR", appId: "7672537", apiKey: "已配置", secretKey: "已配置", sampleRate: "16000", status: "默认" },
      { id: "aliyun-asr", name: "阿里云语音识别", appId: "", apiKey: "", secretKey: "", sampleRate: "16000", status: "未配置" },
    ],
    users: [
      { id: "user-admin", username: "admin", email: "3123124@qq.com", role: "系统管理员", status: "正常" },
      { id: "user-test", username: "test3", email: "3123124@qq.com", role: "未分配", status: "受限" },
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
        qaLogs: parsed.qaLogs || [],
        modelConfigs: parsed.modelConfigs || clone(seedState).modelConfigs,
        voiceConfigs: parsed.voiceConfigs || clone(seedState).voiceConfigs,
        users: parsed.users || clone(seedState).users,
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
      chatPage: $("#chatPage"),
      consolePage: $("#consolePage"),
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
      qaLogList: $("#qaLogList"),
      navItems: document.querySelectorAll("[data-page]"),
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
      elements.kbSelect.value = state.selectedKnowledgeBaseId;
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
            <div class="conversation-item ${conversation.id === state.activeConversationId ? "active" : ""}">
              <button class="conversation-main" data-conversation-id="${conversation.id}" type="button">
                <strong>${escapeHtml(conversation.title)}</strong>
                <span>${conversation.messages.length ? escapeHtml(conversation.messages.at(-1).content) : "尚未开始提问"}</span>
              </button>
              <div class="conversation-actions">
                <button data-rename-conversation="${conversation.id}" type="button">重命名</button>
                <button data-delete-conversation="${conversation.id}" type="button">删除</button>
              </div>
            </div>
          `,
        )
        .join("");
    }

    function renderMessages() {
      const conversation = activeConversation();
      elements.conversationTitle.textContent = state.activePage === "chat" ? conversation.title : pageTitle(state.activePage);
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
          ${message.role === "assistant" ? renderFeedback(message) : ""}
        </article>
      `;
    }

    function renderFeedback(message) {
      const rating = message.feedback?.rating;
      return `
        <div class="message-actions">
          <button class="${rating === "like" ? "selected" : ""}" data-feedback="like" data-message-id="${message.id}" type="button">有帮助</button>
          <button class="${rating === "dislike" ? "selected" : ""}" data-feedback="dislike" data-message-id="${message.id}" type="button">需改进</button>
          <button data-copy-message="${message.id}" type="button">复制</button>
        </div>
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
                  <div class="card-actions">
                    <button data-delete-document="${doc.id}" data-kb-id="${selectedKb.id}" type="button">删除文档</button>
                  </div>
                </div>
              `,
            )
            .join("")
        : "";

      elements.providerSelect.value = state.model.provider;
      elements.modelNameInput.value = state.model.name;
      elements.promptInput.value = state.model.prompt;
      elements.qaLogList.innerHTML = state.qaLogs.length
        ? state.qaLogs
            .slice()
            .reverse()
            .map(
              (log) => `
                <div class="admin-card">
                  <strong>${escapeHtml(log.question)}</strong>
                  <span>模型：${escapeHtml(log.modelName)} · 模式：${escapeHtml(log.retrievalMode)} · 召回：${log.referencesCount} 条 · 耗时：${log.latencyMs}ms</span>
                  <span>反馈：${escapeHtml(log.feedback || "暂无")}</span>
                </div>
              `,
            )
            .join("")
        : `<div class="admin-card">暂无问答日志</div>`;
    }

    function render() {
      elements.body.classList.toggle("dark", state.darkMode);
      elements.chatPage.hidden = state.activePage !== "chat";
      elements.consolePage.hidden = state.activePage === "chat";
      elements.navItems.forEach((item) => item.classList.toggle("active", item.dataset.page === state.activePage));
      renderKnowledgeBaseOptions();
      renderConversations();
      renderMessages();
      renderAdmin();
      renderConsolePage();
    }

    function pageTitle(page) {
      return {
        chat: "问答对话",
        dashboard: "仪表盘统计",
        knowledge: "知识库管理",
        models: "模型管理",
        voice: "语音配置",
        permissions: "权限管理",
      }[page];
    }

    function renderConsolePage() {
      if (state.activePage === "chat") return;
      const renderers = {
        dashboard: renderDashboardPage,
        knowledge: renderKnowledgePage,
        models: renderModelsPage,
        voice: renderVoicePage,
        permissions: renderPermissionsPage,
      };
      elements.consolePage.innerHTML = renderers[state.activePage]();
    }

    function totalDocuments() {
      return state.knowledgeBases.reduce((sum, kb) => sum + kb.documents.length, 0);
    }

    function totalSizeText() {
      const bytes = state.knowledgeBases.reduce(
        (sum, kb) => sum + kb.documents.reduce((docSum, doc) => docSum + new Blob([doc.content]).size, 0),
        0,
      );
      return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    function renderDashboardPage() {
      const docs = totalDocuments();
      const success = Math.max(1, docs - 1);
      const failed = docs > 1 ? 1 : 0;
      const percent = Math.round((success / Math.max(docs, 1)) * 100);
      return `
        <div class="console-stack">
          <div class="stat-grid">
            ${renderStat("知识库总数", state.knowledgeBases.length, "folder")}
            ${renderStat("文档总数", docs, "file")}
            ${renderStat("总大小", totalSizeText(), "size")}
            ${renderStat("解析任务总数", docs + state.qaLogs.length, "task")}
          </div>
          <div class="dashboard-grid">
            <section class="console-card">
              <h3>文档解析情况</h3>
              <div class="parse-row">
                <div class="donut" style="--value:${percent}">${percent}%<span>成功率</span></div>
                <div class="parse-list">
                  <span><b class="ok-dot"></b>成功 ${success}</span>
                  <span><b class="fail-dot"></b>失败 ${failed}</span>
                  <span><b class="wait-dot"></b>处理中 0</span>
                </div>
              </div>
            </section>
            <section class="console-card">
              <h3>每日问答趋势（最近30天）</h3>
              <div class="trend-chart">
                <span style="height:32%">04-20</span>
                <span style="height:48%">04-23</span>
                <span style="height:76%">04-26</span>
                <span style="height:${Math.max(28, state.qaLogs.length * 18)}%">今日</span>
              </div>
            </section>
          </div>
          <section class="console-card">
            <h3>各知识库统计</h3>
            <div class="table-like">
              <div class="table-row table-head"><span>知识库</span><span>文档数</span><span>成功</span><span>失败</span><span>类型占比</span></div>
              ${state.knowledgeBases
                .map(
                  (kb) => `
                  <div class="table-row">
                    <span>${escapeHtml(kb.name)}</span>
                    <span>${kb.documents.length}</span>
                    <span>${Math.max(0, kb.documents.length - 1)}</span>
                    <span>${kb.documents.length ? 1 : 0}</span>
                    <span><div class="mini-bar"><i style="width:${Math.min(100, kb.documents.length * 18 + 20)}%"></i></div></span>
                  </div>
                `,
                )
                .join("")}
            </div>
          </section>
        </div>
      `;
    }

    function renderStat(label, value, type) {
      return `<article class="stat-card"><div class="stat-icon">${type.slice(0, 1).toUpperCase()}</div><strong>${value}</strong><span>${label}</span></article>`;
    }

    function renderKnowledgePage() {
      return `
        <div class="console-stack">
          <div class="console-toolbar">
            <button class="primary-action" data-console-action="new-kb" type="button">+ 新建知识库</button>
          </div>
          <div class="kb-card-grid">
            ${state.knowledgeBases
              .map(
                (kb) => `
                  <article class="kb-card">
                    <div class="kb-folder">□</div>
                    <span class="privacy-tag">私有</span>
                    <h3>${escapeHtml(kb.name)}</h3>
                    <p>${escapeHtml(kb.description || "暂无描述")}</p>
                    <div class="kb-meta"><span>${kb.documents.length} 个文档</span><span>${formatDate(kb.createdAt || new Date())}</span></div>
                    <div class="card-actions">
                      <button data-console-action="manage-kb" data-kb-id="${kb.id}" type="button">管理文档</button>
                      <button data-console-action="chat-kb" data-kb-id="${kb.id}" type="button">开始问答</button>
                    </div>
                  </article>
                `,
              )
              .join("")}
          </div>
        </div>
      `;
    }

    function renderModelsPage() {
      return `
        <div class="notice">页面配置优先级高于环境变量。保存配置后可点击测试连接验证模型是否可用。</div>
        <div class="provider-grid">
          ${state.modelConfigs.map(renderProviderCard).join("")}
        </div>
      `;
    }

    function renderProviderCard(provider) {
      const ok = provider.status === "可用";
      return `
        <section class="provider-card">
          <header><h3>${escapeHtml(provider.name)}</h3><span class="status-tag ${ok ? "ok" : ""}">${escapeHtml(provider.status)}</span></header>
          <label>API Key<input data-provider-field="apiKey" data-provider-id="${provider.id}" value="${escapeHtml(provider.apiKey)}" placeholder="请输入 API Key" /></label>
          <label>Base URL<input data-provider-field="baseUrl" data-provider-id="${provider.id}" value="${escapeHtml(provider.baseUrl)}" /></label>
          <label>默认模型<input data-provider-field="model" data-provider-id="${provider.id}" value="${escapeHtml(provider.model)}" /></label>
          <div class="card-actions">
            <button data-console-action="save-provider" data-provider-id="${provider.id}" type="button">保存</button>
            <button data-console-action="test-provider" data-provider-id="${provider.id}" type="button">测试连接</button>
            <button data-console-action="use-provider" data-provider-id="${provider.id}" type="button">设为默认</button>
          </div>
        </section>
      `;
    }

    function renderVoicePage() {
      return `
        <div class="notice">支持 mp3、wav、m4a、aac、ogg、flac、pcm 等常见音频格式。</div>
        <div class="provider-grid">
          ${state.voiceConfigs
            .map(
              (provider) => `
                <section class="provider-card">
                  <header><h3>${escapeHtml(provider.name)}</h3><span class="status-tag ${provider.status === "默认" ? "ok" : ""}">${escapeHtml(provider.status)}</span></header>
                  <label>App ID<input data-voice-field="appId" data-voice-id="${provider.id}" value="${escapeHtml(provider.appId)}" placeholder="请输入 App ID" /></label>
                  <label>API Key<input data-voice-field="apiKey" data-voice-id="${provider.id}" value="${escapeHtml(provider.apiKey)}" placeholder="请输入 API Key" /></label>
                  <label>Secret Key<input data-voice-field="secretKey" data-voice-id="${provider.id}" value="${escapeHtml(provider.secretKey)}" placeholder="请输入 Secret Key" /></label>
                  <label>音频采样率<input data-voice-field="sampleRate" data-voice-id="${provider.id}" value="${escapeHtml(provider.sampleRate)}" /></label>
                  <div class="card-actions">
                    <button data-console-action="save-voice" data-voice-id="${provider.id}" type="button">保存</button>
                    <button data-console-action="default-voice" data-voice-id="${provider.id}" type="button">设为默认</button>
                    <button data-console-action="clear-voice" data-voice-id="${provider.id}" type="button">清除配置</button>
                  </div>
                </section>
              `,
            )
            .join("")}
        </div>
      `;
    }

    function renderPermissionsPage() {
      return `
        <div class="console-stack">
          <section class="no-role-card">
            <div class="check-circle">✓</div>
            <h3>欢迎访问 RAG 智能问答系统</h3>
            <p>未分配角色的用户将无法使用系统功能，管理员可在此刷新或分配权限。</p>
          </section>
          <section class="console-card">
            <h3>用户权限</h3>
            <div class="table-like">
              <div class="table-row table-head"><span>账号</span><span>邮箱</span><span>角色</span><span>状态</span><span>操作</span></div>
              ${state.users
                .map(
                  (user) => `
                  <div class="table-row">
                    <span>${escapeHtml(user.username)}</span>
                    <span>${escapeHtml(user.email)}</span>
                    <span>${escapeHtml(user.role)}</span>
                    <span>${escapeHtml(user.status)}</span>
                    <span><button data-console-action="toggle-role" data-user-id="${user.id}" type="button">切换角色</button></span>
                  </div>
                `,
                )
                .join("")}
            </div>
          </section>
        </div>
      `;
    }

    function sendQuestion() {
      const question = elements.questionInput.value.trim();
      if (!question) return;
      const conversation = activeConversation();
      const now = new Date().toISOString();
      const startedAt = performance.now();
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
        const assistantMessageId = createId("msg");
        conversation.messages.push({
          id: assistantMessageId,
          role: "assistant",
          content: answer,
          references,
          createdAt: new Date().toISOString(),
        });
        state.qaLogs.push({
          id: createId("log"),
          messageId: assistantMessageId,
          conversationId: conversation.id,
          question,
          modelName: state.model.name,
          retrievalMode: elements.retrievalMode.value,
          referencesCount: references.length,
          latencyMs: Math.round(performance.now() - startedAt),
          feedback: "",
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
      state.activePage = "chat";
      persistAndRender();
    }

    function renameConversation(conversationId) {
      const conversation = state.conversations.find((item) => item.id === conversationId);
      if (!conversation) return;
      const title = window.prompt("请输入新的会话标题", conversation.title);
      if (!title || !title.trim()) return;
      conversation.title = title.trim().slice(0, 40);
      conversation.updatedAt = new Date().toISOString();
      persistAndRender();
    }

    function deleteConversation(conversationId) {
      if (state.conversations.length <= 1) {
        toast("至少保留一个会话");
        return;
      }
      if (!window.confirm("确定删除这个会话吗？")) return;
      const index = state.conversations.findIndex((item) => item.id === conversationId);
      if (index < 0) return;
      state.conversations.splice(index, 1);
      if (state.activeConversationId === conversationId) {
        state.activeConversationId = state.conversations[0].id;
      }
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

    function deleteDocument(knowledgeBaseId, documentId) {
      const kb = state.knowledgeBases.find((item) => item.id === knowledgeBaseId);
      if (!kb) return;
      if (!window.confirm("确定删除这个文档吗？")) return;
      kb.documents = kb.documents.filter((doc) => doc.id !== documentId);
      persistAndRender();
      toast("文档已删除");
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

    function setFeedback(messageId, rating) {
      for (const conversation of state.conversations) {
        const message = conversation.messages.find((item) => item.id === messageId);
        if (message) {
          message.feedback = {
            rating,
            createdAt: new Date().toISOString(),
          };
          const log = state.qaLogs.find((item) => item.messageId === messageId);
          if (log) {
            log.feedback = rating === "like" ? "有帮助" : "需改进";
          }
          persistAndRender();
          toast("反馈已记录");
          return;
        }
      }
    }

    async function copyMessage(messageId) {
      const message = state.conversations.flatMap((item) => item.messages).find((item) => item.id === messageId);
      if (!message) return;
      try {
        await navigator.clipboard.writeText(message.content);
        toast("答案已复制");
      } catch (error) {
        toast("当前浏览器不支持自动复制");
      }
    }

    function switchPage(page) {
      state.activePage = page;
      persistAndRender();
    }

    function handleConsoleAction(event) {
      const button = event.target.closest("[data-console-action]");
      if (!button) return;
      const action = button.dataset.consoleAction;
      if (action === "new-kb") {
        elements.adminDialog.showModal();
        elements.kbNameInput.focus();
        return;
      }
      if (action === "manage-kb") {
        state.activePage = "chat";
        elements.uploadKbSelect.value = button.dataset.kbId;
        elements.adminDialog.showModal();
        persistAndRender();
        return;
      }
      if (action === "chat-kb") {
        state.activePage = "chat";
        state.selectedKnowledgeBaseId = button.dataset.kbId;
        persistAndRender();
        toast("已切换到该知识库问答");
        return;
      }
      if (["save-provider", "test-provider", "use-provider"].includes(action)) {
        updateProviderConfig(button.dataset.providerId, action);
        return;
      }
      if (["save-voice", "default-voice", "clear-voice"].includes(action)) {
        updateVoiceConfig(button.dataset.voiceId, action);
        return;
      }
      if (action === "toggle-role") {
        toggleUserRole(button.dataset.userId);
      }
    }

    function updateProviderConfig(providerId, action) {
      const provider = state.modelConfigs.find((item) => item.id === providerId);
      if (!provider) return;
      document.querySelectorAll(`[data-provider-id="${providerId}"]`).forEach((input) => {
        if (input.dataset.providerField) {
          provider[input.dataset.providerField] = input.value.trim();
        }
      });
      if (action === "test-provider") {
        provider.status = provider.apiKey || provider.id === "deepseek" ? "可用" : "不可用";
        toast(provider.status === "可用" ? "连接成功，共 2 个可用模型" : "Request timed out");
      }
      if (action === "use-provider") {
        state.model.provider = provider.name;
        state.model.name = provider.model;
        provider.status = "可用";
        toast("已设为默认模型");
      }
      if (action === "save-provider") {
        toast("模型配置已保存");
      }
      persistAndRender();
    }

    function updateVoiceConfig(voiceId, action) {
      const provider = state.voiceConfigs.find((item) => item.id === voiceId);
      if (!provider) return;
      document.querySelectorAll(`[data-voice-id="${voiceId}"]`).forEach((input) => {
        if (input.dataset.voiceField) {
          provider[input.dataset.voiceField] = input.value.trim();
        }
      });
      if (action === "clear-voice") {
        provider.appId = "";
        provider.apiKey = "";
        provider.secretKey = "";
        provider.status = "未配置";
        toast("语音配置已清除");
      } else if (action === "default-voice") {
        state.voiceConfigs.forEach((item) => {
          item.status = item.id === voiceId ? "默认" : item.apiKey ? "已配置" : "未配置";
        });
        toast("已设为默认语音识别 Provider");
      } else {
        provider.status = provider.apiKey ? "已配置" : "未配置";
        toast("语音配置已保存");
      }
      persistAndRender();
    }

    function toggleUserRole(userId) {
      const user = state.users.find((item) => item.id === userId);
      if (!user) return;
      if (user.role === "系统管理员") {
        user.role = "普通用户";
        user.status = "正常";
      } else if (user.role === "普通用户") {
        user.role = "未分配";
        user.status = "受限";
      } else {
        user.role = "系统管理员";
        user.status = "正常";
      }
      persistAndRender();
      toast("权限已更新");
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
    elements.navItems.forEach((item) => {
      item.addEventListener("click", () => switchPage(item.dataset.page));
    });
    elements.consolePage.addEventListener("click", handleConsoleAction);
    elements.searchInput.addEventListener("input", renderConversations);
    elements.kbSelect.addEventListener("change", () => {
      state.selectedKnowledgeBaseId = elements.kbSelect.value;
      saveState(state);
    });
    elements.uploadKbSelect.addEventListener("change", renderAdmin);
    elements.conversationList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-conversation-id]");
      const renameButton = event.target.closest("[data-rename-conversation]");
      const deleteButton = event.target.closest("[data-delete-conversation]");
      if (renameButton) {
        renameConversation(renameButton.dataset.renameConversation);
        return;
      }
      if (deleteButton) {
        deleteConversation(deleteButton.dataset.deleteConversation);
        return;
      }
      if (button) {
        state.activeConversationId = button.dataset.conversationId;
        persistAndRender();
      }
    });
    elements.messages.addEventListener("click", (event) => {
      const feedbackButton = event.target.closest("[data-feedback]");
      const copyButton = event.target.closest("[data-copy-message]");
      if (feedbackButton) {
        setFeedback(feedbackButton.dataset.messageId, feedbackButton.dataset.feedback);
      }
      if (copyButton) {
        copyMessage(copyButton.dataset.copyMessage);
      }
    });
    elements.docAdminList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-document]");
      if (!button) return;
      deleteDocument(button.dataset.kbId, button.dataset.deleteDocument);
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

  function formatDate(value) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
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
