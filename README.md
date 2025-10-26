# youtube-uploader-cli

A modern CLI tool for uploading videos to YouTube with an interactive terminal UI built with React and Ink.

## Features

- **Main Menu Navigation**: Easy-to-use menu system for all operations
- **YouTube Authentication**: Secure OAuth2-based login with credentials storage
- **Video Upload**: Upload MP4, MOV, AVI, or WMV video files
- **Metadata Management**: Add title, description, tags, and category
- **Privacy Controls**: Set videos as public, private, or unlisted
- **Progress Tracking**: Real-time upload progress visualization
- **Help System**: Built-in help and documentation

## Installation

To install dependencies:

```bash
bun install
```

## Setup

1. Create a Google Cloud project and enable the YouTube API v3
2. Create OAuth 2.0 credentials (Desktop application)
3. Download the credentials JSON file and place it in the project root as `credentials.json`

## Running the Application

```bash
bun run src/index.tsx
```

## Usage

### Main Menu Options

1. **Upload Video**: Start the video upload workflow
2. **Login to YouTube**: Authenticate with your Google account
3. **Help**: View detailed help and documentation
4. **Exit**: Close the application

### Upload Workflow

1. Select a video file from your current directory
2. Enter video title
3. Enter video description
4. Add tags (comma-separated)
5. Select privacy level (public, private, unlisted)
6. Confirm and upload

### Authentication

- First run of upload will prompt you to authenticate
- Browser window opens for Google account login
- Credentials are saved locally for future sessions
- Token file stored at: `~/.youtube-tokens.json`

## Project Structure

```
src/
  - index.tsx    : Main UI and application logic
  - auth.ts      : YouTube OAuth2 authentication
  - uploader.ts  : Video upload functionality
```

## Technologies

- **Runtime**: [Bun](https://bun.com) - Fast JavaScript runtime
- **UI Framework**: React with [Ink](https://github.com/vadimdemedes/ink)
- **Authentication**: Google Auth Library & Google Cloud Local Auth
- **API**: YouTube Data API v3

## Requirements

- Bun runtime
- Node.js compatible environment
- credentials.json from Google Cloud Console
- Video file (MP4, MOV, AVI, or WMV)

This project was created using `bun init` in bun v1.3.0.
