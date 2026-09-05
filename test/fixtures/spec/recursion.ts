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

interface Tree {
  children: Tree[];
}

// A root in a cycle through its nested helper: the root's own increment sits on its direct call
// to the helper, the helper's on its call back to the root, which the root receives once as well.
export function walk(node: Tree | null): void {
  if (!node) {
    return;
  }
  const visitChildren = (n: Tree): void => {
    for (const child of n.children) walk(child);
  };
  visitChildren(node);
}

// `this.<name>()` never reaches an accessor or the constructor: the method `run` is the callee
// even though a getter and a setter of the same name follow it, and calling the constructor
// through `this` closes no cycle with it.
export class Accessors {
  private ready = false;
  constructor() {
    this.rebuild();
  }
  run(): void {
    if (this.ready) {
      this.run();
    }
  }
  get run(): number {
    return 1;
  }
  set run(value: number) {
    this.ready = Boolean(value);
    this.run();
  }
  rebuild(): void {
    this.constructor();
  }
}

// Static `this.<name>()` resolves among the static members only.
export class StaticCycle {
  static first(n: number): number {
    return this.second(n - 1);
  }
  static second(n: number): number {
    return this.first(n - 1);
  }
}

// The same names as instance members of another class: they never match across classes.
export class InstanceNamesake {
  first(n: number): number {
    return this.second(n);
  }
  second(n: number): number {
    return n;
  }
}

// A static and an instance member calling each other's name: neither `this.<name>()` resolves.
export class KindsApart {
  static go(): void {
    this.step();
  }
  step(): void {
    this.go();
  }
}
