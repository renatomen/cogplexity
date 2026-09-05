// Appendix C, example 1 (paper p. 17): overriddenSymbolFrom, total 19. Ported from Java.
interface JavaSymbol {
  isKind(kind: number): boolean;
  isStatic(): boolean;
}

interface MethodJavaSymbol extends JavaSymbol {
  kind: "method";
}

interface ClassJavaType {
  isUnknown(): boolean;
  lookup(name: string): JavaSymbol[];
}

declare const MTH: number;
declare const unknownMethodSymbol: MethodJavaSymbol;
declare function canOverride(symbol: MethodJavaSymbol): boolean;
declare function checkOverridingParameters(symbol: MethodJavaSymbol, type: ClassJavaType): boolean | null;

export function overriddenSymbolFrom(classType: ClassJavaType, name: string): MethodJavaSymbol | null {
  if (classType.isUnknown()) {                                        // +1
    return unknownMethodSymbol;
  }
  let unknownFound = false;
  const symbols = classType.lookup(name);
  for (const overrideSymbol of symbols) {                             // +1
    if (overrideSymbol.isKind(MTH) && !overrideSymbol.isStatic()) {   // +2 (nesting = 1), +1 for &&
      const methodJavaSymbol = overrideSymbol as MethodJavaSymbol;
      if (canOverride(methodJavaSymbol)) {                            // +3 (nesting = 2)
        const overriding = checkOverridingParameters(methodJavaSymbol, classType);
        if (overriding === null) {                                    // +4 (nesting = 3)
          if (!unknownFound) {                                        // +5 (nesting = 4)
            unknownFound = true;
          }
        } else if (overriding) {                                      // +1
          return methodJavaSymbol;
        }
      }
    }
  }
  if (unknownFound) {                                                 // +1
    return unknownMethodSymbol;
  }
  return null;
}                                                                     // total complexity = 19
