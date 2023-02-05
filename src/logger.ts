export interface Logger {
  error: (text: string, err?: Error) => void;
  info: (text: string, err?: Error) => void;
  warn: (text: string) => void;
  debug: (text: string) => void;
}
