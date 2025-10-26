import { google } from 'googleapis';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OAuth2Client } from 'google-auth-library';

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
    throw new Error('File not found: ' + filePath);
  }

  const stats = fs.statSync(filePath);
  if (stats.isDirectory()) {
    throw new Error('Path is a directory, not a file: ' + filePath);
  }

  if (!stats.isFile()) {
    throw new Error('Path is not a regular file: ' + filePath);
  }

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
          onProgress(progress);
        },
      },
      (err: any, response: any) => {
        if (err) {
          reject(err);
          return;
        }
        if (response?.data?.id) {
          resolve(response.data.id);
        } else {
          reject(new Error('Upload failed: No video ID returned'));
        }
      }
    );
  });
}