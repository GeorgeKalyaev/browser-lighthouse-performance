export type LogLevel = 'info' | 'warn' | 'error';

/** Never log tokens, Bearer, cookies, passwords, Authorization headers. */
export const logger = {
  info(message: string): void {
    console.log(message);
  },
  warn(message: string): void {
    console.warn(message);
  },
  error(message: string): void {
    console.error(message);
  },
  blank(): void {
    console.log('');
  },
  section(title: string): void {
    console.log('================================================');
    console.log(title);
    console.log('================================================');
  },
  divider(): void {
    console.log('------------------------------------------------');
  },
};
