import { Module } from '@nestjs/common';
import { HeadingChunker } from './chunkers/heading.chunker';
import { EmbedderService } from './embedder.service';
import { EvalService } from './eval.service';
import { IngestService } from './ingest.service';
import { DocxParser } from './parsers/docx.parser';
import { MarkdownParser } from './parsers/markdown.parser';
import { RetrieverService } from './retriever.service';

@Module({
  providers: [
    MarkdownParser,
    DocxParser,
    HeadingChunker,
    EmbedderService,
    IngestService,
    RetrieverService,
    EvalService,
  ],
  exports: [IngestService, RetrieverService, EmbedderService, EvalService],
})
export class KnowledgeModule {}
