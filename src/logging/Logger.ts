export type LogLevel = "debug" | "info" | "warn" | "error" | "off";

// Power Shell example: $env:LOG_LEVEL = "debug"

export interface Logger {
  level: LogLevel;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  off: 99,
  error: 3,
  warn: 2,
  info: 1,
  debug: 0,
};

class ConsoleLogger implements Logger {
  constructor(public level: LogLevel) {}

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog("debug")) console.error(...args);
  }

  info(...args: unknown[]): void {
    if (this.shouldLog("info")) console.error(...args);
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog("warn")) console.error(...args);
  }

  error(...args: unknown[]): void {
    if (this.shouldLog("error")) console.error(...args);
  }
}

class NullLogger implements Logger {
  level: LogLevel = "off";
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

const level = (process.env.LOG_LEVEL ?? "off") as LogLevel;

export const logger: Logger =
  level === "off" ? new NullLogger() : new ConsoleLogger(level);
