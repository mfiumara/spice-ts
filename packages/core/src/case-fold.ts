/**
 * ngspice lower-cases every netlist token (inpcom.c), so node, element,
 * model and subcircuit names are case-insensitive. These containers keep the
 * first spelling seen as the display name and resolve every other spelling
 * to it (#728, #754).
 */

const fold = (name: string): string => name.toLowerCase();

/** Set of names where `F` and `f` are one entry, displayed as first added. */
export class CaseFoldedNameSet extends Set<string> {
  private readonly display = new Map<string, string>();

  override add(name: string): this {
    this.addCanonical(name);
    return this;
  }

  /**
   * Add `name` and return its display spelling (the first spelling added),
   * folding the name once: `add(name)` followed by `canonical(name)`.
   */
  addCanonical(name: string): string {
    const key = fold(name);
    const spelling = this.display.get(key);
    if (spelling !== undefined) return spelling;
    this.display.set(key, name);
    super.add(name);
    return name;
  }

  override has(name: string): boolean {
    return this.display.has(fold(name));
  }

  override delete(name: string): boolean {
    const key = fold(name);
    const spelling = this.display.get(key);
    if (spelling === undefined) return false;
    this.display.delete(key);
    return super.delete(spelling);
  }

  override clear(): void {
    this.display.clear();
    super.clear();
  }

  /** The display spelling of `name`, or `name` itself when it is not present. */
  canonical(name: string): string {
    return this.display.get(fold(name)) ?? name;
  }
}

/**
 * Map whose keys compare case-insensitively; iteration yields the first
 * spelling set. Construct empty (Map's constructor would call set() before
 * the fields exist).
 */
export class CaseInsensitiveMap<V> extends Map<string, V> {
  private readonly display = new Map<string, string>();

  override get(name: string): V | undefined {
    const spelling = this.display.get(fold(name));
    return spelling === undefined ? undefined : super.get(spelling);
  }

  override has(name: string): boolean {
    return this.display.has(fold(name));
  }

  override set(name: string, value: V): this {
    const key = fold(name);
    let spelling = this.display.get(key);
    if (spelling === undefined) {
      spelling = name;
      this.display.set(key, name);
    }
    return super.set(spelling, value);
  }

  override delete(name: string): boolean {
    const key = fold(name);
    const spelling = this.display.get(key);
    if (spelling === undefined) return false;
    this.display.delete(key);
    return super.delete(spelling);
  }

  override clear(): void {
    this.display.clear();
    super.clear();
  }
}

/** `map.get(name)`, falling back to a case-insensitive key match. */
export function getCaseInsensitive<V>(map: ReadonlyMap<string, V>, name: string): V | undefined {
  const exact = map.get(name);
  if (exact !== undefined) return exact;
  const key = fold(name);
  for (const [candidate, value] of map) {
    if (fold(candidate) === key) return value;
  }
  return undefined;
}
