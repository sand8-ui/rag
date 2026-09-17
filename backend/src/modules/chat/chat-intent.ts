import type { LlmMessage } from './chat-context';
import type { SessionSlots } from './chat-slots';

export const CHAT_INTENTS = [
  'cancel',
  'reschedule',
  'checkin_out',
  'deposit',
  'invoice',
  'pet',
  'price_room',
  'order_lookup',
  'hotel_info',
  'policy_other',
] as const;

export type ChatIntent = (typeof CHAT_INTENTS)[number];
export type IntentSource = 'off' | 'rules' | 'llm' | 'gold';
export type IntentConfidence = 'high' | 'medium' | 'low';

export type IntentResult = {
  intent: ChatIntent | null;
  confidence: IntentConfidence;
  source: IntentSource;
};

export const INTENT_LABELS: Record<ChatIntent, string> = {
  cancel: '取消退改',
  reschedule: '改期',
  checkin_out: '入住退房',
  deposit: '押金',
  invoice: '发票开票',
  pet: '宠物政策',
  price_room: '房价房型',
  order_lookup: '查询订单',
  hotel_info: '酒店介绍交通设施',
  policy_other: '住宿政策',
};

const INTENT_SET = new Set<string>(CHAT_INTENTS);

const RULES: Array<{ intent: ChatIntent; pattern: RegExp }> = [
  { intent: 'cancel', pattern: /取消|退改|退订|退款|不订了/ },
  { intent: 'reschedule', pattern: /改期|改日期|换日期|延期|提前住/ },
  { intent: 'deposit', pattern: /押金|预授权/ },
  { intent: 'invoice', pattern: /发票|开票/ },
  { intent: 'pet', pattern: /宠物|带狗|带猫|小型犬/ },
  { intent: 'price_room', pattern: /房价|房型|多少钱|套房|大床房/ },
  { intent: 'checkin_out', pattern: /入住|退房|超时|提前到|几点到店/ },
  { intent: 'order_lookup', pattern: /我的订单|查一下订单|订单号/ },
  { intent: 'hotel_info', pattern: /怎么去|地铁|停车|泳池|设施|在哪/ },
];

export const INTENT_SYSTEM_PROMPT =
  '你是 StayWise 客服意图分类器。只判断本轮用户在问哪类住宿问题，不要回答问题。' +
  `可选意图：${CHAT_INTENTS.join('、')}。` +
  '一轮只选一个主意图。跟问「那个呢」「押金呢」时结合最近对话和槽位。' +
  '只输出 JSON：{"intent":"cancel","confidence":"high"}。confidence 为 high、medium 或 low。';

export function parseIntentResult(raw: string): IntentResult | null {
  const json = raw.trim().match(/\{[\s\S]*\}/);
  if (!json) {
    return null;
  }
  try {
    const parsed = JSON.parse(json[0]) as {
      intent?: string;
      confidence?: string;
    };
    if (!parsed.intent || !INTENT_SET.has(parsed.intent)) {
      return null;
    }
    const confidence: IntentConfidence =
      parsed.confidence === 'high' || parsed.confidence === 'medium'
        ? parsed.confidence
        : 'low';
    return {
      intent: parsed.intent as ChatIntent,
      confidence,
      source: 'llm',
    };
  } catch {
    return null;
  }
}

export function recognizeByRules(
  history: LlmMessage[],
  slots: SessionSlots,
): IntentResult {
  const users = history
    .filter((message) => message.role === 'user')
    .map((message) => message.content);
  const current = users[users.length - 1] ?? '';
  const previous = users[users.length - 2] ?? '';
  const fromCurrent = matchRules(current);
  if (fromCurrent && !isWeakFollowup(current)) {
    return { intent: fromCurrent, confidence: 'high', source: 'rules' };
  }
  const fromPrevious = matchRules(previous);
  if (fromCurrent) {
    return { intent: fromCurrent, confidence: 'medium', source: 'rules' };
  }
  if (fromPrevious && isWeakFollowup(current)) {
    return { intent: fromPrevious, confidence: 'medium', source: 'rules' };
  }
  const fromTopic = topicToIntent(slots.topic);
  if (fromTopic && isWeakFollowup(current)) {
    return { intent: fromTopic, confidence: 'low', source: 'rules' };
  }
  return { intent: 'policy_other', confidence: 'low', source: 'rules' };
}

export function buildIntentMessages(
  history: LlmMessage[],
  slots: SessionSlots,
): LlmMessage[] {
  const recent = history
    .filter((message) => message.role !== 'system')
    .slice(-4);
  const slotLine = [
    slots.hotelName ? `酒店=${slots.hotelName}` : '',
    slots.orderId ? `订单号=${slots.orderId}` : '',
    slots.checkIn ? `入住=${slots.checkIn}` : '',
    slots.topic ? `槽位主题=${slots.topic}` : '',
  ]
    .filter(Boolean)
    .join('；');
  return [
    { role: 'system', content: INTENT_SYSTEM_PROMPT },
    ...(slotLine
      ? [{ role: 'system' as const, content: `当前槽位：${slotLine}` }]
      : []),
    ...recent,
  ];
}

export function rewriteRetrieveQuery(
  query: string,
  intent: ChatIntent | null,
  slots: SessionSlots,
): string {
  const extras = [
    intent ? INTENT_LABELS[intent] : '',
    slots.hotelName,
    slots.checkIn,
    slots.checkOut,
  ].filter((item): item is string => Boolean(item));
  if (extras.length === 0) {
    return query;
  }
  return `${query} ${extras.join(' ')}`;
}

export function goldIntent(intent: ChatIntent): IntentResult {
  return { intent, confidence: 'high', source: 'gold' };
}

function matchRules(text: string): ChatIntent | null {
  return RULES.find((rule) => rule.pattern.test(text))?.intent ?? null;
}

function isWeakFollowup(text: string) {
  const compact = text.replace(/\s+/g, '');
  return compact.length <= 12 || /^(那|那个|这个|还是|然后)/.test(compact);
}

function topicToIntent(topic?: string): ChatIntent | null {
  if (!topic) {
    return null;
  }
  const found = (Object.entries(INTENT_LABELS) as Array<[ChatIntent, string]>).find(
    ([, label]) => topic.includes(label) || label.includes(topic),
  );
  return found?.[0] ?? null;
}
