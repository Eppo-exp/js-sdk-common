// pause execution for a given number of milliseconds
export async function waitForMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function shallowClone<T>(original: T): T {
  return Object.assign(Object.create(Object.getPrototypeOf(original)), original);
}
