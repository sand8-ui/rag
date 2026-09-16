export const EMBEDDING_DIMENSIONS = 1024;

export function toVectorLiteral(values: number[]): string {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Vector length ${values.length} !== ${EMBEDDING_DIMENSIONS}`,
    );
  }
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error('Vector contains a non-finite number');
    }
  }
  return `[${values.join(',')}]`;
}
