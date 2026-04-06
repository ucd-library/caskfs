#! /usr/bin/env -S node

import { Command } from 'commander';
import { exec } from 'child_process';
import { optsWrapper, handleGlobalOpts } from './opts-wrapper.js';
import environment from '../lib/environment.js';

const program = new Command();
optsWrapper(program);

/**
 * @function decodeJwtPayload
 * @description Decode the payload section of a JWT without verifying the signature.
 * Used only for display purposes (username, expiry).
 * @param {String} token - JWT string
 * @returns {Object}
 */
function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'));
  } catch(e) {
    return {};
  }
}

/**
 * @function openBrowser
 * @description Open a URL in the system default browser.
 * @param {String} url
 */
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'start'
    : process.platform === 'darwin' ? 'open'
    : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

/**
 * @function discoverOidc
 * @description Fetch the OIDC discovery document and return the endpoints needed
 * for the Device Authorization Grant flow.
 * @param {String} authUrl - OIDC issuer base URL
 * @returns {Promise<{deviceAuthorizationEndpoint: String, tokenEndpoint: String}>}
 */
async function discoverOidc(authUrl) {
  const discoveryUrl = `${authUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const res = await fetch(discoveryUrl);
  if (!res.ok) throw new Error(`OIDC discovery failed (${res.status}): ${discoveryUrl}`);
  const doc = await res.json();
  if (!doc.device_authorization_endpoint) {
    throw new Error('OIDC provider does not support Device Authorization Grant (RFC 8628)');
  }
  return {
    deviceAuthorizationEndpoint: doc.device_authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
  };
}

program.command('login')
  .description('Log in via OIDC Device Authorization Grant (RFC 8628)')
  .option('--headless', 'Print the verification URL instead of opening the browser', false)
  .option('--auth-url <url>', 'OIDC issuer base URL (overrides server-advertised value)')
  .option('--client-id <id>', 'OIDC client ID (overrides server-advertised value)')
  .action(async (options) => {
    handleGlobalOpts(options);

    const env = options.environment;
    if (!env || env.config?.type !== 'http') {
      console.error('Error: "cask auth login" requires an active http environment.');
      console.error('Set one with: cask env activate <name>  (or: cask -e <name> auth login)');
      process.exit(1);
    }

    const { config } = env;
    const baseUrl = `${config.host}${config.path || '/api'}`;

    // Resolve authUrl + clientId.
    // CLI flags take precedence; fall back to server-advertised values.
    let authUrl  = options.authUrl;
    let clientId = options.clientId;

    if (!authUrl || !clientId) {
      try {
        const res = await fetch(`${baseUrl}/system/auth-info`);
        if (res.ok) {
          const info = await res.json();
          if (!authUrl)  authUrl  = info.authUrl;
          if (!clientId) clientId = info.clientId;
        }
      } catch(e) {
        // server may not have OIDC configured; user must supply flags
      }
    }

    if (!authUrl || !clientId) {
      console.error('Error: OIDC auth URL and client ID are required.');
      console.error('Either configure them on the server (CASKFS_OIDC_URL / CASKFS_OIDC_CLIENT_ID)');
      console.error('or supply them directly:');
      console.error('  cask auth login --auth-url <issuer-url> --client-id <client-id>');
      process.exit(1);
    }

    // Discover device authorization + token endpoints
    let endpoints;
    try {
      endpoints = await discoverOidc(authUrl);
    } catch(e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }

    // Request a device code
    const deviceRes = await fetch(endpoints.deviceAuthorizationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: 'openid profile email' }),
    });

    if (!deviceRes.ok) {
      const err = await deviceRes.text();
      console.error(`Error: device authorization request failed: ${err}`);
      process.exit(1);
    }

    const {
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      expires_in,
      interval = 5,
    } = await deviceRes.json();

    const verifyUrl = verification_uri_complete || verification_uri;

    console.log('');
    console.log(`  Go to:  ${verification_uri}`);
    console.log(`  Code:   ${user_code}`);
    console.log('');
    console.log(`  Or open directly (code pre-filled):`);
    console.log(`  ${verifyUrl}`);
    console.log('');

    if (!options.headless) {
      openBrowser(verifyUrl);
    }

    // Poll for the token
    const deadline    = Date.now() + expires_in * 1000;
    const pollMs      = interval * 1000;
    let tokenData     = null;
    let backoffMs     = pollMs;

    process.stdout.write('Waiting for authorization');

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, backoffMs));
      process.stdout.write('.');

      const tokenRes = await fetch(endpoints.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth2:grant-type:device_code',
          client_id:   clientId,
          device_code,
        }),
      });

      const body = await tokenRes.json();

      if (tokenRes.ok) {
        tokenData = body;
        break;
      }

      if (body.error === 'authorization_pending') {
        backoffMs = pollMs; // reset any slow_down back-off
        continue;
      }
      if (body.error === 'slow_down') {
        backoffMs += 5000;
        continue;
      }

      // Any other error (access_denied, expired_token, …) is terminal
      process.stdout.write('\n');
      console.error(`\nError: ${body.error_description || body.error}`);
      process.exit(1);
    }

    process.stdout.write('\n');

    if (!tokenData) {
      console.error('Error: login timed out — device code expired.');
      process.exit(1);
    }

    const claims   = decodeJwtPayload(tokenData.access_token);
    const username = claims.preferred_username || claims.email || claims.sub || '(unknown)';
    const expiry   = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    const updatedConfig = { ...config, token: tokenData.access_token, tokenUsername: username };
    if (expiry) updatedConfig.tokenExpiry = expiry;

    environment.saveEnv(env.name, updatedConfig);

    console.log(`\nLogged in as: ${username}`);
    if (expiry) console.log(`Token expires: ${new Date(expiry).toLocaleString()}`);
  });

program.command('logout')
  .description('Remove saved credentials from the active environment')
  .action((options) => {
    handleGlobalOpts(options);

    const env = options.environment;
    if (!env) {
      console.error('Error: no active environment.');
      process.exit(1);
    }

    const updated = { ...env.config };
    delete updated.token;
    delete updated.tokenExpiry;
    delete updated.tokenUsername;

    environment.saveEnv(env.name, updated);
    console.log(`Logged out of "${env.name}".`);
  });

program.parse(process.argv);
