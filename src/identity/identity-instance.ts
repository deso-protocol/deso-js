import { api } from '../data';
import { Identity } from './identity';

export const identity = new Identity<Storage>(globalThis, api);
