const HOTEL_ALIASES = [
  '上海外滩华尔道夫酒店',
  '杭州西溪悦榕庄',
  '成都太古里博舍',
  '北京王府井文华东方',
  '华尔道夫',
  '西溪悦榕庄',
  '太古里博舍',
  '王府井文华东方',
];

const TOPIC_RULES: Array<{ topic: string; pattern: RegExp }> = [
  { topic: '取消退改', pattern: /取消|退改|退订|退房费/ },
  { topic: '改期', pattern: /改期|改日期|换日期/ },
  { topic: '押金', pattern: /押金/ },
  { topic: '入住退房', pattern: /入住|退房|超时|提前到/ },
  { topic: '发票', pattern: /发票|开票/ },
  { topic: '宠物', pattern: /宠物|带狗|带猫/ },
  { topic: '房价房型', pattern: /房价|房型|多少钱|套房|大床房/ },
];

export type SessionSlots = {
  orderId?: string;
  hotelName?: string;
  checkIn?: string;
  checkOut?: string;
  topic?: string;
};

export function asSlots(value: unknown): SessionSlots {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const raw = value as Record<string, unknown>;
  return pickDefined({
    orderId: asString(raw.orderId),
    hotelName: asString(raw.hotelName),
    checkIn: asString(raw.checkIn),
    checkOut: asString(raw.checkOut),
    topic: asString(raw.topic),
  });
}

export function parseSlotsFromText(text: string): SessionSlots {
  const dates = [...text.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((item) => item[0]);
  const labeledOrder =
    text.match(/订单(?:号)?\s*[:：#]?\s*([A-Za-z0-9_-]{6,})/)?.[1] ??
    text.match(/\b(c[a-z0-9]{20,32})\b/)?.[1];
  const hotelName = HOTEL_ALIASES.find((name) => text.includes(name));
  const topic = TOPIC_RULES.find((rule) => rule.pattern.test(text))?.topic;
  const checkIn =
    text.match(/入住[^0-9]{0,6}(\d{4}-\d{2}-\d{2})/)?.[1] ?? dates[0];
  const checkOut =
    text.match(/离店[^0-9]{0,6}(\d{4}-\d{2}-\d{2})/)?.[1] ??
    (dates.length > 1 ? dates[1] : undefined);

  return pickDefined({
    orderId: labeledOrder,
    hotelName,
    checkIn,
    checkOut,
    topic,
  });
}

export function mergeSlots(
  current: SessionSlots,
  incoming: SessionSlots,
): SessionSlots {
  return pickDefined({
    orderId: incoming.orderId ?? current.orderId,
    hotelName: incoming.hotelName ?? current.hotelName,
    checkIn: incoming.checkIn ?? current.checkIn,
    checkOut: incoming.checkOut ?? current.checkOut,
    topic: incoming.topic ?? current.topic,
  });
}

export function collectSlots(texts: string[], stored?: SessionSlots): SessionSlots {
  return texts.reduce(
    (slots, text) => mergeSlots(slots, parseSlotsFromText(text)),
    stored ?? {},
  );
}

export function formatSlots(slots: SessionSlots): string {
  const lines = [
    slots.orderId ? `订单号：${slots.orderId}` : null,
    slots.hotelName ? `酒店：${slots.hotelName}` : null,
    slots.checkIn ? `入住：${slots.checkIn}` : null,
    slots.checkOut ? `离店：${slots.checkOut}` : null,
    slots.topic ? `当前主题：${slots.topic}` : null,
  ].filter((line): line is string => Boolean(line));
  if (lines.length === 0) {
    return '';
  }
  return `【本轮会话槽位】\n${lines.join('\n')}`;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickDefined(slots: SessionSlots): SessionSlots {
  return Object.fromEntries(
    Object.entries(slots).filter(([, value]) => Boolean(value)),
  ) as SessionSlots;
}
