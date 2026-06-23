type PlainObject = Record<string, unknown>;

type SnakeToCamel<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<SnakeToCamel<Tail>>}`
  : S;

type CamelToSnake<S extends string> = S extends `${infer Head}${infer Tail}`
  ? Tail extends Uncapitalize<Tail>
    ? `${Lowercase<Head>}${CamelToSnake<Tail>}`
    : `${Lowercase<Head>}_${CamelToSnake<Tail>}`
  : S;

export type CamelCase<T> = T extends readonly (infer Item)[]
  ? CamelCase<Item>[]
  : T extends PlainObject
    ? { [K in keyof T as K extends string ? SnakeToCamel<K> : K]: CamelCase<T[K]> }
    : T;

export type SnakeCase<T> = T extends readonly (infer Item)[]
  ? SnakeCase<Item>[]
  : T extends PlainObject
    ? { [K in keyof T as K extends string ? CamelToSnake<K> : K]: SnakeCase<T[K]> }
    : T;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function camelToSnake(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function transformKeys(obj: unknown, transformFn: (key: string) => string): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => transformKeys(item, transformFn));
  }
  if (isPlainObject(obj)) {
    const result: PlainObject = {};
    for (const [key, value] of Object.entries(obj)) {
      result[transformFn(key)] = transformKeys(value, transformFn);
    }
    return result;
  }
  return obj;
}

export function toApiCase<T>(obj: T): CamelCase<T> {
  return transformKeys(obj, snakeToCamel) as CamelCase<T>;
}

export function toDbCase<T>(obj: T): SnakeCase<T> {
  return transformKeys(obj, camelToSnake) as SnakeCase<T>;
}
