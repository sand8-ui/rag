import {
  ChunkRole,
  ChunkStrategy,
  KnowledgeSourceType,
} from '@prisma/client';

export type ParsedBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'table'; text: string };

export type ParsedDocument = {
  sourcePath: string;
  sourceType: KnowledgeSourceType;
  title: string;
  blocks: ParsedBlock[];
};

export type Section = {
  title: string;
  blocks: ParsedBlock[];
};

export type DraftChunk = {
  localId: string;
  strategy: ChunkStrategy;
  role: ChunkRole;
  chunkIndex: number;
  content: string;
  sectionTitle: string | null;
};

export type ChunkMetadata = {
  sourcePath: string;
  sourceType: KnowledgeSourceType;
  documentTitle: string;
};
