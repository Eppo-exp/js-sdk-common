// Required type shape for `process`.
// We don't pin this project to node so eslint complains about the use of `process`. We declare a type shape here to
// appease the linter.
export declare const process: {
  exit: (code: number) => void;
  env: { [key: string]: string | undefined };
  argv: string[];
};
