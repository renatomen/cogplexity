// Appendix A, JavaScript: a purely declarative outer function is ignored (paper p. 14).
export function declarative(bar: { myFun?: (condition: boolean) => void }): void {
  let foo: number;
  bar.myFun = function (condition: boolean): void {
    if (condition) {
      foo = 1;
    }
  };
}

export function nonDeclarative(bar: { myFun?: (c: boolean) => void }, condition: boolean): void {
  let foo: number;
  if (condition) {
    foo = 0;
  }
  bar.myFun = function (c: boolean): void {
    if (c) {
      foo = 1;
    }
  };
}

export function container(): void {
  function promoted(a: boolean, b: boolean, c: boolean): void {
    if (a) {
      if (b) {
        void c;
      }
    }
    void (a && b);
  }
}

export function mapsTernary(xs: number[], a: number, b: number): number[] {
  return xs.map((x) => (x ? a : b));
}
