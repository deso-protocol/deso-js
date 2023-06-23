import { webcrypto } from 'crypto';
import { TextDecoder, TextEncoder } from 'util';

beforeAll(() => {
  setupTestPolyfills();
});

beforeEach(() => {
  // Make sure there aren't any leaking fetch mocks across tests
  globalThis.fetch = jest
    .fn()
    .mockImplementation((url) =>
      Promise.reject(new Error(`fetch called with unmocked url: ${url}`))
    )
    .mockName('fetch');
});

function setupTestPolyfills() {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    value: webcrypto.subtle,
  });

  // NOTE: Node's implementation of TextEncoder.encode returns a Buffer, and
  // @noble crypto expects a Uint8Array. Here we just make sure whether we're
  // running in node or a browser that we are always dealing with a Uint8Array
  const originalEncode = TextEncoder.prototype.encode;
  TextEncoder.prototype.encode = function (str: string) {
    return new Uint8Array(originalEncode.call(this, str));
  };
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
}
