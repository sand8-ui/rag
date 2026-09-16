#!/usr/bin/env python3
"""RAGAS eval for StayWise: labeled Recall@3, hallucination rate, answer accuracy."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ENV = ROOT / "backend" / ".env"
DEFAULT_GOLDEN = Path(__file__).with_name("golden.json")
DEFAULT_OUT = Path(__file__).with_name("last-ragas-report.json")
STRATEGIES = ("heading",)
RECALL_K = 3
DEFAULT_PAUSE_SECONDS = 0.4
DEFAULT_NUM_THREAD = 2
DEFAULT_NUM_CTX = 4096
DEFAULT_MAX_WORKERS = 1
DEFAULT_JUDGE = "embed"
GRAM_N = 8
CONCAT_EMBED_CHARS = 6000

SYSTEM_PROMPT = (
    "你是 StayWise 酒店预订客服。只根据用户消息里的检索片段回答。"
    "片段没有写到的数字、承诺、接口能力不要编造。"
    "资料不足时明确说资料不足，并建议用户在「我的订单」操作或转人工。"
    "演示环境没有真实支付网关、积分账户、开票接口、改姓名接口、酒店 PMS 推送。"
    "不要把检索片段里的示例订单、示例日期、示例房价当成当前用户的真实订单；"
    "用户没给订单号时只讲规则，不要套用文档举例中的具体日期或房价。"
    "用简洁中文，先给结论再补条件。"
)


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def apply_env() -> dict[str, str]:
    file_env = load_env(BACKEND_ENV)
    merged = {**file_env, **os.environ}
    for key, value in file_env.items():
        os.environ.setdefault(key, value)
    os.environ.setdefault("OLLAMA_NUM_PARALLEL", "1")
    os.environ.setdefault("OLLAMA_MAX_LOADED_MODELS", "1")
    return merged


def lower_process_priority() -> None:
    try:
        os.nice(15)
    except OSError:
        pass


def psycopg_url(raw: str) -> str:
    parsed = urlparse(raw)
    query = parse_qs(parsed.query)
    query.pop("schema", None)
    flat = {key: values[0] for key, values in query.items()}
    return urlunparse(parsed._replace(query=urlencode(flat)))


def ollama_base(env: dict[str, str]) -> str:
    raw = env.get("EMBEDDING_BASE_URL", "http://localhost:11434/v1").rstrip("/")
    if raw.endswith("/v1"):
        return raw[: -len("/v1")]
    return raw


def embed_query(base: str, model: str, text: str, dimensions: int) -> list[float]:
    import httpx

    response = httpx.post(
        f"{base}/v1/embeddings",
        json={"model": model, "input": [text]},
        timeout=120.0,
    )
    response.raise_for_status()
    vector = response.json()["data"][0]["embedding"]
    if len(vector) != dimensions:
        raise RuntimeError(f"expected {dimensions}-d embedding, got {len(vector)}")
    return vector


def to_vector_literal(values: list[float]) -> str:
    return "[" + ",".join(str(value) for value in values) + "]"


class Db:
    def __init__(self, url: str):
        import psycopg
        from psycopg.rows import dict_row

        self._psycopg = psycopg
        self._dict_row = dict_row
        self.url = url
        self.conn = None
        self.connect()

    def connect(self) -> None:
        if self.conn is not None and not self.conn.closed:
            try:
                self.conn.close()
            except Exception:
                pass
        self.conn = self._psycopg.connect(
            self.url,
            row_factory=self._dict_row,
            autocommit=True,
        )

    def execute(self, sql: str, params: tuple[Any, ...]):
        last_error: Exception | None = None
        for attempt in range(5):
            try:
                if self.conn is None or self.conn.closed:
                    self.connect()
                return self.conn.execute(sql, params)
            except self._psycopg.OperationalError as exc:
                last_error = exc
                print(f"  db reconnect after: {exc}", flush=True)
                time.sleep(min(8, 2**attempt))
                try:
                    self.connect()
                except Exception as connect_error:
                    last_error = connect_error
        raise last_error or RuntimeError("database reconnect failed")

    def close(self) -> None:
        if self.conn is not None and not self.conn.closed:
            self.conn.close()


def retrieve(
    db: Db,
    query_vector: list[float],
    strategy: str,
    k: int,
) -> list[dict[str, Any]]:
    literal = to_vector_literal(query_vector)
    rows = db.execute(
        """
        SELECT
          c.id,
          d."sourcePath" AS source_path,
          d.title AS document_title,
          c."sectionTitle" AS section_title,
          c.content,
          p.content AS parent_content,
          (1 - (c.embedding <=> %s::vector))::float8 AS score
        FROM "KnowledgeChunk" c
        JOIN "KnowledgeDocument" d ON d.id = c."documentId"
        LEFT JOIN "KnowledgeChunk" p ON p.id = c."parentChunkId"
        WHERE c.strategy = %s::"ChunkStrategy"
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> %s::vector
        LIMIT %s
        """,
        (literal, strategy, literal, k),
    ).fetchall()
    hits = []
    for row in rows:
        content = row["parent_content"] or row["content"]
        hits.append(
            {
                "id": row["id"],
                "sourcePath": row["source_path"],
                "sectionTitle": row["section_title"],
                "content": content,
                "score": float(row["score"]),
            }
        )
    return hits


def gold_key(source_path: str, section_title: str | None) -> str:
    return f"{source_path}::{section_title or ''}"


def score_recall_at_k(item: dict[str, Any], hits: list[dict[str, Any]]) -> dict[str, Any]:
    gold = {
        gold_key(passage["sourcePath"], passage["sectionTitle"])
        for passage in item["relevant"]
    }
    found: set[str] = set()
    rank = None
    dcg = 0.0
    for index, hit in enumerate(hits):
        key = gold_key(hit["sourcePath"], hit["sectionTitle"])
        relevant = key in gold
        if relevant:
            found.add(key)
            if rank is None:
                rank = index + 1
        dcg += (1.0 if relevant else 0.0) / math.log2(index + 2)
    ideal = min(len(gold), len(hits))
    idcg = sum(1.0 / math.log2(index + 2) for index in range(ideal))
    return {
        "id": item["id"],
        "hit": rank is not None,
        "rank": rank,
        "goldRecall": 0.0 if not gold else len(found) / len(gold),
        "precision": (len(found) / len(hits)) if hits else 0.0,
        "mrr": 0.0 if rank is None else 1.0 / rank,
        "ndcg": 0.0 if idcg == 0 else dcg / idcg,
        "retrievedChars": sum(len(hit["content"]) for hit in hits),
        "found": sorted(found),
    }


def generate_answer(chat, query: str, hits: list[dict[str, Any]]) -> str:
    blocks = []
    for index, hit in enumerate(hits, start=1):
        blocks.append(
            f"[{index}] {hit['sourcePath']} / {hit['sectionTitle']}\n{hit['content']}"
        )
    context = "\n\n".join(blocks) if blocks else "（无检索结果）"
    user = f"检索片段：\n{context}\n\n用户问题：{query}"
    message = chat.invoke(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ]
    )
    return (message.content or "").strip()


def build_ragas_objects(
    chat_model: str,
    embed_model: str,
    base: str,
    num_thread: int,
    num_ctx: int,
):
    from langchain_ollama import ChatOllama, OllamaEmbeddings
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from ragas.llms import LangchainLLMWrapper

    chat = ChatOllama(
        model=chat_model,
        temperature=0,
        base_url=base,
        num_thread=num_thread,
        num_ctx=num_ctx,
        keep_alive="5m",
    )
    embeddings = OllamaEmbeddings(model=embed_model, base_url=base)
    return chat, LangchainLLMWrapper(chat), LangchainEmbeddingsWrapper(embeddings)


def ragas_metrics():
    from ragas.metrics import (
        AnswerCorrectness,
        AnswerRelevancy,
        Faithfulness,
        LLMContextPrecisionWithReference,
        LLMContextRecall,
    )

    return [
        Faithfulness(),
        AnswerCorrectness(),
        LLMContextRecall(),
        LLMContextPrecisionWithReference(),
        AnswerRelevancy(),
    ]


def pick_score(scores: dict[str, float], *names: str) -> float:
    for name in names:
        if name in scores:
            return float(scores[name])
    return 0.0


def safe_mean(values: list[Any]) -> float:
    numbers = []
    for value in values:
        if value is None:
            continue
        number = float(value)
        if number != number:
            continue
        numbers.append(number)
    return sum(numbers) / len(numbers) if numbers else 0.0


def run_ragas(
    samples: list[dict[str, Any]],
    llm,
    embeddings,
    max_workers: int,
) -> tuple[dict[str, float], list[dict[str, Any]]]:
    from ragas import EvaluationDataset, evaluate
    from ragas.run_config import RunConfig

    dataset = EvaluationDataset.from_list(samples)
    result = evaluate(
        dataset,
        metrics=ragas_metrics(),
        llm=llm,
        embeddings=embeddings,
        run_config=RunConfig(max_workers=max_workers, timeout=600),
    )
    per_case = list(result.scores)
    names = per_case[0].keys() if per_case else []
    aggregates = {
        name: safe_mean([row.get(name) for row in per_case]) for name in names
    }
    return aggregates, per_case


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def format_pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    norm_left = math.sqrt(sum(a * a for a in left))
    norm_right = math.sqrt(sum(b * b for b in right))
    if norm_left == 0 or norm_right == 0:
        return 0.0
    return dot / (norm_left * norm_right)


def gram_coverage(reference: str, blob: str, n: int = GRAM_N) -> float:
    compact_ref = "".join(reference.split())
    compact_blob = "".join(blob.split())
    if not compact_ref:
        return 0.0
    if len(compact_ref) < n:
        return 1.0 if compact_ref in compact_blob else 0.0
    grams = [
        compact_ref[index : index + n]
        for index in range(len(compact_ref) - n + 1)
    ]
    return sum(1 for gram in grams if gram in compact_blob) / len(grams)


def score_embed_case(
    query_vector: list[float],
    ground_truth: str,
    contexts: list[str],
    env: dict[str, str],
) -> dict[str, float]:
    embed_model = env.get("EMBEDDING_MODEL", "bge-m3")
    dimensions = int(env.get("EMBEDDING_DIMENSIONS", "1024"))
    base = ollama_base(env)
    blob = "\n".join(contexts)
    gt_vector = embed_query(base, embed_model, ground_truth, dimensions)
    ctx_vector = embed_query(
        base,
        embed_model,
        blob[:CONCAT_EMBED_CHARS] or " ",
        dimensions,
    )
    chunk_sims = []
    for context in contexts:
        chunk_vector = embed_query(
            base,
            embed_model,
            context[:2000] or " ",
            dimensions,
        )
        chunk_sims.append(cosine(gt_vector, chunk_vector))
    coverage = gram_coverage(ground_truth, blob)
    return {
        "faithfulness": coverage,
        "hallucination_rate": 1.0 - coverage,
        "answer_accuracy": cosine(gt_vector, ctx_vector),
        "context_recall": coverage,
        "context_precision": mean(chunk_sims),
        "answer_relevancy": cosine(query_vector, ctx_vector),
        "gt_similarity": cosine(gt_vector, ctx_vector),
    }


def evaluate_strategy(
    db: Db,
    cases: list[dict[str, Any]],
    strategy: str,
    k: int,
    env: dict[str, str],
    chat,
    llm,
    embeddings,
    pause_seconds: float,
    max_workers: int,
    judge: str,
) -> dict[str, Any]:
    embed_model = env.get("EMBEDDING_MODEL", "bge-m3")
    dimensions = int(env.get("EMBEDDING_DIMENSIONS", "1024"))
    base = ollama_base(env)
    samples: list[dict[str, Any]] = []
    recall_rows: list[dict[str, Any]] = []
    details: list[dict[str, Any]] = []
    embed_rows: list[dict[str, float]] = []

    for index, item in enumerate(cases, start=1):
        started = time.time()
        vector = embed_query(base, embed_model, item["query"], dimensions)
        hits = retrieve(db, vector, strategy, k)
        recall = score_recall_at_k(item, hits)
        contexts = [hit["content"] for hit in hits]
        answer = ""
        if judge == "ragas":
            answer = generate_answer(chat, item["query"], hits)
            samples.append(
                {
                    "user_input": item["query"],
                    "retrieved_contexts": contexts,
                    "response": answer,
                    "reference": item["groundTruth"],
                }
            )
        embed_score = score_embed_case(vector, item["groundTruth"], contexts, env)
        embed_rows.append(embed_score)
        recall_rows.append(recall)
        details.append(
            {
                **recall,
                "query": item["query"],
                "response": answer,
                "reference": item["groundTruth"],
                "embed": embed_score,
                "top": [
                    {
                        "sourcePath": hit["sourcePath"],
                        "sectionTitle": hit["sectionTitle"],
                        "score": hit["score"],
                    }
                    for hit in hits
                ],
                "seconds": round(time.time() - started, 2),
            }
        )
        print(
            f"  [{index}/{len(cases)}] {item['id']} "
            f"hit={recall['hit']} goldRecall={recall['goldRecall']:.2f} "
            f"{time.time() - started:.1f}s",
            flush=True,
        )
        if pause_seconds > 0 and index < len(cases):
            time.sleep(pause_seconds)

    ragas_scores: dict[str, float] = {}
    if judge == "ragas":
        print(
            "  running RAGAS: faithfulness, answer_correctness, "
            "context_recall, context_precision, answer_relevancy ...",
            flush=True,
        )
        ragas_scores, per_case = run_ragas(samples, llm, embeddings, max_workers)
        for detail, case_score in zip(details, per_case):
            detail["ragas"] = case_score
        faithfulness = pick_score(ragas_scores, "faithfulness", "Faithfulness")
        accuracy = pick_score(
            ragas_scores,
            "answer_correctness",
            "answer_correctness(mode=f1)",
            "AnswerCorrectness",
        )
        context_recall = pick_score(ragas_scores, "context_recall", "llm_context_recall")
        context_precision = pick_score(
            ragas_scores,
            "llm_context_precision_with_reference",
            "context_precision",
        )
        answer_relevancy = pick_score(ragas_scores, "answer_relevancy", "AnswerRelevancy")
    else:
        faithfulness = mean([row["faithfulness"] for row in embed_rows])
        accuracy = mean([row["answer_accuracy"] for row in embed_rows])
        context_recall = mean([row["context_recall"] for row in embed_rows])
        context_precision = mean([row["context_precision"] for row in embed_rows])
        answer_relevancy = mean([row["answer_relevancy"] for row in embed_rows])

    return {
        "strategy": strategy,
        "k": k,
        "n": len(cases),
        "judge": judge,
        "recall_at_3": mean([1.0 if row["hit"] else 0.0 for row in recall_rows]),
        "gold_recall_at_3": mean([row["goldRecall"] for row in recall_rows]),
        "precision_at_3": mean([row["precision"] for row in recall_rows]),
        "mrr_at_3": mean([row["mrr"] for row in recall_rows]),
        "ndcg_at_3": mean([row["ndcg"] for row in recall_rows]),
        "mean_retrieved_chars": mean([float(row["retrievedChars"]) for row in recall_rows]),
        "faithfulness": faithfulness,
        "hallucination_rate": 1.0 - faithfulness,
        "answer_accuracy": accuracy,
        "context_recall": context_recall,
        "context_precision": context_precision,
        "answer_relevancy": answer_relevancy,
        "ragas": ragas_scores,
        "cases": details,
    }


def print_report(reports: list[dict[str, Any]]) -> str:
    labeled_header = [
        "strategy".ljust(16),
        "Hit@3".rjust(8),
        "Gold@3".rjust(8),
        "P@3".rjust(8),
        "MRR@3".rjust(8),
        "nDCG@3".rjust(8),
        "Chars@3".rjust(8),
    ]
    ragas_header = [
        "strategy".ljust(16),
        "幻觉率".rjust(8),
        "准确率".rjust(8),
        "Faith.".rjust(8),
        "CtxRec".rjust(8),
        "CtxPrec".rjust(8),
        "AnsRel".rjust(8),
    ]
    lines = [
        "Labeled retrieval @3",
        "  ".join(labeled_header),
        "-" * 80,
    ]
    for report in reports:
        lines.append(
            "  ".join(
                [
                    str(report["strategy"]).ljust(16),
                    format_pct(report["recall_at_3"]).rjust(8),
                    format_pct(report["gold_recall_at_3"]).rjust(8),
                    format_pct(report["precision_at_3"]).rjust(8),
                    f"{report['mrr_at_3']:.3f}".rjust(8),
                    f"{report['ndcg_at_3']:.3f}".rjust(8),
                    str(round(report["mean_retrieved_chars"])).rjust(8),
                ]
            )
        )
    lines += [
        "",
        "Support / accuracy (embed+lexical, no 7B judge)"
        if reports and reports[0].get("judge") != "ragas"
        else "Generation / RAGAS",
        "  ".join(ragas_header),
        "-" * 80,
    ]
    for report in reports:
        lines.append(
            "  ".join(
                [
                    str(report["strategy"]).ljust(16),
                    format_pct(report["hallucination_rate"]).rjust(8),
                    format_pct(report["answer_accuracy"]).rjust(8),
                    f"{report['faithfulness']:.3f}".rjust(8),
                    f"{report['context_recall']:.3f}".rjust(8),
                    f"{report['context_precision']:.3f}".rjust(8),
                    f"{report['answer_relevancy']:.3f}".rjust(8),
                ]
            )
        )
    misses = ["", "Misses (no gold in top-3):"]
    for report in reports:
        failed = [item for item in report["cases"] if not item["hit"]]
        misses.append(f"  {report['strategy']}: {len(failed)}")
        for item in failed:
            top = " | ".join(
                f"{hit['sourcePath']} / {hit['sectionTitle']}" for hit in item["top"][:3]
            )
            misses.append(f"    - {item['id']} 「{item['query']}」 → {top}")
    text = "\n".join(lines + misses)
    print("\n" + text, flush=True)
    return text


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="StayWise RAGAS eval")
    parser.add_argument("--golden", type=Path, default=DEFAULT_GOLDEN)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--strategy",
        default="heading",
        help="heading | all",
    )
    parser.add_argument("--k", type=int, default=RECALL_K)
    parser.add_argument("--limit", type=int, default=0, help="evaluate first N cases")
    parser.add_argument(
        "--judge",
        default=os.environ.get("EVAL_JUDGE", DEFAULT_JUDGE),
        choices=("embed", "ragas"),
        help="embed: bge-m3 + n-gram only (quiet). ragas: local 7B judge (loud).",
    )
    parser.add_argument("--chat-model", default=os.environ.get("CHAT_MODEL", "qwen2.5:7b"))
    parser.add_argument(
        "--pause",
        type=float,
        default=DEFAULT_PAUSE_SECONDS,
        help="seconds to wait between generated answers (keeps fans down)",
    )
    parser.add_argument(
        "--num-thread",
        type=int,
        default=DEFAULT_NUM_THREAD,
        help="Ollama CPU threads; keep low to avoid fan spin",
    )
    parser.add_argument("--num-ctx", type=int, default=DEFAULT_NUM_CTX)
    parser.add_argument(
        "--max-workers",
        type=int,
        default=DEFAULT_MAX_WORKERS,
        help="RAGAS parallel LLM calls; 1 is quiet, 16 melts the machine",
    )
    return parser.parse_args()


def main() -> int:
    env = apply_env()
    args = parse_args()
    lower_process_priority()
    if args.chat_model:
        os.environ["CHAT_MODEL"] = args.chat_model

    payload = json.loads(args.golden.read_text(encoding="utf-8"))
    cases = payload["cases"]
    missing = [item["id"] for item in cases if not item.get("groundTruth")]
    if missing:
        raise SystemExit(f"golden.json missing groundTruth: {missing}")
    if args.limit:
        cases = cases[: args.limit]

    strategy_arg = args.strategy.strip()
    strategies = list(STRATEGIES) if strategy_arg == "all" else [strategy_arg]
    for strategy in strategies:
        if strategy not in STRATEGIES:
            raise SystemExit(f"unknown strategy {strategy}")

    database_url = env.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is not set")

    base = ollama_base(env)
    embed_model = env.get("EMBEDDING_MODEL", "bge-m3")
    print(
        f"eval: n={len(cases)} k={args.k} strategies={strategies} judge={args.judge} "
        f"embed={embed_model} pause={args.pause}s",
        flush=True,
    )
    chat = llm = embeddings = None
    if args.judge == "ragas":
        chat, llm, embeddings = build_ragas_objects(
            args.chat_model,
            embed_model,
            base,
            num_thread=args.num_thread,
            num_ctx=args.num_ctx,
        )

    reports: list[dict[str, Any]] = []
    db = Db(psycopg_url(database_url))
    try:
        for strategy in strategies:
            print(f"\n== {strategy} ==", flush=True)
            reports.append(
                evaluate_strategy(
                    db,
                    cases,
                    strategy,
                    args.k,
                    env,
                    chat,
                    llm,
                    embeddings,
                    pause_seconds=args.pause,
                    max_workers=args.max_workers,
                    judge=args.judge,
                )
            )
    finally:
        db.close()

    summary = {
        "k": args.k,
        "judge": args.judge,
        "chatModel": args.chat_model if args.judge == "ragas" else None,
        "embeddingModel": embed_model,
        "metrics": {
            "hit@3": "labeled：top-3 至少命中 1 条 gold sourcePath+sectionTitle",
            "gold_recall@3": "labeled：命中的 gold 段落数 / gold 总数",
            "precision@3": "labeled：top-3 中 gold 占比",
            "mrr@3": "labeled：第一条 gold 的倒数排名",
            "ndcg@3": "labeled：二元相关性 nDCG",
            "hallucination_rate": "embed 默认：1 - 参考答案 8-gram 落在 top-3 的比例；--judge ragas 则为 1-Faithfulness",
            "answer_accuracy": "embed 默认：参考答案与 top-3 拼接的 bge-m3 余弦；--judge ragas 则为 AnswerCorrectness",
            "context_recall": "embed：参考答案字面覆盖；ragas：LLMContextRecall",
            "context_precision": "embed：各 chunk 与参考答案余弦均值；ragas：LLMContextPrecision",
            "answer_relevancy": "embed：问题向量与 top-3 拼接余弦；ragas：AnswerRelevancy",
        },
        "reports": reports,
    }
    args.out.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print_report(reports)
    print(f"\nwrote {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
