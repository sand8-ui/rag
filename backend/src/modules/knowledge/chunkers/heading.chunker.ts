import { Injectable } from '@nestjs/common';
import { ChunkRole, ChunkStrategy } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { DraftChunk, ParsedDocument } from '../knowledge.types';
import { blocksToText, groupSections, withSectionPrefix } from './text';

@Injectable()
export class HeadingChunker {
  readonly strategy = ChunkStrategy.heading;

  chunk(doc: ParsedDocument): DraftChunk[] {
    return groupSections(doc.title, doc.blocks).map((section, chunkIndex) => {
      const body = blocksToText(section.blocks);
      return {
        localId: randomUUID(),
        strategy: this.strategy,
        role: ChunkRole.child,
        chunkIndex,
        content: withSectionPrefix(section.title, body),
        sectionTitle: section.title,
      };
    });
  }
}
