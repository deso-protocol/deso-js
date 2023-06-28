import { utils as ecUtils } from '@noble/secp256k1';
import { TransactionSpendingLimitResponse } from '../backend-types/index.js';
import { api, getAppState } from '../data/index.js';
import {
  deriveAccessGroupKeyPair,
  getSignedJWT,
  publicKeyToBase58Check,
  sha256X2,
  sign,
  uint64ToBufBigEndian,
} from './crypto-utils.js';
import { KeyPair, Network } from './types.js';

export async function generateDerivedKeyPayload(
  ownerKeys: KeyPair,
  derivedKeys: KeyPair,
  transactionSpendingLimitObj: TransactionSpendingLimitResponse,
  numDaysBeforeExpiration: number,
  network: Network,
  {defaultMessagingGroupName} = {
    defaultMessagingGroupName: 'default-key',
  }
) {
  const {BlockHeight} = await getAppState();

  // days * (24 hours / day) * (60 minutes / hour) * (1 block / 5 minutes) = blocks
  const expirationBlockHeight =
    BlockHeight + (numDaysBeforeExpiration * 24 * 60) / 5;
  const ownerPublicKeyBase58 = publicKeyToBase58Check(ownerKeys.public, {
    network,
  });
  const derivedPublicKeyBase58 = publicKeyToBase58Check(derivedKeys.public, {
    network,
  });
  if (transactionSpendingLimitObj?.AccessGroupLimitMap) {
    transactionSpendingLimitObj.AccessGroupLimitMap.forEach((agl) => {
      if (!agl.AccessGroupOwnerPublicKeyBase58Check) {
        agl.AccessGroupOwnerPublicKeyBase58Check = ownerPublicKeyBase58;
      }
    });
  }
  if (transactionSpendingLimitObj?.AccessGroupMemberLimitMap) {
    transactionSpendingLimitObj.AccessGroupMemberLimitMap.forEach((agml) => {
      if (!agml.AccessGroupOwnerPublicKeyBase58Check) {
        agml.AccessGroupOwnerPublicKeyBase58Check = ownerPublicKeyBase58;
      }
    });
  }
  const {TransactionSpendingLimitHex} = await api.post(
    '/api/v0/get-access-bytes',
    {
      DerivedPublicKeyBase58Check: derivedPublicKeyBase58,
      ExpirationBlock: expirationBlockHeight,
      TransactionSpendingLimit: transactionSpendingLimitObj,
    }
  );
  const transactionSpendingLimitBytes = TransactionSpendingLimitHex
    ? ecUtils.hexToBytes(TransactionSpendingLimitHex)
    : [];
  const accessBytes = new Uint8Array([
    ...derivedKeys.public,
    ...uint64ToBufBigEndian(expirationBlockHeight),
    ...transactionSpendingLimitBytes,
  ]);
  const accessHashHex = ecUtils.bytesToHex(sha256X2(accessBytes));
  const [accessSignature] = await sign(accessHashHex, ownerKeys.private);
  const messagingKey = deriveAccessGroupKeyPair(
    ownerKeys.seedHex,
    defaultMessagingGroupName
  );
  const messagingPublicKeyBase58Check = publicKeyToBase58Check(
    messagingKey.public,
    {network}
  );
  const messagingKeyHashHex = ecUtils.bytesToHex(
    sha256X2(
      new Uint8Array([
        ...messagingKey.public,
        ...new TextEncoder().encode(defaultMessagingGroupName),
      ])
    )
  );
  const [messagingKeySignature] = await sign(
    messagingKeyHashHex,
    ownerKeys.private
  );

  const [jwt, derivedJwt] = await Promise.all([
    getSignedJWT(ownerKeys.seedHex, 'ES256', {}),
    getSignedJWT(ownerKeys.seedHex, 'ES256', {
      derivedPublicKeyBase58Check: derivedPublicKeyBase58,
    }),
  ]);

  return {
    derivedSeedHex: derivedKeys.seedHex,
    derivedPublicKeyBase58Check: derivedPublicKeyBase58,
    publicKeyBase58Check: ownerPublicKeyBase58,
    btcDepositAddress: 'Not implemented yet',
    ethDepositAddress: 'Not implemented yet',
    expirationBlock: expirationBlockHeight,
    network,
    accessSignature: ecUtils.bytesToHex(accessSignature),
    jwt,
    derivedJwt,
    messagingPublicKeyBase58Check,
    messagingPrivateKey: messagingKey.seedHex,
    messagingKeyName: defaultMessagingGroupName,
    messagingKeySignature: ecUtils.bytesToHex(messagingKeySignature),
    transactionSpendingLimitHex: TransactionSpendingLimitHex,
    signedUp: false,
    publicKeyAdded: ownerPublicKeyBase58,
  };
}
