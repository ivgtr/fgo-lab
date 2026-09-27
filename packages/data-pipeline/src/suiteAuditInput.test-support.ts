function freezeBorrowed<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeBorrowed(child);
  }
  return value;
}

/** Test-only input owner. Create one owner per input and suite boundary. */
export function createSuiteAuditInput<Master, View>(operations: {
  read: () => Promise<string>;
  parse: (input: unknown) => Master;
  project: (master: Master) => View;
}): () => Promise<Readonly<{ master: Readonly<Master>; view: View }>> {
  let input: Promise<Readonly<{ master: Readonly<Master>; view: View }>> | undefined;
  return () => {
    // Start inside the first consumer's task budget. Retain rejection as well as success:
    // a failed input must not trigger a retry, replacement input or partial projection.
    input ??= Promise.resolve().then(async () => {
      const master = freezeBorrowed(
        operations.parse(JSON.parse(await operations.read()) as unknown),
      );
      const view = freezeBorrowed(operations.project(master));
      // Freeze the borrowed JSON graph once; local arrays derived by consumers remain mutable.
      return Object.freeze({ master, view });
    });
    return input;
  };
}
