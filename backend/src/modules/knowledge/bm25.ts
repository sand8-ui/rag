export type Bm25Document = {
  id: string;
  documentId: string;
  sourcePath: string;
  documentTitle: string;
  sectionTitle: string | null;
  content: string;
  parentContent: string | null;
};

export type Bm25Hit = Bm25Document & { score: number };

const CJK = /[\u3400-\u9fff]/;
const LATIN = /[a-z0-9]+/g;
const CJK_RUN = /[\u3400-\u9fff]+/g;

export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const tokens: string[] = [];
  const latin = normalized.match(LATIN);
  if (latin) {
    tokens.push(...latin);
  }
  const runs = normalized.match(CJK_RUN);
  if (!runs) {
    return tokens;
  }
  for (const run of runs) {
    for (const char of run) {
      if (CJK.test(char)) {
        tokens.push(char);
      }
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      tokens.push(run.slice(index, index + 2));
    }
  }
  return tokens;
}

type IndexedDoc = Bm25Document & {
  tf: Map<string, number>;
  length: number;
};

export class Bm25Index {
  private readonly docs: IndexedDoc[] = [];
  private readonly df = new Map<string, number>();
  private avgdl = 0;

  constructor(
    documents: Bm25Document[],
    private readonly k1 = 1.2,
    private readonly b = 0.75,
  ) {
    let totalLength = 0;
    for (const document of documents) {
      const tokens = tokenize(
        [document.sectionTitle, document.content, document.parentContent]
          .filter(Boolean)
          .join('\n'),
      );
      const tf = new Map<string, number>();
      for (const token of tokens) {
        tf.set(token, (tf.get(token) ?? 0) + 1);
      }
      for (const token of tf.keys()) {
        this.df.set(token, (this.df.get(token) ?? 0) + 1);
      }
      this.docs.push({ ...document, tf, length: Math.max(tokens.length, 1) });
      totalLength += Math.max(tokens.length, 1);
    }
    this.avgdl = this.docs.length === 0 ? 0 : totalLength / this.docs.length;
  }

  search(query: string, k: number): Bm25Hit[] {
    const uniqueQuery = [...new Set(tokenize(query))];
    if (uniqueQuery.length === 0 || this.docs.length === 0) {
      return [];
    }

    const scored = this.docs.map((doc) => ({
      doc,
      score: this.score(doc, uniqueQuery),
    }));
    scored.sort((left, right) => right.score - left.score);

    return scored
      .filter((item) => item.score > 0)
      .slice(0, k)
      .map(({ doc, score }) => ({
        id: doc.id,
        documentId: doc.documentId,
        sourcePath: doc.sourcePath,
        documentTitle: doc.documentTitle,
        sectionTitle: doc.sectionTitle,
        content: doc.content,
        parentContent: doc.parentContent,
        score,
      }));
  }

  private score(doc: IndexedDoc, queryTokens: string[]): number {
    const n = this.docs.length;
    let total = 0;
    for (const token of queryTokens) {
      const tf = doc.tf.get(token);
      if (!tf) {
        continue;
      }
      const df = this.df.get(token) ?? 0;
      const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);
      const denom =
        tf + this.k1 * (1 - this.b + (this.b * doc.length) / this.avgdl);
      total += idf * ((tf * (this.k1 + 1)) / denom);
    }
    return total;
  }
}

export function reciprocalRankFusion<T extends { id: string }>(
  lists: T[][],
  k: number,
  rrfK = 60,
): Array<T & { score: number }> {
  const fused = new Map<string, { item: T; score: number }>();
  for (const list of lists) {
    list.forEach((item, index) => {
      const add = 1 / (rrfK + index + 1);
      const existing = fused.get(item.id);
      if (existing) {
        existing.score += add;
      } else {
        fused.set(item.id, { item, score: add });
      }
    });
  }
  return [...fused.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, k)
    .map(({ item, score }) => ({ ...item, score }));
}
