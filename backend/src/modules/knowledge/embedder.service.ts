import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMBED_BATCH_SIZE } from './knowledge.constants';

@Injectable()
export class EmbedderService {
  private readonly logger = new Logger(EmbedderService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly dimensions: number;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (
      this.configService.get<string>('EMBEDDING_BASE_URL') ??
      'http://localhost:11434/v1'
    ).replace(/\/$/, '');
    this.model =
      this.configService.get<string>('EMBEDDING_MODEL') ?? 'bge-m3';
    this.dimensions = Number(
      this.configService.get<string>('EMBEDDING_DIMENSIONS') ?? 1024,
    );
    this.apiKey =
      this.configService.get<string>('EMBEDDING_API_KEY') ?? 'ollama';
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
      const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
      const batchVectors = await this.embedBatch(batch);
      vectors.push(...batchVectors);
      this.logger.log(
        `embedded ${Math.min(start + batch.length, texts.length)}/${texts.length}`,
      );
    }
    return vectors;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Embedding request failed (${response.status}): ${body.slice(0, 500)}`,
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding: number[]; index: number }>;
    };
    if (!payload.data?.length) {
      throw new Error('Embedding response missing data');
    }

    return payload.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((item) => {
        if (item.embedding.length !== this.dimensions) {
          throw new Error(
            `Expected ${this.dimensions}-d embedding, got ${item.embedding.length}`,
          );
        }
        return item.embedding;
      });
  }
}
