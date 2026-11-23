const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { existsSync, readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { createServer } = require('node:net');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { parseEnv } = require('node:util');

const root = path.resolve(__dirname, '..');
const mobile = path.join(root, 'apps', 'mobile');
const metroPorts = Array.from({ length: 10 }, (_, index) => 8082 + index);
const manifestHeaders = { 'expo-platform': 'ios', accept: 'application/json' };

async function getJson(url, headers, timeout = 1500) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function waitFor(check, timeout) {
  const deadline = Date.now() + timeout;
  do {
    const result = await check();
    if (result) return result;
    await delay(350);
  } while (Date.now() < deadline);
  return null;
}

async function lockStartup() {
  // Windows releases the pipe when the launcher closes, including after an interrupted startup.
  const workspace = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 16);
  const pipe = String.raw`\\.\pipe\mvp-expo-go-${workspace}`;
  const lock = createServer(socket => socket.destroy());
  const acquired = await waitFor(async () => {
    try {
      await once(lock.listen(pipe), 'listening');
      return true;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      return false;
    }
  }, 90_000);
  if (!acquired) throw new Error('Expo Go is still starting in another window.');
  return lock;
}

function getApiUrl(host) {
  const envFile = path.join(root, 'apps', 'api', '.env');
  const filePort = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')).PORT : undefined;
  const port = Number(process.env.PORT ?? filePort ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Set a valid API PORT in apps/api/.env or in the environment.');
  }
  return `http://${host}:${port}`;
}

async function ensureApi(apiUrl) {
  const healthUrl = `${apiUrl}/health`;
  const apiIsReady = async () => (await getJson(healthUrl))?.ok === true;
  if (await apiIsReady()) return;

  console.log(`Starting the local API. Waiting for ${healthUrl}`);
  // cmd's start command needs literal quotes around the window title.
  const api = spawn('cmd.exe', ['/d', '/c', 'start "MVP API" cmd.exe /d /k pnpm.cmd dev:api'], {
    cwd: root,
    stdio: 'inherit',
    windowsVerbatimArguments: true,
  });
  const [code] = await once(api, 'exit');
  if (code !== 0) throw new Error('Could not open the MVP API window.');

  if (!(await waitFor(apiIsReady, 30_000))) {
    throw new Error(`API did not respond at ${healthUrl}. Check the MVP API window for details.`);
  }
}

async function metroMatches(host, port, apiUrl) {
  const manifest = await getJson(`http://${host}:${port}`, manifestHeaders, 4000);
  const expoGo = manifest?.extra?.expoGo;
  const projectRoot = expoGo?.developer?.projectRoot;
  return typeof projectRoot === 'string'
    && path.resolve(projectRoot).toLowerCase() === mobile.toLowerCase()
    && expoGo.debuggerHost === `${host}:${port}`
    && manifest.extra.expoClient?.extra?.expoGoApiUrl === apiUrl;
}

async function showQr(cli, host, port) {
  const url = `exp://${host}:${port}`;
  console.log(`Expo Go: ${url}`);
  console.log(await cli('qrcode').toString(url, { type: 'terminal', small: true }));
  console.log('Use the iPhone Camera or the QR scanner in Expo Go on Android.');
}

async function prepareExpo(expo, cli, host, apiUrl) {
  const { testPortAsync } = cli('./build/src/utils/freeport.js');
  const ports = await Promise.all(metroPorts.map(async port => {
    const free = await testPortAsync(port, [null, 'localhost']);
    return { port, free, matches: !free && await metroMatches(host, port, apiUrl) };
  }));
  const existing = ports.find(candidate => candidate.matches);
  if (existing) {
    console.log('Expo Go is already running. Keep its original window open.');
    await showQr(cli, host, existing.port);
    return;
  }

  const available = ports.find(candidate => candidate.free);
  if (!available) throw new Error('Expo Go needs an available Metro port between 8082 and 8091.');
  const { port } = available;
  console.log('Starting Expo Go. Keep this window open for Fast Refresh.');
  const env = {
    ...process.env,
    MVP_EXPO_GO: '1',
    EXPO_PUBLIC_API_URL: apiUrl,
    REACT_NATIVE_PACKAGER_HOSTNAME: host,
  };
  delete env.CI;
  delete env.EXPO_PACKAGER_PROXY_URL;
  const session = spawn(process.execPath, [
    expo.resolve('expo/bin/cli'), 'start', '--go', '--offline', '--port', String(port),
  ], { cwd: mobile, env, stdio: 'inherit' });
  const exit = once(session, 'exit').then(([code]) => code ?? 1);
  const startupError = `Expo Go did not start on port ${port}. Check the Metro output above.`;
  try {
    const ready = await Promise.race([
      waitFor(() => {
        if (!session.pid || session.exitCode !== null || session.signalCode !== null) {
          throw new Error(startupError);
        }
        return metroMatches(host, port, apiUrl);
      }, 45_000),
      exit.then(() => false),
    ]);
    if (!ready) throw new Error(startupError);
    if (!process.stdout.isTTY) await showQr(cli, host, port);
    return { exit };
  } catch (error) {
    session.kill();
    throw error;
  }
}

async function main() {
  const expo = createRequire(require.resolve('expo/package.json', { paths: [mobile] }));
  const cli = createRequire(expo.resolve('@expo/cli/package.json'));
  const { getIpAddressAsync } = cli('./build/src/utils/ip.js');
  const lock = await lockStartup();
  let metro;
  try {
    const host = await waitFor(async () => {
      const address = await getIpAddressAsync();
      return address !== '127.0.0.1' && address;
    }, 20_000);
    if (!host) throw new Error('Connect this PC to the same local network as your phone and try again.');

    const apiUrl = getApiUrl(host);
    await ensureApi(apiUrl);
    console.log(`API ready at ${apiUrl}`);
    metro = await prepareExpo(expo, cli, host, apiUrl);
  } finally {
    lock.close();
  }
  if (metro) process.exitCode = await metro.exit;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
