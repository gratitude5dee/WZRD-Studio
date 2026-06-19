type EnvValue = string | boolean | undefined;

type ImportMetaWithEnv = ImportMeta & {
  env?: Record<string, EnvValue>;
};

function clean(value: EnvValue): string | undefined {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (!value || value === "undefined" || value === "null") return undefined;
  return value;
}

function readProcessEnv(key: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return clean(process.env?.[key]);
}

function readViteEnv(key: string): string | undefined {
  const meta = import.meta as ImportMetaWithEnv;
  return clean(meta.env?.[key]);
}

export function readPublicEnv(publicName: string, legacyNames: string[] = []): string | undefined {
  const names = [
    publicName.startsWith("NEXT_PUBLIC_") ? publicName : `NEXT_PUBLIC_${publicName}`,
    ...legacyNames,
    publicName,
  ];

  for (const name of names) {
    const value = readProcessEnv(name) ?? readViteEnv(name);
    if (value) return value;
  }

  return undefined;
}

export function readPublicFlag(
  publicName: string,
  legacyNames: string[] = [],
  fallback = false
): boolean {
  const value = readPublicEnv(publicName, legacyNames);
  if (value === undefined) return fallback;
  return value === "true";
}
