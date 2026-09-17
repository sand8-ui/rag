import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ChunkStrategy } from '@prisma/client';
import { AppModule } from '../../app.module';
import { RetrieverService } from '../knowledge/retriever.service';
import { ChatLlmService } from './chat-llm.service';
import { trimRetrieved, type LlmMessage } from './chat-context';
import { packChatContext, type ContextMode } from './chat-pack';
import { collectSlots } from './chat-slots';
import { buildSummaryPrompt } from './chat-window';

type Script = {
  id: string;
  setup: LlmMessage[];
  probe: string;
  mustContain: string[];
  shouldContainAny: string[];
  mustNotMatch: string[];
};

type ScriptFile = {
  budget: number;
  ragTokenBudget: number;
  fillers: number;
  scripts: Script[];
};

type ModeResult = {
  mode: ContextMode;
  answer: string;
  kept: number;
  overflow: number;
  tokens: number;
  remember: boolean;
  askedAgain: boolean;
  topical: boolean;
};

const FILLER_USER =
  '对了，我还想再确认一下早餐时段、前台入住要带什么证件、以及房间有没有吹风机和书桌，请按你们知识库里的通用入住说明尽量写清楚，不要编造没有的数字。';
const FILLER_ASSISTANT =
  '早餐与入住证件以门店说明为准；房间日常用品以客房配置为准。具体数字请看检索到的入住须知，我不会编造未写明的费率。';

function scoreAnswer(script: Script, answer: string) {
  const text = answer.replace(/\s+/g, '');
  const remember = script.mustContain.every((item) => text.includes(item.replace(/\s+/g, '')));
  const topical = script.shouldContainAny.some((item) => text.includes(item));
  const askedAgain = script.mustNotMatch.some((item) => answer.includes(item));
  return { remember, topical, askedAgain };
}

function withFillers(setup: LlmMessage[], fillers: number, probe: string): LlmMessage[] {
  const extra: LlmMessage[] = [];
  for (let index = 0; index < fillers; index += 1) {
    extra.push({ role: 'user', content: `${FILLER_USER}（补充确认 ${index + 1}）` });
    extra.push({ role: 'assistant', content: FILLER_ASSISTANT });
  }
  return [...setup, ...extra, { role: 'user', content: probe }];
}

async function main() {
  const logger = new Logger('context-eval');
  const scriptPath =
    process.argv[2] ??
    join(process.cwd(), '..', 'knowledge', 'eval', 'context-scripts.json');
  const payload = JSON.parse(await readFile(scriptPath, 'utf8')) as ScriptFile;
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const llm = app.get(ChatLlmService);
    const retriever = app.get(RetrieverService);
    const rows: Array<{ id: string; window: ModeResult; full: ModeResult }> = [];

    for (const script of payload.scripts) {
      logger.log(`script ${script.id}`);
      const history = withFillers(script.setup, payload.fillers, script.probe);
      const slots = collectSlots(
        history.filter((turn) => turn.role === 'user').map((turn) => turn.content),
      );
      const retrieved = trimRetrieved(
        await retriever.retrieve({
          query: script.probe,
          strategy: ChunkStrategy.heading,
          mode: 'hybrid',
          k: 6,
        }),
        payload.ragTokenBudget,
      );

      const window = await runMode({
        mode: 'window',
        history,
        retrieved,
        slots,
        budget: payload.budget,
        llm,
      });
      const full = await runMode({
        mode: 'full',
        history,
        retrieved,
        slots,
        budget: payload.budget,
        llm,
      });

      const windowScore = { ...window, ...scoreAnswer(script, window.answer) };
      const fullScore = { ...full, ...scoreAnswer(script, full.answer) };
      rows.push({ id: script.id, window: windowScore, full: fullScore });
      logger.log(
        `  window remember=${windowScore.remember} topical=${windowScore.topical} askedAgain=${windowScore.askedAgain} overflow=${window.overflow}`,
      );
      logger.log(
        `  full   remember=${fullScore.remember} topical=${fullScore.topical} askedAgain=${fullScore.askedAgain} overflow=${full.overflow}`,
      );
    }

    logger.log(`\n${formatTable(rows)}`);
    const out = join(process.cwd(), '..', 'knowledge', 'eval', 'last-context-report.json');
    await writeFile(out, JSON.stringify({ budget: payload.budget, rows }, null, 2), 'utf8');
    logger.log(`wrote ${out}`);
  } finally {
    await app.close();
  }
}

async function runMode(options: {
  mode: ContextMode;
  history: LlmMessage[];
  retrieved: Awaited<ReturnType<typeof trimRetrieved>>;
  slots: ReturnType<typeof collectSlots>;
  budget: number;
  llm: ChatLlmService;
}): Promise<Omit<ModeResult, 'remember' | 'askedAgain' | 'topical'>> {
  const packed = await packChatContext({
    history: options.history,
    retrieved: options.retrieved,
    slots: options.slots,
    summary: null,
    mode: options.mode,
    budget: options.budget,
    summarize:
      options.mode === 'full'
        ? async (previous, overflow) =>
            options.llm.complete(buildSummaryPrompt(previous, overflow), AbortSignal.timeout(120000), {
              maxTokens: 220,
            })
        : undefined,
  });
  const answer = await options.llm.complete(packed.messages, AbortSignal.timeout(180000), {
    maxTokens: 280,
  });
  return {
    mode: options.mode,
    answer,
    kept: packed.kept,
    overflow: packed.overflow,
    tokens: packed.tokens,
  };
}

function formatTable(rows: Array<{ id: string; window: ModeResult; full: ModeResult }>) {
  const header = [
    'script'.padEnd(18),
    'win.remember'.padStart(12),
    'full.remember'.padStart(13),
    'win.topical'.padStart(12),
    'full.topical'.padStart(12),
    'win.ask#'.padStart(9),
    'full.ask#'.padStart(10),
  ].join('  ');
  const lines = [header, '-'.repeat(header.length)];
  for (const row of rows) {
    lines.push(
      [
        row.id.padEnd(18),
        flag(row.window.remember).padStart(12),
        flag(row.full.remember).padStart(13),
        flag(row.window.topical).padStart(12),
        flag(row.full.topical).padStart(12),
        flag(row.window.askedAgain).padStart(9),
        flag(row.full.askedAgain).padStart(10),
      ].join('  '),
    );
  }
  const winRemember = mean(rows.map((row) => Number(row.window.remember)));
  const fullRemember = mean(rows.map((row) => Number(row.full.remember)));
  lines.push(
    '',
    `remember rate  window=${(winRemember * 100).toFixed(0)}%  full=${(fullRemember * 100).toFixed(0)}%`,
  );
  return lines.join('\n');
}

function flag(value: boolean) {
  return value ? 'Y' : 'N';
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

void main();
