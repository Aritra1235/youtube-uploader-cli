#!/usr/bin/env bun
import React, { useState, useEffect } from 'react';
import { render, Text, Box } from 'ink';
import TextInput  from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { fromEvent } from 'rxjs';
import { authorize } from './auth.js';
import { uploadVideo, type VideoMetadata } from './uploader.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

const SELECT_FILES = 'Select Video File';
const ENTER_TITLE = 'Enter Title';
const ENTER_DESC = 'Enter Description';
const ENTER_TAGS = 'Enter Tags (comma-separated)';
const SELECT_PRIVACY = 'Select Privacy';
const CONFIRM_UPLOAD = 'Ready to Upload?';
const UPLOADING = 'Uploading...';
const SUCCESS = 'Success!';
const ERROR = 'Error';
const MAIN_MENU = 'Main Menu';
const HELP = 'Help';
const LOGIN = 'Login';
const AUTHENTICATING = 'Authenticating...';
const FILE_INPUT_METHOD = 'File Input Method';
const ENTER_FILE_PATH = 'Enter File Path';

interface AppState {
  step: string;
  filePath?: string;
  metadata: Partial<VideoMetadata>;
  progress: number;
  videoId?: string;
  error?: string;
  loading: boolean;
  isAuthenticated: boolean;
  fileInputMode?: 'browse' | 'manual';
}

const privacyOptions = [
  { label: 'Public', value: 'public' as const },
  { label: 'Private', value: 'private' as const },
  { label: 'Unlisted', value: 'unlisted' as const },
];

const categoryOptions = [
  { label: 'Film & Animation (1)', value: '1' },
  { label: 'Autos & Vehicles (2)', value: '2' },
  // Add more categories as needed (full list: https://developers.google.com/youtube/v3/docs/videoCategories/list)
  { label: 'People & Blogs (22)', value: '22' },
  { label: 'Gaming (20)', value: '20' },
];

const mainMenuOptions = [
  { label: 'Upload Video', value: 'upload' },
  { label: 'Login to YouTube', value: 'login' },
  { label: 'Help', value: 'help' },
  { label: 'Exit', value: 'exit' },
];

