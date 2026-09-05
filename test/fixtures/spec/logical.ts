// AE3: sequences of binary logical operators (paper p. 7-8); null-coalescing ignored (p. 6).
export function andAndOr(a: boolean, b: boolean, c: boolean, d: boolean): boolean {
  return a && b && c || d;
}

export function orAndOr(a: boolean, b: boolean, c: boolean, d: boolean): boolean {
  return a || b && c || d;
}

export function andNotAnd(a: boolean, b: boolean, c: boolean): boolean {
  return a && !(b && c);
}

export function andOrAnd(a: boolean, b: boolean, c: boolean, d: boolean): boolean {
  return a && b || c && d;
}

export function paperMixed(a: boolean, b: boolean, c: boolean, d: boolean, e: boolean, f: boolean): void {
  if (a
      && b && c
      || d || e
      && f) {
    return;
  }
}

export function nullish(a: number | null, b: number): number {
  return a ?? b;
}

export function optionalChain(a?: { b?: { c?: number } }): number | undefined {
  return a?.b?.c;
}

export function asWrapped(a: unknown, b: unknown): boolean {
  return (a as boolean) && (b as boolean);
}

export function nonNullWrapped(a: boolean | null, b: boolean | null): boolean {
  return a! && b!;
}

export function satisfiesWrapped(a: boolean, b: boolean): boolean {
  return (a satisfies boolean) && (b satisfies boolean);
}

export function castedSequence(a: boolean, b: boolean, c: boolean): boolean {
  return ((a && b) as boolean) && c;
}

export function logicalAssignment(a: { x: boolean }, b: boolean): void {
  a.x &&= b;
  a.x ||= b;
  a.x ??= b;
}

export function inCallAndAssignment(a: boolean, b: boolean, log: (v: boolean) => void): boolean {
  const both = a && b;
  log(a || b);
  return both;
}
