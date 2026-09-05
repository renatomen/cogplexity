// Appendix C, example 3 (paper p. 19): toRegexp, total 20. Ported from Java.
const SPECIAL_CHARS = "()[]^$.{}+|";

function isSlash(ch: string): boolean {
  return ch === "/" || ch === "\\";
}

export function toRegexp(antPattern: string, directorySeparator: string): string {
  const escapedDirectorySeparator = "\\" + directorySeparator;
  let sb = "^";
  let i = antPattern.startsWith("/") || antPattern.startsWith("\\") ? 1 : 0;    // +1 for ||, +1 for ?:
  while (i < antPattern.length) {                                                // +1
    const ch = antPattern.charAt(i);
    if (SPECIAL_CHARS.indexOf(ch) !== -1) {                                      // +2 (nesting = 1)
      sb += "\\" + ch;
    } else if (ch === "*") {                                                     // +1
      if (i + 1 < antPattern.length && antPattern.charAt(i + 1) === "*") {       // +3 (nesting = 2), +1 for &&
        if (i + 2 < antPattern.length && isSlash(antPattern.charAt(i + 2))) {    // +4 (nesting = 3), +1 for &&
          sb += "(?:.*" + escapedDirectorySeparator + "|)";
          i += 2;
        } else {                                                                 // +1
          sb += ".*";
          i += 1;
        }
      } else {                                                                   // +1
        sb += "[^" + escapedDirectorySeparator + "]*?";
      }
    } else if (ch === "?") {                                                     // +1
      sb += "[^" + escapedDirectorySeparator + "]";
    } else if (isSlash(ch)) {                                                    // +1
      sb += escapedDirectorySeparator;
    } else {                                                                     // +1
      sb += ch;
    }
    i++;
  }
  sb += "$";
  return sb;
}                                                                                // total complexity = 20
