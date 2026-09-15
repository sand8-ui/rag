import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, interval, map, take } from 'rxjs';

@Injectable()
export class ChatService {
  stream(question?: string): Observable<MessageEvent> {
    const topic = question?.trim() || '酒店预订';
    const chunks = [
      `已收到你的问题：「${topic}」。`,
      '这是 SSE 占位回复，',
      '后续会接入 RAG 检索与真实大模型，',
      '用于回答退改政策、房型与入住问题。',
    ];

    return interval(220).pipe(
      take(chunks.length),
      map((index) => ({
        data: {
          token: chunks[index],
          done: index === chunks.length - 1,
        },
      })),
    );
  }
}
