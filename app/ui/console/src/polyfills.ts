import processModule from 'process';
import { Buffer as BufferClass } from 'buffer';

type GlobalWithPolyfills = typeof globalThis & {
  Buffer?: typeof BufferClass;
  process?: typeof processModule;
  global?: typeof globalThis;
};

const globalWithPolyfills = globalThis as GlobalWithPolyfills;

if (!globalWithPolyfills.Buffer) {
  globalWithPolyfills.Buffer = BufferClass;
}

if (!globalWithPolyfills.process) {
  globalWithPolyfills.process = processModule;
}

if (!globalWithPolyfills.global) {
  globalWithPolyfills.global = globalWithPolyfills;
}
