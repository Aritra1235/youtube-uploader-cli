import { google } from 'googleapis';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OAuth2Client } from 'google-auth-library';
import { logger } from './utils/logger.js';

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  privacy: 'public' | 'private' | 'unlisted';
  categoryId: string; // e.g., '22' for People & Blogs
}

export async function uploadVideo(
  filePath: string,
  metadata: VideoMetadata,
  auth: OAuth2Client,
  onProgress: (progress: number) => void
): Promise<string> {
  // Validate file exists and is readable
  if (!fs.existsSync(filePath)) {
    const error = new Error('File not found: ' + filePath);
    logger.logUploadError(error, filePath);
    throw error;
  }

  const stats = fs.statSync(filePath);
  if (stats.isDirectory()) {
    const error = new Error('Path is a directory, not a file: ' + filePath);
    logger.logUploadError(error, filePath);
    throw error;
  }

  if (!stats.isFile()) {
    const error = new Error('Path is not a regular file: ' + filePath);
    logger.logUploadError(error, filePath);
    throw error;
  }

  logger.logFileValidation(filePath, true);
  logger.logMetadataValidation(metadata, true);
  logger.logUploadStart(filePath, {
    title: metadata.title,
    privacy: metadata.privacy,
    categoryId: metadata.categoryId,
  });

  const youtube = google.youtube({ version: 'v3', auth });

  const fileSize = stats.size;
  const requestBody = {
    snippet: {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: metadata.categoryId,
    },
    status: {
      privacyStatus: metadata.privacy,
    },
  };

  const media = {
    body: fs.createReadStream(filePath),
  };

  logger.debug('API Request Details', {
    endpoint: 'youtube.videos.insert',
    part: ['snippet', 'status'],
    requestBody,
    mediaSize: fileSize,
    mediaFormat: path.extname(filePath),
  });

  return new Promise((resolve, reject) => {
    youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody,
        media,
      },
      {
        onUploadProgress: (evt: any) => {
          const progress = (evt.bytesRead / fileSize) * 100;
          logger.logUploadProgress(progress, filePath);
          onProgress(progress);
        },
      },
      (err: any, response: any) => {
        if (err) {
          logger.error('YouTube API Error Response', err, {
            filePath,
            errorCode: err.code,
            errorStatus: err.status,
            errorMessage: err.message,
            errorDetails: err.errors,
            fullError: JSON.stringify(err, null, 2),
          });
          logger.logUploadError(err, filePath);
          reject(err);
          return;
        }
        if (response?.data?.id) {
          const videoId = response.data.id;
          logger.debug('YouTube API Success Response', {
            videoId,
            status: response.status,
            statusText: response.statusText,
          });
          logger.logUploadSuccess(videoId, filePath);
          resolve(videoId);
        } else {
          const error = new Error('Upload failed: No video ID returned');
          logger.error('YouTube API Response Invalid', error, {
            filePath,
            responseData: response?.data,
            fullResponse: JSON.stringify(response, null, 2),
          });
          logger.logUploadError(error, filePath);
          reject(error);
        }
      }
    );
  });
}