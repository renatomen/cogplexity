// Sequential ifs at nesting 0, one point each: scores sit on both sides of the default
// threshold (15) and of the bare-number override under test (20). A score equal to the
// threshold does not fire (KTD3).
export function score15(a: boolean): number {
  let n = 0;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  return n;
}

export function score16(a: boolean): number {
  let n = 0;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  return n;
}

export function score20(a: boolean): number {
  let n = 0;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  return n;
}

export function score21(a: boolean): number {
  let n = 0;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  if (a) n++;
  return n;
}
