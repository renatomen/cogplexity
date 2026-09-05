// AE4: each function in a recursion cycle, direct or indirect, gets +1 (paper p. 8).
export function countDown(n: number): void {
  countDown(n - 1);
}

export function ping(n: number): void {
  pong(n);
}

export function pong(n: number): void {
  ping(n);
}

// The call resolves to the inner declaration, which shadows the outer one.
export function shadowedByInner(): void {
  function shadowedByInner(): void {}
  shadowedByInner();
}

export function shadowLocal(x: () => void): void {
  const shadowLocal = x;
  shadowLocal();
}

export function shadowParam(shadowParam: () => void): void {
  shadowParam();
}

export class Alpha {
  m(): void {
    this.m();
  }
}

// Same method names in two classes: the this-calls never cross classes.
export class Gamma {
  m(): void {
    this.n();
  }
  n(): void {}
}

export class Delta {
  m(): void {}
  n(): void {
    this.m();
  }
}

// `this` is rebound inside a non-arrow function expression.
export class Epsilon {
  m(): void {
    const rebound = function (this: Epsilon): void {
      this.m();
    };
    rebound.call(this);
  }
}

export function aliased(): void {
  const alias = aliased;
  alias();
}

export function viaCall(): void {
  viaCall.call(null);
}

export function asArgument(run: (fn: () => void) => void): void {
  run(asArgument);
}

export const viaVariable = (n: number): number => {
  return viaVariable(n - 1);
};

export const object = {
  up(n: number): number {
    return this.down(n + 1);
  },
  down(n: number): number {
    return this.up(n - 1);
  },
};
