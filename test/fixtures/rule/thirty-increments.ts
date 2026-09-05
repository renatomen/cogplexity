// One function scoring 50 through exactly 30 increments (AE6): a five-deep chain of ifs
// (1+2+3+4+5), an if holding ten ifs (1 + 10 x 2), and fourteen sequential ifs (14 x 1).
export function thirty(a: boolean): number {
  let n = 0;
  if (a) {
    if (a) {
      if (a) {
        if (a) {
          if (a) {
            n++;
          }
        }
      }
    }
  }
  if (a) {
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
  }
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
