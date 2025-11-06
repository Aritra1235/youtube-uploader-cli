import { authenticate } from '@google-cloud/local-auth';
import type { Credentials } from 'google-auth-library';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { logger } from './utils/logger.js';

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const TOKENS_PATH = path.join(os.homedir(), 'youtube-tokens.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

export async function authorize(): Promise<OAuth2Client> {
  let client: OAuth2Client;
  logger.logAuthStart();

  try {
    if (fs.existsSync(TOKENS_PATH)) {
      logger.info('Using existing cached credentials', {
        tokensPath: TOKENS_PATH,
      });
      const content = await fs.promises.readFile(TOKENS_PATH, 'utf8');
      const tokens: Credentials = JSON.parse(content);
      client = new OAuth2Client();
      client.setCredentials(tokens);
      logger.logAuthSuccess();
    } else {
      logger.info('Initiating new authentication flow', {
        credentialsPath: CREDENTIALS_PATH,
      });

      if (!fs.existsSync(CREDENTIALS_PATH)) {
        const error = new Error(`Credentials file not found at: ${CREDENTIALS_PATH}`);
        logger.logAuthError(error);
        throw error;
      }

      const auth = await authenticate({
        keyfilePath: CREDENTIALS_PATH,
        scopes: SCOPES,
      });
      client = auth as unknown as OAuth2Client;

      if (client.credentials) {
        await fs.promises.mkdir(path.dirname(TOKENS_PATH), { recursive: true });
        await fs.promises.writeFile(TOKENS_PATH, JSON.stringify(client.credentials));
        logger.info('Saved credentials to cache', {
          tokensPath: TOKENS_PATH,
        });
        logger.logAuthSuccess();
      }
    }

    if (!client.credentials) {
      const error = new Error('No valid credentials found. Run auth flow first.');
      logger.logAuthError(error);
      throw error;
    }

    return client;
  } catch (error) {
    logger.logAuthError(error);
    throw error;
  }
}