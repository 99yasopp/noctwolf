// Drives ClientLink with a fake socket: plain GET, WebSocket upgrade, raw JSON.
// Run: node scripts/client-link-test.js  (after tsc compile to /tmp/nw-test)
const { ClientLink } = require('/tmp/nw-test/network/clientLink.js');
const { encodeMessage } = require('/tmp/nw-test/network/framing.js');

const assert = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) process.exitCode = 1;
};

function fakeSocket() {
  const writes = [];
  return {
    writes,
    text: () => writes.join(''),
    destroyed: false,
    write(data) { writes.push(typeof data === 'string' ? data : Buffer.from(data).toString('utf8')); },
    destroy() { this.destroyed = true; },
  };
}

// --- 1. plain GET: expect the guest page, connection closed ---
{
  const socket = fakeSocket();
  const link = new ClientLink(socket, () => {});
  link.push('GET / HTTP/1.1\r\nHost: 192.168.1.10:12345\r\n\r\n');
  const out = socket.text();
  assert('plain GET returns HTTP 200', out.startsWith('HTTP/1.1 200 OK'));
  assert('plain GET is html', out.includes('text/html') && out.includes('<html'));
  assert('plain GET closes socket', socket.destroyed);
}

// --- 2. WebSocket upgrade: expect 101, socket stays open ---
{
  const socket = fakeSocket();
  const got = [];
  const link = new ClientLink(socket, m => got.push(m));
  const key = Buffer.alloc(16, 'a').toString('base64');
  link.push(`GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  const out = socket.text();
  assert('ws upgrade returns 101', out.startsWith('HTTP/1.1 101'));
  assert('ws upgrade keeps socket open', !socket.destroyed);
  // Send a masked text frame, expect the message to land.
  const payload = encodeMessage({ type: 'PLAYER_JOIN', payload: { name: 'Bo' } });
  const bytes = Buffer.from(payload, 'utf8');
  const mask = Buffer.from([1, 2, 3, 4]);
  const masked = Buffer.from(bytes).map((b, i) => b ^ mask[i % 4]);
  const header = [0x81, 0x80 | bytes.length, ...mask];
  link.push(Buffer.from([...header, ...masked]));
  assert('ws frame delivers message', got.length === 1 && got[0].type === 'PLAYER_JOIN');
}

// --- 3. raw JSON line (app guest): expect the message, socket open ---
{
  const socket = fakeSocket();
  const got = [];
  const link = new ClientLink(socket, m => got.push(m));
  link.push(encodeMessage({ type: 'PLAYER_JOIN', payload: { name: 'App' } }));
  assert('tcp line delivers message', got.length === 1 && got[0].type === 'PLAYER_JOIN');
  assert('tcp line keeps socket open', !socket.destroyed);
}
