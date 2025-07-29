type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
  private level: LogLevel;

  constructor() {
    this.level = (process.env.LOG_LEVEL as LogLevel) || "info";
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const prefix = {
      debug: "[DEBUG]",
      info: "[INFO]",
      warn: "[WARN]",
      error: "[ERROR]",
    }[level];
    return `${timestamp} ${prefix} ${message}`;
  }

  info(message: string): void {
    if (this.shouldLog("info")) {
      console.error(this.formatMessage("info", message));
    }
  }

  warn(message: string): void {
    if (this.shouldLog("warn")) {
      console.error(this.formatMessage("warn", message));
    }
  }

  error(message: string): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message));
    }
  }

  debug(message: string): void {
    if (this.shouldLog("debug")) {
      console.error(this.formatMessage("debug", message));
    }
  }
}

export const logger = new Logger();
