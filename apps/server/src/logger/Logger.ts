export interface Logger {
  error(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

export const ConsoleLogger: Logger = {
  error: (message, data) => {
    console.error(message, JSON.stringify(data, null, 2));
  },
  warn: (message, data) => {
    console.warn(message, JSON.stringify(data, null, 2));
  },
  info: (message, data) => {
    console.info(message, JSON.stringify(data, null, 2));
  },
  debug: (message, data) => {
    console.debug(message, JSON.stringify(data, null, 2));
  },
};
