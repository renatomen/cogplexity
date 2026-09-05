// Appendix A: a container holding only a declaration is ignored; `inner` becomes a root
// scoring 19 and the finding sits on it, not on `container`.
export function container(xs: number[], a: boolean, b: boolean, c: boolean): void {
  function inner(): void {
    if (a) void a;
    if (b) void b;
    if (c) void c;
    xs.forEach((x) => {
      if (x > 0) void x;
      if (x > 1) void x;
      if (x > 2) void x;
      if (x > 3) void x;
      if (x > 4) void x;
      if (x > 5) void x;
      if (x > 6) void x;
      if (x > 7) void x;
    });
  }
}
