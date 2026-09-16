import { createHash } from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { extname, join, relative } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeSourceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HeadingChunker } from './chunkers/heading.chunker';
import { EmbedderService } from './embedder.service';
import { DocxParser } from './parsers/docx.parser';
import { MarkdownParser } from './parsers/markdown.parser';
import type { ChunkMetadata, ParsedDocument } from './knowledge.types';
import { toVectorLiteral } from './vector';

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private readonly knowledgeDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly markdownParser: MarkdownParser,
    private readonly docxParser: DocxParser,
    private readonly headingChunker: HeadingChunker,
    private readonly embedder: EmbedderService,
  ) {
    this.knowledgeDir =
      this.configService.get<string>('KNOWLEDGE_DIR') ??
      join(process.cwd(), '..', 'knowledge');
  }

  async run(options: { force?: boolean } = {}) {
    const files = await this.listSourceFiles();
    this.logger.log(
      `knowledge dir ${this.knowledgeDir}, files ${files.length}`,
    );

    let ingested = 0;
    let skipped = 0;

    for (const file of files) {
      const changed = await this.ingestFile(file, options.force === true);
      if (changed) {
        ingested += 1;
      } else {
        skipped += 1;
      }
    }

    const counts = await this.prisma.knowledgeChunk.groupBy({
      by: ['strategy', 'role'],
      _count: { _all: true },
    });

    this.logger.log(
      `ingest done: wrote ${ingested}, skipped ${skipped}, chunk counts ${JSON.stringify(counts)}`,
    );
  }

  private async ingestFile(absPath: string, force: boolean): Promise<boolean> {
    const sourcePath = relative(this.knowledgeDir, absPath).replaceAll('\\', '/');
    const buffer = await readFile(absPath);
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const existing = await this.prisma.knowledgeDocument.findUnique({
      where: { sourcePath },
    });

    if (existing && existing.contentHash === contentHash && !force) {
      this.logger.log(`skip unchanged ${sourcePath}`);
      return false;
    }

    const parsed = await this.parseFile(sourcePath, absPath, buffer);
    const drafts = this.headingChunker.chunk(parsed);
    this.logger.log(`embedding ${drafts.length} heading chunks for ${sourcePath}`);
    const vectors = await this.embedder.embed(drafts.map((draft) => draft.content));
    const embeddingByLocalId = new Map(
      drafts.map((draft, index) => [draft.localId, vectors[index]]),
    );

    const metadata: ChunkMetadata = {
      sourcePath,
      sourceType: parsed.sourceType,
      documentTitle: parsed.title,
    };

    await this.prisma.$transaction(async (tx) => {
      const document = existing
        ? await tx.knowledgeDocument.update({
            where: { id: existing.id },
            data: {
              title: parsed.title,
              sourceType: parsed.sourceType,
              contentHash,
              ingestedAt: new Date(),
            },
          })
        : await tx.knowledgeDocument.create({
            data: {
              sourcePath,
              sourceType: parsed.sourceType,
              title: parsed.title,
              contentHash,
            },
          });

      await tx.knowledgeChunk.deleteMany({ where: { documentId: document.id } });

      for (const draft of drafts) {
        await tx.knowledgeChunk.create({
          data: {
            id: draft.localId,
            documentId: document.id,
            strategy: draft.strategy,
            role: draft.role,
            chunkIndex: draft.chunkIndex,
            content: draft.content,
            sectionTitle: draft.sectionTitle,
            metadata,
          },
        });

        const embedding = embeddingByLocalId.get(draft.localId);
        if (!embedding) {
          continue;
        }
        await tx.$executeRawUnsafe(
          `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
          toVectorLiteral(embedding),
          draft.localId,
        );
      }
    }, { timeout: 60_000 });

    this.logger.log(`ingested ${sourcePath}`);
    return true;
  }

  private async parseFile(
    sourcePath: string,
    absPath: string,
    buffer: Buffer,
  ): Promise<ParsedDocument> {
    const sourceType = extname(absPath).toLowerCase() === '.docx'
      ? KnowledgeSourceType.docx
      : KnowledgeSourceType.md;

    if (sourceType === KnowledgeSourceType.docx) {
      return this.docxParser.parse(sourcePath, absPath);
    }

    return this.markdownParser.parse(sourcePath, buffer.toString('utf8'));
  }

  private async listSourceFiles(): Promise<string[]> {
    const groups = [
      { dir: join(this.knowledgeDir, 'markdown'), ext: '.md' },
      { dir: join(this.knowledgeDir, 'docx'), ext: '.docx' },
    ];
    const files: string[] = [];
    for (const group of groups) {
      const names = await readdir(group.dir);
      for (const name of names.sort()) {
        if (name.startsWith('.')) {
          continue;
        }
        if (extname(name).toLowerCase() === group.ext) {
          files.push(join(group.dir, name));
        }
      }
    }
    return files;
  }
}
