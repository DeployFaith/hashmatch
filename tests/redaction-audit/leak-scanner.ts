export interface TokenLeak {
  path: string;
  token: string;
  value: string;
}

function pathFor(base: string, key: string | number): string {
  if (typeof key === "number") {
    return `${base}[${key}]`;
  }
  return base === "$" ? `${base}.${key}` : `${base}.${key}`;
}

export function findPrivateKeys(value: unknown, basePath = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findPrivateKeys(entry, pathFor(basePath, index)));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const matches: string[] = [];
    for (const [key, entryValue] of entries) {
      const nextPath = pathFor(basePath, key);
      if (key.startsWith("_private")) {
        matches.push(nextPath);
      }
      matches.push(...findPrivateKeys(entryValue, nextPath));
    }
    return matches;
  }

  return [];
}

export function findForbiddenTokens(value: unknown, tokens: string[], basePath = "$"): TokenLeak[] {
  const hits: TokenLeak[] = [];

  if (typeof value === "string") {
    for (const token of tokens) {
      if (value.includes(token)) {
        hits.push({ path: basePath, token, value });
      }
    }
    return hits;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      hits.push(...findForbiddenTokens(value[i], tokens, pathFor(basePath, i)));
    }
    return hits;
  }

  if (value && typeof value === "object") {
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = pathFor(basePath, key);
      for (const token of tokens) {
        if (key.includes(token)) {
          hits.push({ path: nextPath, token, value: key });
        }
      }
      hits.push(...findForbiddenTokens(entryValue, tokens, nextPath));
    }
  }

  return hits;
}
