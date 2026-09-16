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

## 下一步（尚未做）

解析 → 切片 → embedding → 写入 PostgreSQL `pgvector` → 客服检索。
