# StayWise 知识库（RAG 原始文档）

本目录是客服 RAG 的**未切片语料**。Markdown 与 Docx **主题不重复**，后续会按文件类型分别解析再切块、写入 pgvector。

## 目录

- `markdown/`：政策、四店档案、FAQ、会员、客服情景（超售、品质投诉、账号、代订、比价、紧急升级等）
- `docx/`：改期、发票、支付、宠物、餐饮、安全、商务、接送停车、升房、防诈骗、签证函等（`generate_docx.py`）

## 重新生成 Docx

```bash
cd knowledge
PYTHONPATH=.pylib python3 generate_docx.py
```

## 评测

```bash
# heading 切块的 labeled 检索（Hit@10 / MRR）
npm run knowledge:eval

# RAGAS：Recall@3、幻觉率（1-Faithfulness）、回答准确率（AnswerCorrectness）
# 需要本地 Ollama：bge-m3 + qwen2.5:7b（CHAT_MODEL）
python3 -m venv knowledge/.eval-venv
knowledge/.eval-venv/bin/pip install -r knowledge/eval/requirements.txt
ollama pull qwen2.5:7b
# 默认只用 bge-m3，不加载 7B 裁判（安静）。
taskpolicy -b knowledge/.eval-venv/bin/python knowledge/eval/ragas_eval.py --strategy heading
# 需要原版 RAGAS+7B 时再加：--judge ragas
```
