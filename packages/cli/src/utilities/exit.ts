/**
 * Exits once stdout and stderr took everything written so far. `process.exit()`
 * right after writing drops output that is still buffered for a pipe, e.g. in
 * CI logs or `inlang check --format json > report.json`.
 */
export async function exit(code: number): Promise<never> {
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) => new Promise((resolve) => stream.write("", resolve)),
    ),
  );
  process.exit(code);
}
