import { writeFile } from 'fs/promises';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ChunkStrategy } from '@prisma/client';
import { EmbedderService } from './embedder.service';
import { RetrieverService } from './retriever.service';
import type { RetrievedChunk, RetrieveMode } from './retriever.service';

export type GoldPassage = {
  sourcePath: string;
  sectionTitle: string;
};

export type GoldCase = {
  id: string;
  query: string;
  relevant: GoldPassage[];
  groundTruth?: string;
  notes?: string;
};

export type GoldenSet = {
  description?: string;
  k: number;
  cases: GoldCase[];
};

export type CaseScore = {
  id: string;
  query: string;
  hit: boolean;
  rank: number | null;
  goldRecall: number;
    top: Array<{ sourcePath: string; sectionTitle: string | null; score: number }>;
    retrievedChars: number;
};

export type StrategyReport = {
  mode: RetrieveMode;
  strategy: ChunkStrategy;
  k: number;
  hitAtK: number;
  mrr: number;
  meanGoldRecall: number;
  meanRetrievedChars: number;
  cases: CaseScore[];
};

@Injectable()
export class EvalService {
  private readonly logger = new Logger(EvalService.name);

  constructor(
    private readonly embedder: EmbedderService,
    private readonly retriever: RetrieverService,
  ) {}

  async run(golden: GoldenSet): Promise<StrategyReport[]> {
    const k = golden.k;
    const strategies = [ChunkStrategy.heading];
    const queryVectors = new Map<string, number[]>();

    for (const item of golden.cases) {
      const [vector] = await this.embedder.embed([item.query]);
      queryVectors.set(item.id, vector);
    }

    const modes: RetrieveMode[] = ['vector', 'bm25', 'hybrid'];
    const reports: StrategyReport[] = [];
    for (const strategy of strategies) {
      for (const mode of modes) {
        const cases: CaseScore[] = [];
        for (const item of golden.cases) {
          const hits = await this.retriever.retrieve({
            query: item.query,
            queryVector: queryVectors.get(item.id),
            strategy,
            k,
            mode,
          });
          cases.push(scoreCase(item, hits));
        }
        const hitCount = cases.filter((item) => item.hit).length;
        const mrr =
          cases.reduce((sum, item) => sum + (item.rank ? 1 / item.rank : 0), 0) /
          cases.length;
        const meanGoldRecall =
          cases.reduce((sum, item) => sum + item.goldRecall, 0) / cases.length;
        const meanRetrievedChars =
          cases.reduce((sum, item) => sum + item.retrievedChars, 0) /
          cases.length;
        reports.push({
          mode,
          strategy,
          k,
          hitAtK: hitCount / cases.length,
          mrr,
          meanGoldRecall,
          meanRetrievedChars,
          cases,
        });
      }
    }

    return reports;
  }

  format(reports: StrategyReport[]): string {
    const header = [
      'mode'.padEnd(16),
      'Hit@k'.padStart(8),
      'MRR'.padStart(8),
      'GoldRecall'.padStart(12),
      'Chars@k'.padStart(10),
    ].join('  ');
    const lines = [header, '-'.repeat(header.length)];
    for (const report of reports) {
      lines.push(
        [
          report.mode.padEnd(16),
          (report.hitAtK * 100).toFixed(1).padStart(7) + '%',
          report.mrr.toFixed(3).padStart(8),
          (report.meanGoldRecall * 100).toFixed(1).padStart(11) + '%',
          Math.round(report.meanRetrievedChars).toString().padStart(10),
        ].join('  '),
      );
    }

    const misses: string[] = ['', 'Misses (no gold in top-k):'];
    for (const report of reports) {
      const failed = report.cases.filter((item) => !item.hit);
      misses.push(`  ${report.mode}: ${failed.length}`);
      for (const item of failed) {
        const top = item.top
          .slice(0, 3)
          .map((hit) => `${hit.sourcePath} / ${hit.sectionTitle}`)
          .join(' | ');
        misses.push(`    - ${item.id} 「${item.query}」 → ${top}`);
      }
    }

    return [...lines, ...misses].join('\n');
  }

  async writeReport(reports: StrategyReport[], outPath?: string) {
    const path =
      outPath ?? join(process.cwd(), '..', 'knowledge', 'eval', 'last-report.json');
    await writeFile(path, JSON.stringify(reports, null, 2), 'utf8');
    this.logger.log(`wrote ${path}`);
  }
}

export function scoreCase(item: GoldCase, hits: RetrievedChunk[]): CaseScore {
  const goldKeys = new Set(
    item.relevant.map((passage) => keyOf(passage.sourcePath, passage.sectionTitle)),
  );
  let rank: number | null = null;
  const found = new Set<string>();

  hits.forEach((hit, index) => {
    const key = keyOf(hit.sourcePath, hit.sectionTitle ?? '');
    if (!goldKeys.has(key)) {
      return;
    }
    found.add(key);
    if (rank === null) {
      rank = index + 1;
    }
  });

  return {
    id: item.id,
    query: item.query,
    hit: rank !== null,
    rank,
    goldRecall: goldKeys.size === 0 ? 0 : found.size / goldKeys.size,
    retrievedChars: hits.reduce(
      (sum, hit) => sum + (hit.parentContent ?? hit.content).length,
      0,
    ),
    top: hits.map((hit) => ({
      sourcePath: hit.sourcePath,
      sectionTitle: hit.sectionTitle,
      score: hit.score,
    })),
  };
}

function keyOf(sourcePath: string, sectionTitle: string): string {
  return `${sourcePath}::${sectionTitle}`;
}
