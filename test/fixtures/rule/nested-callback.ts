// The outer function scores 19: three points of its own plus sixteen from the callback,
// whose eight ifs each carry one point of nesting (KTD7). No finding sits on the callback.
export function outer(xs: number[], a: boolean, b: boolean, c: boolean): void {
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
