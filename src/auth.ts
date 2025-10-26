import { authenticate } from '@google-cloud/local-auth';
import type { Credentials } from 'google-auth-library';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const TOKENS_PATH = path.join(os.homedir(), 'youtube-tokens.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

export async function authorize(): Promise<OAuth2Client> {
  let client: OAuth2Client;
  if (fs.existsSync(TOKENS_PATH)) {
    const content = await fs.promises.readFile(TOKENS_PATH, 'utf8');
    const tokens: Credentials = JSON.parse(content);
    client = new OAuth2Client();
    client.setCredentials(tokens);
  } else {
    const auth = await authenticate({
      keyfilePath: CREDENTIALS_PATH,
      scopes: SCOPES,
    });
    client = auth as unknown as OAuth2Client;
    if (client.credentials) {
      await fs.promises.mkdir(path.dirname(TOKENS_PATH), { recursive: true });
      await fs.promises.writeFile(TOKENS_PATH, JSON.stringify(client.credentials));
    }
  }
  if (!client.credentials) {
    throw new Error('No valid credentials found. Run auth flow first.');
  }
  return client;
}