import { Injectable, Logger } from '@nestjs/common';
import { ChunkStrategy } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BM25_B,
  BM25_K1,
  DEFAULT_RETRIEVE_K,
  HYBRID_CANDIDATE_K,
  RRF_K,
} from './knowledge.constants';
import { EmbedderService } from './embedder.service';
import { Bm25Index, reciprocalRankFusion, type Bm25Document } from './bm25';
import { toVectorLiteral } from './vector';

export type RetrievedChunk = {
  id: string;
  documentId: string;
  sourcePath: string;
  documentTitle: string;
  sectionTitle: string | null;
  content: string;
  parentContent: string | null;
  score: number;
};

export type RetrieveMode = 'vector' | 'bm25' | 'hybrid';

const STRATEGIES = new Set<string>(Object.values(ChunkStrategy));

@Injectable()
export class RetrieverService {
  private readonly logger = new Logger(RetrieverService.name);
  private readonly bm25ByStrategy = new Map<ChunkStrategy, Bm25Index>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: EmbedderService,
  ) {}

  async retrieve(options: {
    query: string;
    strategy: ChunkStrategy;
    k?: number;
    mode?: RetrieveMode;
    queryVector?: number[];
  }): Promise<RetrievedChunk[]> {
    const k = options.k ?? DEFAULT_RETRIEVE_K;
    const mode = options.mode ?? 'vector';
    if (mode === 'bm25') {
      return this.retrieveBm25(options.query, options.strategy, k);
    }
    const queryVector =
      options.queryVector ?? (await this.embedder.embed([options.query]))[0];
    if (mode === 'vector') {
      return this.retrieveByVector({
        queryVector,
        strategy: options.strategy,
        k,
      });
    }
    return this.retrieveHybrid({
      query: options.query,
      queryVector,
      strategy: options.strategy,
      k,
    });
  }

  async retrieveByVector(options: {
    queryVector: number[];
    strategy: ChunkStrategy;
    k?: number;
  }): Promise<RetrievedChunk[]> {
    return this.retrieveVectorFromLiteral(
      toVectorLiteral(options.queryVector),
      options.strategy,
      options.k ?? DEFAULT_RETRIEVE_K,
    );
  }

  private async retrieveHybrid(options: {
    query: string;
    queryVector: number[];
    strategy: ChunkStrategy;
    k: number;
  }): Promise<RetrievedChunk[]> {
    const pool = Math.max(options.k, HYBRID_CANDIDATE_K);
    const [dense, sparse] = await Promise.all([
      this.retrieveByVector({
        queryVector: options.queryVector,
        strategy: options.strategy,
        k: pool,
      }),
      this.retrieveBm25(options.query, options.strategy, pool),
    ]);
    const fused = reciprocalRankFusion([dense, sparse], options.k, RRF_K);
    this.logger.debug(
      `hybrid strategy=${options.strategy} k=${options.k} dense=${dense.length} bm25=${sparse.length} fused=${fused.length}`,
    );
    return fused;
  }

  private async retrieveBm25(
    query: string,
    strategy: ChunkStrategy,
    k: number,
  ): Promise<RetrievedChunk[]> {
    const index = await this.getBm25Index(strategy);
    return index.search(query, k);
  }

  private async getBm25Index(strategy: ChunkStrategy): Promise<Bm25Index> {
    const cached = this.bm25ByStrategy.get(strategy);
    if (cached) {
      return cached;
    }
    const rows = await this.prisma.$queryRawUnsafe<Bm25Document[]>(
      `
      SELECT
        c.id,
        c."documentId",
        d."sourcePath",
        d.title AS "documentTitle",
        c."sectionTitle",
        c.content,
        p.content AS "parentContent"
      FROM "KnowledgeChunk" c
      JOIN "KnowledgeDocument" d ON d.id = c."documentId"
      LEFT JOIN "KnowledgeChunk" p ON p.id = c."parentChunkId"
      WHERE c.strategy = $1::"ChunkStrategy"
      `,
      strategy,
    );
    const index = new Bm25Index(rows, BM25_K1, BM25_B);
    this.bm25ByStrategy.set(strategy, index);
    this.logger.log(`bm25 index ${strategy}: ${rows.length} chunks`);
    return index;
  }

  private async retrieveVectorFromLiteral(
    vector: string,
    strategy: ChunkStrategy,
    k: number,
  ): Promise<RetrievedChunk[]> {
    if (!STRATEGIES.has(strategy)) {
      throw new Error(`Unknown chunk strategy: ${strategy}`);
    }

    const rows = await this.prisma.$queryRawUnsafe<RetrievedChunk[]>(
      `
      SELECT
        c.id,
        c."documentId",
        d."sourcePath",
        d.title AS "documentTitle",
        c."sectionTitle",
        c.content,
        p.content AS "parentContent",
        (1 - (c.embedding <=> $1::vector))::float8 AS score
      FROM "KnowledgeChunk" c
      JOIN "KnowledgeDocument" d ON d.id = c."documentId"
      LEFT JOIN "KnowledgeChunk" p ON p.id = c."parentChunkId"
      WHERE c.strategy = $2::"ChunkStrategy"
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
      `,
      vector,
      strategy,
      k,
    );

    this.logger.debug(
      `retrieve strategy=${strategy} k=${k} hits=${rows.length}`,
    );
    return rows;
  }
}
