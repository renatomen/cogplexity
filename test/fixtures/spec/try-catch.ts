// catch is structural; try and finally are ignored (paper p. 7, "Catches").
export function catchWithIf(fn: () => void, a: boolean): void {
  try {
    fn();
  } catch (e) {
    if (a) {
      throw e;
    }
  } finally {
    fn();
  }
}

export function tryFinallyOnly(fn: () => void): void {
  try {
    fn();
  } finally {
    fn();
  }
}
