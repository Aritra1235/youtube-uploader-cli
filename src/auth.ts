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
const TOKEN_REFRESH_SKEW_MS = 60_000; // refresh 1 minute before expiry

type OAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

const readOAuthClientConfig = async (): Promise<OAuthClientConfig> => {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Credentials file not found at: ${CREDENTIALS_PATH}`);
  }

  const content = await fs.promises.readFile(CREDENTIALS_PATH, 'utf8');
  const parsed = JSON.parse(content);
  const clientConfig = parsed.installed || parsed.web;

  if (!clientConfig) {
    throw new Error('Invalid credentials.json format: missing "installed" or "web" key.');
  }

  const { client_id: clientId, client_secret: clientSecret, redirect_uris: redirectUris } = clientConfig;

  if (!clientId || !clientSecret || !redirectUris || redirectUris.length === 0) {
    throw new Error('credentials.json is missing client_id, client_secret, or redirect_uris.');
  }

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUris[0],
  };
};

const isAccessTokenExpired = (tokens?: Credentials): boolean => {
  if (!tokens?.expiry_date) return false;
  return tokens.expiry_date <= Date.now() + TOKEN_REFRESH_SKEW_MS;
};

const persistTokens = async (client: OAuth2Client, config: OAuthClientConfig): Promise<void> => {
  const payload = {
    type: 'authorized_user',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    refresh_token: client.credentials.refresh_token,
    access_token: client.credentials.access_token,
    expiry_date: client.credentials.expiry_date,
    scope: client.credentials.scope,
    token_type: client.credentials.token_type,
    id_token: client.credentials.id_token,
  };

  await fs.promises.mkdir(path.dirname(TOKENS_PATH), { recursive: true });
  await fs.promises.writeFile(TOKENS_PATH, JSON.stringify(payload));
};

const loadCachedClient = async (): Promise<{ client: OAuth2Client; config: OAuthClientConfig; needsUpgrade: boolean } | null> => {
  if (!fs.existsSync(TOKENS_PATH)) {
    return null;
  }

  try {
    const content = await fs.promises.readFile(TOKENS_PATH, 'utf8');
    const tokens = JSON.parse(content);
    const configFromTokens =
      tokens.client_id && tokens.client_secret
        ? ({
            clientId: tokens.client_id,
            clientSecret: tokens.client_secret,
            redirectUri: tokens.redirect_uri || tokens.redirectUri || 'http://localhost',
          } as OAuthClientConfig)
        : null;

    const config = configFromTokens || (await readOAuthClientConfig());
    const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
    client.setCredentials(tokens);

    const needsUpgrade = !configFromTokens || !tokens.redirect_uri || !tokens.type;
    return { client, config, needsUpgrade };
  } catch (error) {
    logger.warn('Failed to read cached credentials, falling back to auth flow', {
      tokensPath: TOKENS_PATH,
      error: (error as Error).message,
    });
    return null;
  }
};

const refreshClientTokens = async (client: OAuth2Client, config: OAuthClientConfig): Promise<void> => {
  if (!client.credentials.refresh_token) {
    throw new Error('No refresh token available. Please log in again.');
  }

  const { credentials: refreshedTokens } = await client.refreshAccessToken();
  const newTokens = { ...client.credentials, ...refreshedTokens };
  client.setCredentials(newTokens);
  await persistTokens(client, config);

  logger.info('Token refreshed and saved', {
    tokensPath: TOKENS_PATH,
    newExpiryDate: newTokens.expiry_date ? new Date(newTokens.expiry_date) : undefined,
  });
};

const runAuthenticationFlow = async (): Promise<{ client: OAuth2Client; config: OAuthClientConfig }> => {
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
  const client = auth as unknown as OAuth2Client;
  const config = await readOAuthClientConfig();

  if (!client.credentials) {
    throw new Error('No credentials returned from authentication flow.');
  }

  await persistTokens(client, config);
  logger.info('Saved credentials to cache', {
    tokensPath: TOKENS_PATH,
  });
  logger.logAuthSuccess();

  return { client, config };
};

export async function authorize(): Promise<OAuth2Client> {
  logger.logAuthStart();

  try {
    const cached = await loadCachedClient();

    if (cached?.client) {
      let { client, config, needsUpgrade } = cached;
      logger.info('Using existing cached credentials', {
        tokensPath: TOKENS_PATH,
        hasRefreshToken: Boolean(client.credentials.refresh_token),
      });

      // upgrade legacy token file that lacks client details
      if (needsUpgrade) {
        await persistTokens(client, config);
      }

      if (isAccessTokenExpired(client.credentials)) {
        logger.info('Access token expired, refreshing...', {
          expiryDate: client.credentials.expiry_date ? new Date(client.credentials.expiry_date) : undefined,
        });

        try {
          await refreshClientTokens(client, config);
        } catch (refreshError) {
          logger.warn('Token refresh failed, re-running authentication flow', {
            error: (refreshError as Error).message,
          });
          const fresh = await runAuthenticationFlow();
          client = fresh.client;
          config = fresh.config;
        }
      }

      if (!client.credentials) {
        const error = new Error('No valid credentials found. Run auth flow first.');
        logger.logAuthError(error);
        throw error;
      }

      logger.logAuthSuccess();
      return client;
    }

    // No cached credentials, start auth flow
    const { client } = await runAuthenticationFlow();
    return client;
  } catch (error) {
    logger.logAuthError(error);
    throw error;
  }
}