const assert = require("node:assert/strict");
const { searchKnowledgeBase, tokenize, generateAnswer } = require("../app");

const knowledgeBases = [
  {
    id: "kb-1",
    name: "制度库",
    description: "测试知识库",
    documents: [
      {
        id: "doc-1",
        name: "报销制度.txt",
        content: "员工报销需要提交发票、审批单和费用说明。金额超过五千元需要部门负责人复核。",
      },
      {
        id: "doc-2",
        name: "接口说明.md",
        content: "问答 API 支持 conversationId、question、knowledgeBaseId 和 retrievalMode 参数。",
      },
    ],
  },
];

const tokens = tokenize("报销需要什么材料");
assert.ok(tokens.includes("报"));
assert.ok(tokens.includes("报销"));

const results = searchKnowledgeBase("报销需要什么材料", knowledgeBases, {
  knowledgeBaseId: "kb-1",
  mode: "hybrid",
  topK: 3,
});
assert.equal(results[0].documentName, "报销制度.txt");
assert.ok(results[0].score > 0);

const apiResults = searchKnowledgeBase("API 参数有哪些", knowledgeBases, {
  knowledgeBaseId: "kb-1",
  mode: "keyword",
  topK: 3,
});
assert.equal(apiResults[0].documentName, "接口说明.md");

const answer = generateAnswer("报销流程是什么？", results, {
  provider: "Demo",
  name: "demo-model",
});
assert.match(answer, /参考依据/);
assert.match(answer, /demo-model/);

console.log("RAG core tests passed");
