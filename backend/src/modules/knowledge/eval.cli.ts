import { readFile } from 'fs/promises';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { EvalService, type GoldenSet } from './eval.service';

async function main() {
  const logger = new Logger('knowledge-eval');
  const goldenPath =
    process.argv[2] ??
    join(process.cwd(), '..', 'knowledge', 'eval', 'golden.json');
  const golden = JSON.parse(await readFile(goldenPath, 'utf8')) as GoldenSet;
  if (!golden.cases?.length) {
    throw new Error(`No cases in ${goldenPath}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const evalService = app.get(EvalService);
    logger.log(`evaluating ${golden.cases.length} cases from ${goldenPath}`);
    const reports = await evalService.run(golden);
    logger.log(`\n${evalService.format(reports)}`);
    await evalService.writeReport(reports);
  } finally {
    await app.close();
  }
}

void main();