const fileInputMethodOptions = [
  { label: 'Browse current directory', value: 'browse' },
  { label: 'Enter custom file path', value: 'manual' },
];

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    step: MAIN_MENU,
    metadata: { categoryId: '22' }, // Default category
    progress: 0,
    loading: false,
    isAuthenticated: false,
  });

  useEffect(() => {
    if (state.step === SELECT_FILES && !state.filePath) {
      // Auto-scan current dir for .mp4/.mov files for selection
      const files = fs.readdirSync('.')
        .filter(f => /\.(mp4|mov|avi|wmv)$/i.test(f))
        .map(f => ({ label: f, value: path.resolve(f) }));
      if (files && files.length === 1) {
        // Auto-select if only one file
        setState(s => ({ ...s, filePath: files[0]?.value, step: ENTER_TITLE }));
      }
    }
  }, [state.step, state.filePath]);

  const handleFileSelect = (item: any) => {
    setState(s => ({ ...s, filePath: item.value, step: ENTER_TITLE }));
  };

  const handleTitleChange = (title: string) => {
    setState(s => ({ ...s, metadata: { ...s.metadata, title } }));
  };

  const handleTitleSubmit = () => {
    setState(s => ({ ...s, step: ENTER_DESC }));
  };

  const handleDescChange = (desc: string) => {
    setState(s => ({ ...s, metadata: { ...s.metadata, description: desc } }));
  };

  const handleDescSubmit = () => {
    setState(s => ({ ...s, step: ENTER_TAGS }));
  };

  const handleTagsChange = (tags: string) => {
    setState(s => ({ ...s, metadata: { ...s.metadata, tags: tags.split(',').map(t => t.trim()).filter(Boolean) } }));
  };

  const handleTagsSubmit = () => {
    setState(s => ({ ...s, step: SELECT_PRIVACY }));
  };

  const handlePrivacySelect = (item: any) => {
    setState(s => ({ ...s, metadata: { ...s.metadata, privacy: item.value }, step: CONFIRM_UPLOAD }));
  };

  const handleMainMenuSelect = (item: any) => {
    if (item.value === 'upload') {
      setState(s => ({ ...s, step: FILE_INPUT_METHOD, filePath: undefined }));
    } else if (item.value === 'login') {
      setState(s => ({ ...s, step: LOGIN }));
    } else if (item.value === 'help') {
      setState(s => ({ ...s, step: HELP }));
    } else if (item.value === 'exit') {
      process.exit(0);
    }
  };

  const validateAndSelectFile = (path: string) => {
    try {
      if (!fs.existsSync(path)) {
        setState(s => ({ ...s, error: 'File does not exist', step: ERROR }));
        return;
      }
      const resolvedPath = fs.realpathSync(path);
      setState(s => ({ ...s, filePath: resolvedPath, step: ENTER_TITLE }));
    } catch (err) {
      setState(s => ({ ...s, error: (err as Error).message, step: ERROR }));
    }
  };

  const handleLogin = async () => {
    setState(s => ({ ...s, loading: true, step: AUTHENTICATING, error: undefined }));
    try {
      await authorize();
      setState(s => ({ ...s, isAuthenticated: true, loading: false, step: MAIN_MENU }));
    } catch (err) {
      setState(s => ({ ...s, error: (err as Error).message, loading: false, step: ERROR }));
    }
  };

  const handleBackToMenu = () => {
    setState(s => ({ ...s, step: MAIN_MENU }));
  };

  const handleUpload = async () => {
    if (!state.filePath || !state.metadata.title) {
      setState(s => ({ ...s, error: 'Missing required fields' }));
      return;
    }
    setState(s => ({ ...s, loading: true, step: UPLOADING, error: undefined }));
    try {
      const auth = await authorize();
      const videoId = await uploadVideo(
        state.filePath,
        state.metadata as VideoMetadata,
        auth,
        (progress) => setState(s => ({ ...s, progress }))
      );
      setState(s => ({ ...s, videoId, step: SUCCESS, loading: false }));
    } catch (err) {
      setState(s => ({ ...s, error: (err as Error).message, loading: false, step: ERROR }));
    }
  };

  const renderStep = () => {
    switch (state.step) {
      case MAIN_MENU:
        return (
          <Box flexDirection="column">
            <Text bold underline>YouTube Video Uploader CLI</Text>
            <Text dimColor>v1.0.0</Text>
            <Text></Text>
            <Text bold>Main Menu</Text>
            <SelectInput items={mainMenuOptions} onSelect={handleMainMenuSelect} />
          </Box>
        );
      case HELP:
        return (
          <Box flexDirection="column">
            <Text bold underline>Help and Documentation</Text>
            <Text></Text>
            <Text bold>Features:</Text>
            <Text> - Upload videos to YouTube</Text>
            <Text> - Set privacy level (public, private, unlisted)</Text>
            <Text> - Add title, description, and tags</Text>
            <Text> - Select video category</Text>
            <Text> - Track upload progress in real-time</Text>
            <Text></Text>
            <Text bold>Requirements:</Text>
            <Text> - credentials.json (from YouTube API setup)</Text>
            <Text> - Video file in MP4, MOV, AVI, or WMV format</Text>
            <Text></Text>
            <Text bold>Getting Started:</Text>
            <Text> 1. Select "Login to YouTube" from main menu</Text>
            <Text> 2. Authenticate with your Google account</Text>
            <Text> 3. Select "Upload Video" to begin uploading</Text>
            <Text> 4. Follow the prompts to add metadata</Text>
            <Text></Text>
            <TextInput value="" onChange={() => {}} onSubmit={handleBackToMenu} placeholder="Press Enter to continue..." />
          </Box>
        );
      case LOGIN:
        return (
          <Box flexDirection="column">
            <Text bold>YouTube Authentication</Text>
            <Text></Text>
            <Text>Click Enter to authenticate with your Google account.</Text>
            <Text>A browser window will open for you to authorize this app.</Text>
            <Text></Text>
            <TextInput value="" onChange={() => {}} onSubmit={handleLogin} />
          </Box>
        );
      case AUTHENTICATING:
        return (
          <Box flexDirection="column">
            <Text>{AUTHENTICATING}</Text>
            <Spinner type="dots" />
            <Text>Opening browser for authentication...</Text>
          </Box>
        );
      case FILE_INPUT_METHOD:
        return (
          <Box flexDirection="column">
            <Text bold>Choose File Input Method</Text>
            <Text></Text>
            <SelectInput
              items={fileInputMethodOptions}
              onSelect={(item) => {
                if (item.value === 'browse') {
                  setState(s => ({ ...s, step: SELECT_FILES }));
                } else if (item.value === 'manual') {
                  setState(s => ({ ...s, step: ENTER_FILE_PATH }));
                }
              }}
            />
          </Box>
        );
      case ENTER_FILE_PATH:
        return (
          <Box flexDirection="column">
            <Text bold>Enter File Path</Text>
            <Text dimColor>Enter the full path to your video file:</Text>
            <Text>(Examples: /home/user/video.mp4 or ~/Videos/myfile.mov)</Text>
            <Text></Text>
            <TextInput
              value={state.filePath || ''}
              onChange={(value) => setState(s => ({ ...s, filePath: value }))}
              onSubmit={() => {
                if (!state.filePath || state.filePath.trim() === '') {
                  setState(s => ({ ...s, error: 'Please enter a file path', step: ERROR }));
                } else {
                  validateAndSelectFile(state.filePath);
                }
              }}
            />
          </Box>
        );
      case SELECT_FILES:
        return (
          <Box flexDirection="column">
            <Text bold>Select Video File</Text>
            <Text dimColor>Choose a video from current directory:</Text>
            {(() => {
              const files = fs.readdirSync('.')
                .filter(f => /\.(mp4|mov|avi|wmv)$/i.test(f))
                .map(f => ({ label: f, value: path.resolve(f) }));
              if (files && files.length > 0) {
                return <SelectInput items={files} onSelect={handleFileSelect} />;
              } else {
                return <Text color="red">No video files found in current directory.</Text>;
              }
            })()}
          </Box>
        );
      case ENTER_TITLE:
        return (
          <Box flexDirection="column">
            <Text>Enter video title:</Text>
            <TextInput value={state.metadata.title || ''} onChange={handleTitleChange} onSubmit={handleTitleSubmit} />
          </Box>
        );
      case ENTER_DESC:
        return (
          <Box flexDirection="column">
            <Text>Enter description:</Text>
            <TextInput
              value={state.metadata.description || ''}
              onChange={handleDescChange}
              onSubmit={handleDescSubmit}
            />
          </Box>
        );
      case ENTER_TAGS:
        return (
          <Box flexDirection="column">
            <Text>Enter tags (comma-separated):</Text>
            <TextInput value={(state.metadata.tags || []).join(', ')} onChange={handleTagsChange} onSubmit={handleTagsSubmit} />
          </Box>
        );
      case SELECT_PRIVACY:
        return (
          <Box flexDirection="column">
            <Text>Privacy setting:</Text>
            <SelectInput items={privacyOptions} onSelect={handlePrivacySelect} />
          </Box>
        );
      case CONFIRM_UPLOAD:
        return (
          <Box flexDirection="column">
            <Text>Ready to upload "{state.metadata.title}"?</Text>
            <Text>Press Enter to start or Ctrl+C to cancel.</Text>
            <TextInput value="" onChange={() => {}} onSubmit={handleUpload} showCursor={false} />
          </Box>
        );
      case UPLOADING:
        return (
          <Box flexDirection="column">
            <Text>🔄 {UPLOADING}</Text>
            <Spinner type="dots" />
            <Text>{Math.round(state.progress)}% Complete</Text>
            <Box width={20}><Text>{'█'.repeat(Math.round(state.progress / 5))}{'░'.repeat(20 - Math.round(state.progress / 5))}</Text></Box>
          </Box>
        );
      case SUCCESS:
        return (
          <Box flexDirection="column">
            <Text color="green">{SUCCESS}</Text>
            <Text>Video ID: {state.videoId}</Text>
            <Text>Watch: https://youtu.be/{state.videoId}</Text>
          </Box>
        );
      case ERROR:
        return (
          <Box flexDirection="column">
            <Text color="red">{ERROR}: {state.error}</Text>
            <Text>Press Enter to return to menu or Ctrl+C to exit.</Text>
            <TextInput value="" onChange={() => {}} onSubmit={handleBackToMenu} />
          </Box>
        );
      default:
        return <Text>Unknown step</Text>;
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {renderStep()}
    </Box>
  );
};

if (process.env.NODE_ENV !== 'test') {
  render(<App />);
}