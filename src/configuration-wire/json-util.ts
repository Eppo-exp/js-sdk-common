export type JsonString<T> = string & {
  readonly __brand: unique symbol;
  readonly __type: T;
};

export function inflateJsonObject<T>(response: JsonString<T>): T {
  return JSON.parse(response) as T;
}

export function deflateJsonObject<T>(value: T): JsonString<T> {
  return JSON.stringify(value) as JsonString<T>;
}
