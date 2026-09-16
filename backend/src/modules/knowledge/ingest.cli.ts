import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ChunkStrategy } from '@prisma/client';
import { AppModule } from '../../app.module';
import { IngestService } from './ingest.service';
import { RetrieverService } from './retriever.service';

async function main() {
  const logger = new Logger('knowledge-ingest');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const ingest = app.get(IngestService);
    const retriever = app.get(RetrieverService);
    await ingest.run({ force: process.argv.includes('--force') });

    const sample = '超时退房怎么收费';
    const hits = await retriever.retrieve({
      query: sample,
      strategy: ChunkStrategy.heading,
      k: 3,
    });
    logger.log(
      `smoke query 「${sample}」:\n${hits
        .map(
          (hit) =>
            `  ${hit.score.toFixed(3)} ${hit.sourcePath} / ${hit.sectionTitle}`,
        )
        .join('\n')}`,
    );
  } finally {
    await app.close();
  }
}

void main();
