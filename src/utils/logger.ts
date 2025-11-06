import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
  stack?: string;
}

class Logger {
  private logsDir: string;
  private currentLogFile: string;
  private logLevel: LogLevel = 'INFO';

  constructor() {
    this.logsDir = path.join(process.cwd(), 'logs');
    this.ensureLogsDirectory();
    this.currentLogFile = this.getLogFilePath();
  }

  private ensureLogsDirectory(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private getLogFilePath(): string {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.logsDir, `youtube-uploader-${today}.log`);
  }

  private formatTimestamp(date: Date = new Date()): string {
    return date.toISOString();
  }

  private formatLogEntry(entry: LogEntry): string {
    const baseLog = `[${entry.timestamp}] [${entry.level}] ${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      return `${baseLog} ${JSON.stringify(entry.metadata)}`;
    }

    if (entry.stack) {
      return `${baseLog}\n${entry.stack}`;
    }

    return baseLog;
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

