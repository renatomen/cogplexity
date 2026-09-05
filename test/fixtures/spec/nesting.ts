// AE2 and the nesting increment (paper p. 9).
export function ifForIf(a: boolean, b: boolean, xs: number[]): void {
  if (a) {
    for (const x of xs) {
      if (b) {
        void x;
      }
    }
  }
}

export function nestedTernary(a: boolean, b: boolean): number {
  return a ? (b ? 1 : 2) : 3;
}

export function everyLoop(xs: number[], o: Record<string, number>): void {
  for (let i = 0; i < xs.length; i++) {
    void i;
  }
  for (const k in o) {
    void k;
  }
  for (const x of xs) {
    void x;
  }
  while (xs.length > 0) {
    xs.pop();
  }
  do {
    xs.push(1);
  } while (xs.length < 3);
}

export async function forAwait(items: AsyncIterable<number>): Promise<void> {
  for await (const item of items) {
    void item;
  }
}
