import type { ParsedBlock, Section } from '../knowledge.types';

export function blocksToText(blocks: ParsedBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'heading') {
        return `${'#'.repeat(block.level)} ${block.text}`;
      }
      return block.text;
    })
    .filter((text) => text.trim().length > 0)
    .join('\n\n')
    .trim();
}

export function groupSections(title: string, blocks: ParsedBlock[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { title: '前言', blocks: [] };

  for (const block of blocks) {
    if (
      block.type === 'heading' &&
      block.level === 1 &&
      block.text === title
    ) {
      continue;
    }
    if (block.type === 'heading' && block.level <= 2) {
      if (blocksToText(current.blocks).length > 0) {
        sections.push(current);
      }
      current = { title: block.text, blocks: [] };
      continue;
    }
    current.blocks.push(block);
  }

  if (blocksToText(current.blocks).length > 0) {
    sections.push(current);
  }

  return sections;
}

export function withSectionPrefix(
  sectionTitle: string,
  content: string,
): string {
  if (!sectionTitle || sectionTitle === '前言') {
    return content;
  }
  if (content.startsWith(sectionTitle) || content.startsWith(`# ${sectionTitle}`)) {
    return content;
  }
  return `【${sectionTitle}】\n${content}`;
}

