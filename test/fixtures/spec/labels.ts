// Jumps to labels are fundamental increments; other jumps are free (paper p. 8, p. 10).
export function sumOfPrimes(max: number): number {
  let total = 0;
  OUT: for (let i = 1; i <= max; ++i) {
    for (let j = 2; j < i; ++j) {
      if (i % j === 0) {
        continue OUT;
      }
    }
    total += i;
  }
  return total;
}

export function plainJumps(xs: number[]): number {
  for (const x of xs) {
    if (x < 0) {
      continue;
    }
    if (x > 10) {
      break;
    }
    return x;
  }
  throw new Error("none");
}

export function labelledBreak(xs: number[][]): number {
  let found = -1;
  SEARCH: for (const row of xs) {
    for (const cell of row) {
      if (cell === 0) {
        found = cell;
        break SEARCH;
      }
    }
  }
  return found;
}
