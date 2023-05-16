import { api } from '../data/index.js';
import { Identity } from './identity.js';
import { AsyncStorage } from './types.js';

export const identity = new Identity<AsyncStorage>(globalThis, api);
