const FILE_QUEUE_CONTEXT_PATTERN = /(file queue|Error processing file queue entry)/i;
const DB_CLOSED_PATTERN = /(DB has been closed|driver has already been destroyed)/i;

function shouldSilenceConsoleError(args: unknown[]): boolean {
  if (args.length === 0) {
    return false;
  }

  const text = args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}`;
      }
      return String(arg);
    })
    .join(" ");

  return FILE_QUEUE_CONTEXT_PATTERN.test(text) && DB_CLOSED_PATTERN.test(text);
}

export function silenceKnownShutdownNoise(): void {
  const originalConsoleError = console.error.bind(console);

  console.error = (...args: unknown[]) => {
    if (shouldSilenceConsoleError(args)) {
      return;
    }

    originalConsoleError(...args);
  };
}
