import { api } from '../data/index.js';
import { Identity } from './identity.js';

// NOTE: Be careful making changes here as this file will be overwritten
// during the build for react-native. See ./scripts/package-react-native.sh
export const identity = new Identity<Storage>(globalThis, api);
