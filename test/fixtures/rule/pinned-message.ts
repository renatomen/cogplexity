// AE2's shape, used once to pin the exact multi-line message text (KTD6).
export function f(a: boolean, b: boolean, xs: number[]): void {
  if (a) {
    for (const x of xs) {
      if (b) {
        void x;
      }
    }
  }
}
