import { execSync } from 'child_process';
import { Socket } from 'net';

const HAPP_HTTP_PORT = 10809;
const HAPP_SOCKS_PORT = 10808;

function tryConnect(host, port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new Socket();
    socket.setTimeout(timeout);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

function getSystemProxy() {
  try {
    const output = execSync(
      'powershell -NoProfile -Command "Get-ItemProperty \'Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Internet Settings\' | Select-Object ProxyEnable, ProxyServer | ConvertTo-Json"',
      { encoding: 'utf8', timeout: 5000 }
    );
    const settings = JSON.parse(output);
    if (settings.ProxyEnable === 1 && settings.ProxyServer) {
      let proxy = settings.ProxyServer;
      if (!proxy.startsWith('http')) {
        proxy = 'http://' + proxy;
      }
      return proxy;
    }
  } catch {}
  return null;
}

async function detectLocalProxy() {
  if (await tryConnect('127.0.0.1', HAPP_HTTP_PORT)) {
    return `http://127.0.0.1:${HAPP_HTTP_PORT}`;
  }
  if (await tryConnect('127.0.0.1', 7890)) {
    return `http://127.0.0.1:7890`;
  }
  if (await tryConnect('127.0.0.1', 8080)) {
    return `http://127.0.0.1:8080`;
  }
  return null;
}

export async function setupProxy() {
  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (envProxy) {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(envProxy));
    console.log(`[proxy] env: ${envProxy}`);
    return;
  }

  const systemProxy = getSystemProxy();
  if (systemProxy) {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(systemProxy));
    console.log(`[proxy] system: ${systemProxy}`);
    return;
  }

  const localProxy = await detectLocalProxy();
  if (localProxy) {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(localProxy));
    console.log(`[proxy] detected: ${localProxy}`);
    return;
  }

  console.log('[proxy] not detected — direct connection');
}
