// if / else if / else: structural + hybrid increments (paper p. 6, Appendix B).
export function chain(a: boolean, b: boolean): number {
  if (a) {
    return 1;
  } else if (b) {
    return 2;
  } else {
    return 3;
  }
}

export function nestedInElse(a: boolean, b: boolean): number {
  if (a) {
    return 1;
  } else {
    if (b) {
      return 2;
    }
  }
  return 3;
}
