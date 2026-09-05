// Known complexity 2 (an if with an else): the rule must report it at threshold 1 (R28).
export function branch(a: boolean): number {
  if (a) {
    return 1;
  } else {
    return 2;
  }
}
