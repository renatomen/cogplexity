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

// `return xs.map(...)` is not subject to a structural increment: declarative, the arrow is a root.
export function mapsTernary(xs: number[], a: number, b: number): number[] {
  return xs.map((x) => (x ? a : b));
}

// A call at the top level is not a structural increment either: still declarative.
export function callsThenIterates(xs: number[], flag: boolean, register: (xs: number[]) => void): void {
  register(xs);
  xs.forEach((x) => {
    if (flag) {
      void x;
    }
  });
}

// A logical sequence at the top level is a fundamental increment, not a structural one.
export function logicalThenIterates(xs: number[], a: boolean, b: boolean): void {
  void (a && b);
  xs.forEach((x) => {
    if (a) {
      void x;
    }
  });
}

// Only the outer function is a container: a promoted method nests its own functions like any
// other, so the paper's `Runnable r = () -> { if … }` inside a method (p. 9) still scores 2.
export function faux(): void {
  function method(condition: boolean): void {
    const r = (): void => {
      if (condition) {
        return;
      }
    };
    r();
  }
  method(true);
}

// A top-level ternary is structural: the callback nests inside the function.
export function ternaryThenIterates(xs: number[], a: boolean, b: boolean): number {
  const n = a ? 1 : 0;
  xs.forEach((x) => {
    if (b) {
      void x;
    }
  });
  return n;
}

// A class field initialiser is scored into the enclosing function, so a ternary in one is
// structural there: the sibling arrow field nests instead of being promoted.
export function fieldTernary(flag: boolean): void {
  class Local {
    value = flag ? 1 : 2;
    callback = (): void => {
      if (flag) {
        return;
      }
    };
  }
  void Local;
}

// A parameter default is scored at the function's own level, so a ternary there is structural too.
export function defaultTernary(xs: number[], limit: number = xs.length > 1 ? 1 : 0): number[] {
  return xs.map((x) => {
    if (x > limit) {
      return x;
    }
    return -x;
  });
}

// A static block is a root of its own; one holding a structural statement nests its functions.
export class Checked {
  static enabled = false;
  static {
    if (Checked.enabled) {
      Checked.enabled = false;
    }
    const checked = (): void => {
      if (Checked.enabled) {
        return;
      }
    };
    checked();
  }
}

// A static block with nothing structural of its own is declarative: its function is promoted.
export class Unchecked {
  static {
    const unchecked = (flag: boolean): void => {
      if (flag) {
        return;
      }
    };
    unchecked(true);
  }
}
