import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomBytes } from 'node:crypto';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
  stack?: string;
}

const RUN_LABEL_LENGTH = 12;
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

class Logger {
  private logsDir: string;
  private currentLogFile: string;
  private logLevel: LogLevel = 'INFO';
  private runId: string;
  private runLabel: string;

  constructor() {
    this.runId = this.generateRunId();
    this.runLabel = this.runId.slice(0, RUN_LABEL_LENGTH);
    this.logsDir = this.resolveLogsDirectory();
    this.ensureLogsDirectory();
    this.currentLogFile = this.generateLogFilePath();
    this.writeRunHeader();
  }

  private ensureLogsDirectory(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private resolveLogsDirectory(): string {
    const appDir = 'youtube-uploader-cli';

    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(appData, appDir, 'logs');
    }

    if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Logs', appDir);
    }

    const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(xdgConfigHome, appDir, 'logs');
  }

  private generateRunId(): string {
    // ULID-like sortable identifier with embedded timestamp
    return this.generateUlid();
  }

  private generateUlid(): string {
    const time = Date.now();
    const timePart = this.encodeTime(time, 10);
    const randomPart = this.encodeRandom(16);
    return `${timePart}${randomPart}`;
  }

  private encodeTime(time: number, length: number): string {
    let value = BigInt(time);
    let output = '';
    for (let i = length; i > 0; i--) {
      const mod = Number(value % 32n);
      output = CROCKFORD_ALPHABET[mod] + output;
      value = value / 32n;
    }
    return output;
  }

  private encodeRandom(length: number): string {
    const bytes = randomBytes(length);
    let output = '';
    for (let i = 0; i < length; i++) {
      output += CROCKFORD_ALPHABET[bytes[i] % 32];
    }
    return output;
  }

  private generateLogFilePath(): string {
    return path.join(this.logsDir, `youtube-uploader-${this.runId}.log`);
  }

  private formatTimestamp(date: Date = new Date()): string {
    return date.toISOString();
  }

  private formatLogEntry(entry: LogEntry): string {
    const baseLog = `[${entry.timestamp}] [${entry.level}] [run:${this.runLabel}] ${entry.message}`;
    const parts = [baseLog];

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      parts.push(JSON.stringify(entry.metadata));
    }

    const logLine = parts.join(' ');
    if (entry.stack) {
      return `${logLine}\n${entry.stack}`;
    }
    return logLine;
  }

  private writeToFile(entry: LogEntry): void {
    try {
      const logLine = this.formatLogEntry(entry) + '\n';
      fs.appendFileSync(this.currentLogFile, logLine, 'utf-8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
    };
    return levels[level] >= levels[this.logLevel];
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.debug(`Log level set to ${level}`);
  }

  private writeRunHeader(): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: 'INFO',
      message: 'youtube-uploader-cli run initialized',
      metadata: {
        runId: this.runId,
        runLabel: this.runLabel,
        logFile: this.currentLogFile,
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid,
      },
    };
    this.writeToFile(entry);
  }

  public debug(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog('DEBUG')) return;

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: 'DEBUG',
      message,
      metadata,
    };

    this.writeToFile(entry);
  }

  public info(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog('INFO')) return;

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: 'INFO',
      message,
      metadata,
    };

    this.writeToFile(entry);
  }

  public warn(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog('WARN')) return;

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: 'WARN',
      message,
      metadata,
    };

    this.writeToFile(entry);
  }

  public error(message: string, error?: Error | unknown, metadata?: Record<string, any>): void {
    if (!this.shouldLog('ERROR')) return;

    let errorStack: string | undefined;
    let errorMetadata = metadata || {};

    if (error instanceof Error) {
      errorStack = error.stack;
      errorMetadata = {
        ...errorMetadata,
        errorMessage: error.message,
        errorName: error.name,
      };
    } else if (typeof error === 'object') {
      errorMetadata = { ...errorMetadata, error };
    }

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: 'ERROR',
      message,
      metadata: errorMetadata,
      stack: errorStack,
    };

    this.writeToFile(entry);
  }

  public logUploadStart(filePath: string, metadata: Record<string, any>): void {
    this.info('Video upload started', {
      filePath,
      fileName: path.basename(filePath),
      fileSize: fs.statSync(filePath).size,
      ...metadata,
    });
  }

  public logUploadProgress(progress: number, filePath: string): void {
    this.debug('Upload progress', {
      progress: `${Math.round(progress)}%`,
      filePath,
    });
  }

  public logUploadSuccess(videoId: string, filePath: string): void {
    this.info('Video upload completed successfully', {
      videoId,
      filePath,
      videoUrl: `https://youtu.be/${videoId}`,
    });
  }

  public logUploadError(error: Error | unknown, filePath: string, metadata?: Record<string, any>): void {
    this.error('Video upload failed', error, {
      filePath,
      ...metadata,
    });
  }

  public logAuthStart(): void {
    this.info('Authentication process started');
  }

  public logAuthSuccess(userEmail?: string): void {
    this.info('Authentication successful', {
      userEmail,
    });
  }

  public logAuthError(error: Error | unknown): void {
    this.error('Authentication failed', error);
  }

  public logFileValidation(filePath: string, isValid: boolean, reason?: string): void {
    if (isValid) {
      this.info('File validation passed', {
        filePath,
        fileName: path.basename(filePath),
      });
    } else {
      this.warn('File validation failed', {
        filePath,
        fileName: path.basename(filePath),
        reason,
      });
    }
  }

  public logMetadataValidation(metadata: Record<string, any>, isValid: boolean, errors?: string[]): void {
    if (isValid) {
      this.info('Metadata validation passed', {
        title: metadata.title,
        hasDescription: Boolean(metadata.description),
        tagCount: metadata.tags?.length || 0,
      });
    } else {
      this.warn('Metadata validation failed', {
        errors,
      });
    }
  }

  public logSessionStart(): void {
    this.info('YouTube Uploader CLI session started', {
      platform: process.platform,
      nodeVersion: process.version,
      cwd: process.cwd(),
    });
  }

  public logSessionEnd(exitCode: number = 0): void {
    this.info('YouTube Uploader CLI session ended', {
      exitCode,
      timestamp: new Date().toISOString(),
    });
  }

  public getLogFilePath(): string {
    return this.currentLogFile;
  }

  public getLogs(lines: number = 100): string {
    try {
      const content = fs.readFileSync(this.currentLogFile, 'utf-8');
      const logLines = content.split('\n').filter(line => line.trim());
      return logLines.slice(-lines).join('\n');
    } catch (error) {
      return 'Error reading log file';
    }
  }

  public clearLogs(): void {
    try {
      fs.unlinkSync(this.currentLogFile);
      this.info('Log file cleared');
    } catch (error) {
      this.error('Failed to clear log file', error);
    }
  }

  public archiveOldLogs(daysToKeep: number = 7): void {
    try {
      const files = fs.readdirSync(this.logsDir);
      const now = new Date();
      const archiveDir = path.join(this.logsDir, 'archive');

      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }

      files.forEach(file => {
        const filePath = path.join(this.logsDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

        if (fileAge > daysToKeep && file.startsWith('youtube-uploader-')) {
          const archivePath = path.join(archiveDir, file);
          fs.renameSync(filePath, archivePath);
          this.debug('Archived old log file', { file });
        }
      });
    } catch (error) {
      this.error('Failed to archive old logs', error);
    }
  }
}

export const logger = new Logger();
