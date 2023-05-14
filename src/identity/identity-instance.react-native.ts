import { api } from '../data';
import { Identity } from './identity';
import { AsyncStorage } from './types';

export const identity = new Identity<AsyncStorage>(globalThis, api);
