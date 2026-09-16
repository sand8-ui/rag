import { Injectable } from '@nestjs/common';
import { KnowledgeSourceType } from '@prisma/client';
import mammoth from 'mammoth';
import { parseMarkdownBlocks } from './markdown.parser';
import type { ParsedDocument } from '../knowledge.types';

@Injectable()
export class DocxParser {
  async parse(sourcePath: string, absPath: string): Promise<ParsedDocument> {
    const result = await mammoth.convertToHtml({ path: absPath });
    const markdown = htmlToMarkdown(result.value);
    const blocks = parseMarkdownBlocks(markdown);
    const title =
      blocks.find((block) => block.type === 'paragraph')?.text ??
      blocks.find((block) => block.type === 'heading' && block.level === 1)
        ?.text ??
      sourcePath;

    return {
      sourcePath,
      sourceType: KnowledgeSourceType.docx,
      title,
      blocks,
    };
  }
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/\u00a0/g, ' ')
    .replace(/<h([1-6])[^>]*>/gi, (_, level: string) => `${'#'.repeat(Number(level))} `)
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
