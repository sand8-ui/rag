import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmMessage } from './chat-context';
import {
  buildIntentMessages,
  goldIntent,
  parseIntentResult,
  recognizeByRules,
  rewriteRetrieveQuery,
  type ChatIntent,
  type IntentResult,
  type IntentSource,
} from './chat-intent';
import { ChatLlmService } from './chat-llm.service';
import type { SessionSlots } from './chat-slots';

const SOURCES = new Set<IntentSource>(['off', 'rules', 'llm', 'gold']);

@Injectable()
export class ChatIntentService {
  private readonly logger = new Logger(ChatIntentService.name);
  private readonly source: IntentSource;
  private readonly rewrite: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly chatLlmService: ChatLlmService,
  ) {
    const raw = (
      this.configService.get<string>('INTENT_SOURCE') ?? 'off'
    ).trim() as IntentSource;
    this.source = SOURCES.has(raw) ? raw : 'off';
    this.rewrite = parseFlag(
      this.configService.get<string>('INTENT_REWRITE') ?? 'false',
    );
  }

  isEnabled() {
    return this.source !== 'off';
  }

  shouldRewrite() {
    return this.isEnabled() && this.rewrite;
  }

  retrieveQuery(
    userText: string,
    intent: IntentResult,
    slots: SessionSlots,
  ) {
    if (!this.shouldRewrite() || !intent.intent) {
      return userText;
    }
    return rewriteRetrieveQuery(userText, intent.intent, slots);
  }

  async recognize(options: {
    history: LlmMessage[];
    slots: SessionSlots;
    signal: AbortSignal;
    gold?: ChatIntent;
  }): Promise<IntentResult> {
    if (options.gold) {
      return goldIntent(options.gold);
    }
    if (this.source === 'off') {
      return { intent: null, confidence: 'low', source: 'off' };
    }
    if (this.source === 'gold') {
      this.logger.warn('INTENT_SOURCE=gold but no gold intent provided; fallback rules');
      return recognizeByRules(options.history, options.slots);
    }
    if (this.source === 'rules') {
      return recognizeByRules(options.history, options.slots);
    }
    return this.recognizeByLlm(options.history, options.slots, options.signal);
  }

  private async recognizeByLlm(
    history: LlmMessage[],
    slots: SessionSlots,
    signal: AbortSignal,
  ): Promise<IntentResult> {
    try {
      const raw = await this.chatLlmService.complete(
        buildIntentMessages(history, slots),
        signal,
        { maxTokens: 40 },
      );
      const parsed = parseIntentResult(raw);
      if (parsed) {
        return parsed;
      }
      this.logger.warn(`intent parse fallback rules: ${raw.slice(0, 120)}`);
    } catch (error) {
      this.logger.warn(
        `intent llm failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return recognizeByRules(history, slots);
  }
}

function parseFlag(value: string) {
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
