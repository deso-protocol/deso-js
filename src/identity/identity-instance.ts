import { api } from '../data/index.js';
import { Identity } from './identity.js';

export const identity = new Identity(globalThis, api);
