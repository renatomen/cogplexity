// Nested functions add nothing but raise the nesting level (paper p. 9).
export function withCallback(xs: number[], a: boolean): void {
  xs.forEach((x) => {
    if (a) {
      void x;
    }
  });
}

export function classMembers(a: boolean, b: boolean): void {
  const Local = class {
    field = (): void => {
      if (a) {
        return;
      }
    };
    static {
      if (b) {
        void b;
      }
    }
  };
  void Local;
}

export function empty(): void {}

export function namedShapes(): void {
  void 0;
  const fromVariable = function (): void {};
  const arrow = (): void => {};
  const obj = {
    method(): void {},
    prop: function (): void {},
  };
  obj.assigned = function (): void {};
  void [fromVariable, arrow];
}
