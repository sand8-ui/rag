import { Injectable } from '@nestjs/common';
import { KnowledgeSourceType } from '@prisma/client';
import type { ParsedBlock, ParsedDocument } from '../knowledge.types';

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;

@Injectable()
export class MarkdownParser {
  parse(sourcePath: string, markdown: string): ParsedDocument {
    const blocks = parseMarkdownBlocks(markdown);
    const title =
      blocks.find((block) => block.type === 'heading' && block.level === 1)
        ?.text ??
      blocks.find((block) => block.type === 'paragraph')?.text ??
      sourcePath;

    return {
      sourcePath,
      sourceType: KnowledgeSourceType.md,
      title,
      blocks,
    };
  }
}

export function parseMarkdownBlocks(markdown: string): ParsedBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: ParsedBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: unescapeMarkdown(heading[2].trim()),
      });
      index += 1;
      continue;
    }

    if (isTableLine(line)) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableLine(lines[index])) {
        tableLines.push(lines[index].trimEnd());
        index += 1;
      }
      blocks.push({
        type: 'table',
        text: unescapeMarkdown(tableLines.join('\n')),
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].match(HEADING_RE) &&
      !isTableLine(lines[index])
    ) {
      paragraphLines.push(lines[index].trimEnd());
      index += 1;
    }
    blocks.push({
      type: 'paragraph',
      text: unescapeMarkdown(paragraphLines.join('\n').trim()),
    });
  }

  return blocks;
}

function isTableLine(line: string): boolean {
  return TABLE_ROW_RE.test(line);
}

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');
}
