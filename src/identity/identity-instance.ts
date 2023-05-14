import { api } from '../data';
import { Identity } from './identity';

// NOTE: Be careful making changes here as this file will be overwritten
// during the build for react-native. See ./scripts/package-react-native.sh
export const identity = new Identity<Storage>(globalThis, api);
