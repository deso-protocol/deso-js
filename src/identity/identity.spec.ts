import { utils as ecUtils, getPublicKey } from '@noble/secp256k1';
import { verify } from 'jsonwebtoken';
import KeyEncoder from 'key-encoder';
import { ChatType, NewMessageEntryResponse } from '../backend-types';
import { getAPIFake, getWindowFake } from '../test-utils';
import { APIError } from './api';
import { DEFAULT_IDENTITY_URI, LOCAL_STORAGE_KEYS } from './constants';
import {
  bs58PublicKeyToCompressedBytes,
  keygen,
  publicKeyToBase58Check,
} from './crypto-utils';
import { ERROR_TYPES } from './error-types';
import { Identity } from './identity';
import {
  Transaction,
  TransactionExtraData,
  TransactionMetadataBasicTransfer,
  TransactionMetadataCreatorCoin,
  TransactionNonce,
} from './transaction-transcoders';
import { APIProvider } from './types';
import {
  buyCreatorCoin,
  constructSendDeSoTransaction,
} from '../transactions/financial';
import {
  buildSendDiamondsConsensusKVs,
  constructDiamondTransaction,
  constructFollowTransaction,
  constructLikeTransaction,
  constructSubmitPost,
  constructUpdateProfileTransaction,
} from '../transactions/social';
import { constructCreateNFTTransaction } from '../transactions/nfts';
import { computeTxSize, getTxWithFeeNanos } from '../internal';

function getPemEncodePublicKey(privateKey: Uint8Array): string {
  const publicKey = getPublicKey(privateKey, true);
  return new KeyEncoder('secp256k1').encodePublic(
    ecUtils.bytesToHex(publicKey),
    'raw',
    'pem'
  );
}

describe('identity', () => {
  let identity: Identity<Storage>;
  let windowFake: typeof globalThis;
  let apiFake: APIProvider;
  let postMessageListener: (args: any) => any;
  beforeEach(() => {
    windowFake = getWindowFake({
      addEventListener: (message: any, listener: (args: any) => void): void => {
        postMessageListener = listener;
      },
    }) as unknown as typeof globalThis;
    apiFake = getAPIFake({
      get: jest
        .fn()
        .mockImplementation((url: string) => {
          if (url.includes('get-single-derived-key')) {
            return Promise.resolve({
              DerivedKey: {
                OwnerPublicKeyBase58Check:
                  'BC1YLiot3hqKeKhK82soKAeK3BFdTnMjpd2w4HPfesaFzYHUpUzJ2ay',
                DerivedPublicKeyBase58Check:
                  'BC1YLgWMZWj8TVmDB9eJ7ZtWYYZHBDUUsz5ENmbseF3pF7CmopfXhb7',
                ExpirationBlock: 210445,
                IsValid: true,
                TransactionSpendingLimit: {
                  GlobalDESOLimit: 1000000,
                  TransactionCountLimitMap: null,
                  CreatorCoinOperationLimitMap: null,
                  DAOCoinOperationLimitMap: null,
                  NFTOperationLimitMap: null,
                  DAOCoinLimitOrderLimitMap: null,
                  AssociationLimitMap: null,
                  IsUnlimited: false,
                },
                Memo: '',
              },
            });
          }

          return Promise.resolve(null);
        })
        .mockName('api.get'),
      post: jest
        .fn()
        .mockImplementation((url: string) => {
          if (url.endsWith('authorize-derived-key')) {
            const nonce = new TransactionNonce();
            nonce.expirationBlockHeight = 10000;
            nonce.partialId = 10988297;
            const extraData = new TransactionExtraData();
            extraData.kvs = [];
            const exampleTransaction = new Transaction({
              inputs: [],
              outputs: [],
              version: 1,
              feeNanos: 100,
              nonce,
              publicKey: bs58PublicKeyToCompressedBytes(
                'BC1YLiot3hqKeKhK82soKAeK3BFdTnMjpd2w4HPfesaFzYHUpUzJ2ay'
              ),
              metadata: new TransactionMetadataBasicTransfer(),
              signature: new Uint8Array(0),
              extraData,
            });
            const txBytes = exampleTransaction.toBytes();
            return Promise.resolve({
              TransactionHex: ecUtils.bytesToHex(txBytes),
            });
          }
          if (url.endsWith('get-app-state')) {
            return Promise.resolve({
              BlockHeight: 300000,
            });
          }
          return Promise.resolve(null);
        })
        .mockName('api.post'),
    });
    identity = new Identity<Storage>(windowFake, apiFake);
    identity.configure({
      storageProvider: windowFake.localStorage,
    });
  });

  describe('.login()', () => {
    it('generates a derived key pair, merges it with the identity payload, and attempts to authorize it', async () => {
      const derivePayload = {
        publicKeyBase58Check:
          'BC1YLiot3hqKeKhK82soKAeK3BFdTnMjpd2w4HPfesaFzYHUpUzJ2ay',
        btcDepositAddress: 'Not implemented yet',
        ethDepositAddress: 'Not implemented yet',
        expirationBlock: 209932,
        network: 'mainnet',
        accessSignature:
          '304402206b856bec68082935a470e1db7628105551b966ccb3822c93a50754b55160fe5e02207d6c2dd28127419fb9e0bb58e6ea07b7d33bc8cd912dfe876d966ca56aed1aee',
        jwt: 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE2NzQ0MjEzNDIsImV4cCI6MTY3NzAxMzM0Mn0.9pvSmQ5YETLCE1zV76-KhfHdufJp5fkYBKEgl4gw9iQsp0bg91nNXnhnm92836zHydQvhLJPRLry6wZJyskcrg',
        derivedJwt: '',
        messagingPublicKeyBase58Check:
          'BC1YLg1zXewYRmfkVYAJH6CLJsaZxHh6GyzaAWyDQsPVYuG5b5ab7Fb',
        messagingPrivateKey:
          '9816d3604045252a0210a05eba9ea7ca73c838929913199902c972fe2b9fe347',
        messagingKeyName: 'default-key',
        messagingKeySignature:
          '30450221008965fe5e21139c84066ffd53ffa2ab3ef61fe714fec97b4fe411d6beab995ce402201df84d1d581a2cb73b0b135b6f2163f045ef9fab9975960548a46c6090d7eec3',
        transactionSpendingLimitHex: '00000000000001',
        signedUp: false,
      };

      const mockTxSpendingLimit = {
        GlobalDESOLimit: 1000000,
        TransactionCountLimitMap: null,
        CreatorCoinOperationLimitMap: null,
        DAOCoinOperationLimitMap: null,
        NFTOperationLimitMap: null,
        DAOCoinLimitOrderLimitMap: null,
        AssociationLimitMap: null,
        IsUnlimited: false,
      };

      const testAppName = 'My Cool App';
      identity.configure({
        appName: testAppName,
        storageProvider: windowFake.localStorage,
      });

      let loginKeyPair = { publicKey: '', seedHex: '' };
      await Promise.all([
        identity.login(),
        // login waits to resolve until it receives a message from the identity
        // here we fake sending that message
        new Promise((resolve) =>
          setTimeout(() => {
            // before identity sends the message we should have a login key pair in local storage
            const keyPairJSON = windowFake.localStorage.getItem(
              LOCAL_STORAGE_KEYS.loginKeyPair
            );
            if (keyPairJSON) {
              loginKeyPair = JSON.parse(keyPairJSON);
            }

            const payload = {
              ...derivePayload,
              derivedPublicKeyBase58Check: loginKeyPair.publicKey,
              derivedSeedHex: '',
            };

            apiFake.get = jest
              .fn()
              .mockImplementation((url: string) => {
                if (
                  url.endsWith(
                    `get-single-derived-key/${payload.publicKeyBase58Check}/${payload.derivedPublicKeyBase58Check}`
                  )
                ) {
                  return Promise.resolve({
                    DerivedKey: {
                      OwnerPublicKeyBase58Check: payload.publicKeyBase58Check,
                      DerivedPublicKeyBase58Check:
                        payload.derivedPublicKeyBase58Check,
                      ExpirationBlock: 210445,
                      IsValid: true,
                      TransactionSpendingLimit: mockTxSpendingLimit,
                      Memo: '',
                    },
                  });
                }

                return Promise.resolve(null);
              })
              .mockName('api.get');

            // NOTE: identity does not provide the derived seed hex here because we generated the keys ourselves
            postMessageListener({
              origin: DEFAULT_IDENTITY_URI,
              source: { close: jest.fn() },
              data: {
                service: 'identity',
                method: 'derive',
                payload: payload,
              },
            });

            resolve(undefined);
          }, 1)
        ),
      ]);

      const { currentUser } = identity.snapshot();
      expect(currentUser?.publicKey).toEqual(
        'BC1YLiot3hqKeKhK82soKAeK3BFdTnMjpd2w4HPfesaFzYHUpUzJ2ay'
      );
      expect(loginKeyPair.seedHex.length > 0).toBe(true);
      expect(loginKeyPair.publicKey.length > 0).toBe(true);
      expect(currentUser).toEqual({
        publicKey: derivePayload.publicKeyBase58Check,
        primaryDerivedKey: {
          ...derivePayload,
          derivedPublicKeyBase58Check: loginKeyPair.publicKey,
          // NOTE: we have updated our local record to include our generated derived seed hex
          derivedSeedHex: loginKeyPair.seedHex,
          // The key is ready for use
          IsValid: true,
          // the key has its fetched permissions cached
          transactionSpendingLimits: mockTxSpendingLimit,
        },
      });
      // login keys cleaned up from local storage
      expect(
        windowFake.localStorage.getItem(LOCAL_STORAGE_KEYS.loginKeyPair)
      ).toBe(null);
      // authorize derive key called with the correct payload
      const [_, authorizePayload] = (apiFake.post as jest.Mock).mock.calls.find(
        ([url]) => url.endsWith('authorize-derived-key')
      );
      expect(authorizePayload).toEqual({
        OwnerPublicKeyBase58Check: derivePayload.publicKeyBase58Check,
        DerivedPublicKeyBase58Check: loginKeyPair.publicKey,
        ExpirationBlock: 209932,
        AccessSignature: derivePayload.accessSignature,
        DeleteKey: false,
        DerivedKeySignature: false,
        MinFeeRateNanosPerKB: 1000,
        TransactionSpendingLimitHex: '00000000000001',
        Memo: testAppName,
        AppName: testAppName,
        TransactionFees: [],
        ExtraData: {},
      });
    });

    it('throws an error with the expected type if authorizing the key fails due to no money', async () => {
      const errorMsg =
        'Total input 0 is not sufficient to cover the spend amount';
      apiFake.post = (url: string) => {
        if (url.endsWith('authorize-derived-key')) {
          throw new APIError(errorMsg, 400);
        }

        return Promise.resolve(null);
      };

      const derivePayload = {
        publicKeyBase58Check:
          'BC1YLiot3hqKeKhK82soKAeK3BFdTnMjpd2w4HPfesaFzYHUpUzJ2ay',
        btcDepositAddress: 'Not implemented yet',
        ethDepositAddress: 'Not implemented yet',
        expirationBlock: 209932,
        network: 'mainnet',
        accessSignature:
          '304402206b856bec68082935a470e1db7628105551b966ccb3822c93a50754b55160fe5e02207d6c2dd28127419fb9e0bb58e6ea07b7d33bc8cd912dfe876d966ca56aed1aee',
        jwt: 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE2NzQ0MjEzNDIsImV4cCI6MTY3NzAxMzM0Mn0.9pvSmQ5YETLCE1zV76-KhfHdufJp5fkYBKEgl4gw9iQsp0bg91nNXnhnm92836zHydQvhLJPRLry6wZJyskcrg',
        derivedJwt: '',
        messagingPublicKeyBase58Check:
          'BC1YLg1zXewYRmfkVYAJH6CLJsaZxHh6GyzaAWyDQsPVYuG5b5ab7Fb',
        messagingPrivateKey:
          '9816d3604045252a0210a05eba9ea7ca73c838929913199902c972fe2b9fe347',
        messagingKeyName: 'default-key',
        messagingKeySignature:
          '30450221008965fe5e21139c84066ffd53ffa2ab3ef61fe714fec97b4fe411d6beab995ce402201df84d1d581a2cb73b0b135b6f2163f045ef9fab9975960548a46c6090d7eec3',
        transactionSpendingLimitHex: '00000000000001',
        signedUp: false,
      };

      let loginKeyPair = { publicKey: '', seedHex: '' };
      let error: any;

      try {
        await Promise.all([
          identity.login(),
          // login waits to resolve until it receives a message from the identity
          // here we fake sending that message
          new Promise((resolve) =>
            setTimeout(() => {
              // before identity sends the message we should have a login key pair in local storage
              const keyPairJSON = windowFake.localStorage.getItem(
                LOCAL_STORAGE_KEYS.loginKeyPair
              );
              if (keyPairJSON) {
                loginKeyPair = JSON.parse(keyPairJSON);
              }

              // NOTE: identity does not provide the derived seed hex here because we generated the keys ourselves
              postMessageListener({
                origin: DEFAULT_IDENTITY_URI,
                source: { close: jest.fn() },
                data: {
                  service: 'identity',
                  method: 'derive',
                  payload: {
                    ...derivePayload,
                    derivedPublicKeyBase58Check: loginKeyPair.publicKey,
                    derivedSeedHex: '',
                  },
                },
              });

              resolve(undefined);
            }, 1)
          ),
        ]);
      } catch (e: any) {
        error = e;
      }

      expect(error.type).toEqual(ERROR_TYPES.NO_MONEY);
      expect(error.message).toEqual(errorMsg);
    });
  });

  describe('.jwt()', () => {
    const testDerivedSeedHex =
      'a9bf25f68e2f9302f7f41835dc6e68a483146ef996d0ff11a76b8d4dc38ee832';
    const testDerivedPublicKeyBase58Check =
      'BC1YLiLrdnAcK3eCR32ykwqL7aJfYDs9GPf1Ws8gpqjW78Th94uD5jJ';
    const testPublicKeyBase58Check =
      'BC1YLiot3hqKeKhK82soKAeK3BFdTnMjpd2w4HPfesaFzYHUpUzJ2ay';

    beforeEach(() => {
      // set up a test user in local storage
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.activePublicKey,
        testPublicKeyBase58Check
      );
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.identityUsers,
        JSON.stringify({
          [testPublicKeyBase58Check]: {
            primaryDerivedKey: {
              derivedSeedHex: testDerivedSeedHex,
              derivedPublicKeyBase58Check: testDerivedPublicKeyBase58Check,
              publicKeyBase58Check: testPublicKeyBase58Check,
              expirationBlock: 209505,
              IsValid: true,
            },
          },
        })
      );
    });

    it('generates a jwt with a valid signature and can be verified using the correct public key', async () => {
      const jwt = await identity.jwt();
      const parsedAndVerifiedJwt = verify(
        jwt,
        getPemEncodePublicKey(ecUtils.hexToBytes(testDerivedSeedHex)),
        {
          // See: https://github.com/auth0/node-jsonwebtoken/issues/862
          // tl;dr: the jsonwebtoken library doesn't support the ES256K algorithm,
          // even though this is the correct algorithm for JWTs signed
          // with secp256k1 keys: https://www.rfc-editor.org/rfc/rfc8812.html#name-jose-algorithms-registratio
          // as a workaround, we can use this flag to force it to accept and
          // verify signatures generated with secp256k1 keys
          allowInvalidAsymmetricKeyTypes: true,
        }
      );

      // we should't call authorize if the key is valid.
      const authorizeCalls = (apiFake.post as jest.Mock).mock.calls.filter(
        ([url]) => url.endsWith('authorize-derived-key')
      );

      expect(authorizeCalls.length).toBe(0);
      expect(parsedAndVerifiedJwt).toEqual({
        derivedPublicKeyBase58Check: testDerivedPublicKeyBase58Check,
        iat: expect.any(Number),
        exp: expect.any(Number),
      });
    });

    it('is invalid when verified with the wrong public key', async () => {
      const badSeedHex =
        'b3302883522db5863ded181b727153ddb1a7cd1deb5eaa00d406f9e08ae0bfe8';
      const jwt = await identity.jwt();
      let errorMessage = '';
      try {
        verify(jwt, getPemEncodePublicKey(ecUtils.hexToBytes(badSeedHex)), {
          // See: https://github.com/auth0/node-jsonwebtoken/issues/862
          // tl;dr: the jsonwebtoken library doesn't support the ES256K algorithm,
          // even though this is the correct algorithm for JWTs signed
          // with secp256k1 keys: https://www.rfc-editor.org/rfc/rfc8812.html#name-jose-algorithms-registratio
          // as a workaround, we can use this flag to force it to accept and
          // verify signatures generated with secp256k1 keys
          allowInvalidAsymmetricKeyTypes: true,
        });
      } catch (e: any) {
        errorMessage = e.toString();
      }

      expect(errorMessage).toEqual('JsonWebTokenError: invalid signature');
    });
  });

  describe('.encryptChatMessage/decryptChatMessage()', () => {
    it('encrypts and decrypts a DM chat message', async () => {
      const senderOwnerKeys = await keygen();
      const recipientOwnerKeys = await keygen();
      const senderMessagingKeys = await keygen();
      const recipientMessagingKeys = await keygen();
      const senderOwnerPKBase58 = await publicKeyToBase58Check(
        senderOwnerKeys.public
      );
      const recipientOwnerPKBase58 = await publicKeyToBase58Check(
        recipientOwnerKeys.public
      );
      const senderMessagingPKBase58 = await publicKeyToBase58Check(
        senderMessagingKeys.public
      );
      const recipientMessagingPKBase58 = await publicKeyToBase58Check(
        recipientMessagingKeys.public
      );

      const plaintextMsg =
        'lorem ipsum dolor sit amet, consectetur adipiscing elit';

      // set active user to the sender and encrypt a message
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.activePublicKey,
        senderOwnerPKBase58
      );
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.identityUsers,
        JSON.stringify({
          [senderOwnerPKBase58]: {
            primaryDerivedKey: {
              messagingPrivateKey: senderMessagingKeys.seedHex,
            },
          },
          [recipientOwnerPKBase58]: {
            publicKey: recipientOwnerPKBase58,
            primaryDerivedKey: {
              messagingPrivateKey: recipientMessagingKeys.seedHex,
            },
          },
        })
      );

      // encrypt message with the recipient's messaging public key
      const encryptedMsgHex = await identity.encryptMessage(
        recipientMessagingPKBase58,
        plaintextMsg
      );

      // switch active user to the recipient and decrypt the message
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.activePublicKey,
        recipientOwnerPKBase58
      );

      // This is testing a DM. TODO: also test group chats.
      const message: NewMessageEntryResponse = {
        ChatType: ChatType.DM,
        SenderInfo: {
          OwnerPublicKeyBase58Check: senderOwnerPKBase58,
          AccessGroupKeyName: 'default-key',
          AccessGroupPublicKeyBase58Check: senderMessagingPKBase58,
        },
        RecipientInfo: {
          OwnerPublicKeyBase58Check: recipientOwnerPKBase58,
          AccessGroupKeyName: 'default-key',
          AccessGroupPublicKeyBase58Check: recipientMessagingPKBase58,
        },
        MessageInfo: {
          EncryptedText: encryptedMsgHex,

          // we don't care about these fields for this test, but they have to be
          // here to make the type checker happy
          TimestampNanos: 0,
          TimestampNanosString: '',
          ExtraData: {},
        },
      };

      const { DecryptedMessage, error } = await identity.decryptMessage(
        message,
        []
      );

      expect(error).toBe('');
      expect(encryptedMsgHex).not.toEqual(plaintextMsg);
      expect(DecryptedMessage).toEqual(plaintextMsg);
    });

    it('decodes hex encoded, un-encrypted plaintext', async () => {
      const senderOwnerKeys = await keygen();
      const recipientOwnerKeys = await keygen();
      const recipientMessagingKeys = await keygen();
      const senderOwnerPKBase58 = await publicKeyToBase58Check(
        senderOwnerKeys.public
      );
      const recipientOwnerPKBase58 = await publicKeyToBase58Check(
        recipientOwnerKeys.public
      );

      const plaintextMsg =
        'lorem ipsum dolor sit amet, consectetur adipiscing elit';
      const textEncoder = new TextEncoder();
      const bytes = textEncoder.encode(plaintextMsg);
      const hexEncodedMsg = ecUtils.bytesToHex(new Uint8Array(bytes));

      // we only need to set the active user to the recipient, since we're not
      // decrypting anything.
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.activePublicKey,
        recipientOwnerPKBase58
      );
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.identityUsers,
        JSON.stringify({
          [recipientOwnerPKBase58]: {
            publicKey: recipientOwnerPKBase58,
            primaryDerivedKey: {
              messagingPrivateKey: recipientMessagingKeys.seedHex,
            },
          },
        })
      );

      const message: NewMessageEntryResponse = {
        ChatType: ChatType.DM,
        SenderInfo: {
          OwnerPublicKeyBase58Check: senderOwnerPKBase58,
          AccessGroupKeyName: 'default-key',
          AccessGroupPublicKeyBase58Check: senderOwnerPKBase58,
        },
        RecipientInfo: {
          OwnerPublicKeyBase58Check: recipientOwnerPKBase58,
          AccessGroupKeyName: 'default-key',
          AccessGroupPublicKeyBase58Check: recipientOwnerPKBase58,
        },
        MessageInfo: {
          EncryptedText: hexEncodedMsg,

          // we don't care about these fields for this test, but they have to be
          // here to make the type checker happy
          TimestampNanos: 0,
          TimestampNanosString: '',
          ExtraData: {
            // this is the important thing for this test
            unencrypted: '1',
          },
        },
      };

      const { DecryptedMessage, error } = await identity.decryptMessage(
        message,
        []
      );

      expect(error).toBe('');
      expect(DecryptedMessage).toEqual(plaintextMsg);
    });
  });

  describe('.hasPermissions()', () => {
    it('returns true when the user has all the required permissions', () => {
      const activeUserKey =
        'BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s';
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.activePublicKey,
        activeUserKey
      );
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.identityUsers,
        JSON.stringify({
          [activeUserKey]: {
            primaryDerivedKey: {
              IsValid: true,
              transactionSpendingLimits: {
                TransactionCountLimitMap: {
                  BASIC_TRANSFER: 1,
                  SUBMIT_POST: 2,
                },
                CreatorCoinOperationLimitMap: {
                  BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s: {
                    any: 1,
                    buy: 2,
                    sell: 3,
                  },
                },
              },
            },
          },
        })
      );

      const hasPermissions = identity.hasPermissions({
        TransactionCountLimitMap: {
          BASIC_TRANSFER: 1,
          SUBMIT_POST: 1,
        },
        CreatorCoinOperationLimitMap: {
          BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s: {
            any: 1,
            buy: 1,
            sell: 2,
          },
        },
      });
      expect(hasPermissions).toBe(true);
    });
    it('returns false when the user does not have the required permissions', () => {
      const activeUserKey =
        'BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s';
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.activePublicKey,
        activeUserKey
      );
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.identityUsers,
        JSON.stringify({
          [activeUserKey]: {
            primaryDerivedKey: {
              IsValid: true,
              transactionSpendingLimits: {
                TransactionCountLimitMap: {
                  BASIC_TRANSFER: 1,
                  SUBMIT_POST: 2,
                },
                CreatorCoinOperationLimitMap: {
                  BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s: {
                    any: 1,
                    buy: 2,
                    sell: 3,
                  },
                },
              },
            },
          },
        })
      );
      const hasPermissions = identity.hasPermissions({
        TransactionCountLimitMap: {
          BASIC_TRANSFER: 1,
          SUBMIT_POST: 1,
        },
        CreatorCoinOperationLimitMap: {
          BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s: {
            any: 1,
            buy: 1,
            sell: 4, // this is more than the user can do
          },
        },
      });
      expect(hasPermissions).toBe(false);
    });
    it('works with a single permission', () => {
      const activeUserKey =
        'BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s';
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.activePublicKey,
        activeUserKey
      );
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.identityUsers,
        JSON.stringify({
          [activeUserKey]: {
            primaryDerivedKey: {
              IsValid: true,
              transactionSpendingLimits: {
                TransactionCountLimitMap: {
                  BASIC_TRANSFER: 1,
                  SUBMIT_POST: 2,
                },
                CreatorCoinOperationLimitMap: {
                  BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s: {
                    any: 1,
                    buy: 2,
                    sell: 3,
                  },
                },
              },
            },
          },
        })
      );
      const hasPermissions = identity.hasPermissions({
        TransactionCountLimitMap: {
          SUBMIT_POST: 3, // more than the user can do
        },
      });
      expect(hasPermissions).toBe(false);
    });
    it('works if the key has unlimited permissions', () => {
      const activeUserKey =
        'BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s';
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.activePublicKey,
        activeUserKey
      );
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.identityUsers,
        JSON.stringify({
          [activeUserKey]: {
            primaryDerivedKey: {
              IsValid: true,
              transactionSpendingLimits: {
                IsUnlimited: true, // unlimited permissions
              },
            },
          },
        })
      );
      const hasPermissions = identity.hasPermissions({
        TransactionCountLimitMap: {
          SUBMIT_POST: 3, // doesn't matter what we check, it should be allowed
        },
      });
      expect(hasPermissions).toBe(true);
    });
    it('works if checking unlimited permissions for a specific tx', () => {
      const activeUserKey =
        'BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s';
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.activePublicKey,
        activeUserKey
      );
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.identityUsers,
        JSON.stringify({
          [activeUserKey]: {
            primaryDerivedKey: {
              IsValid: true,
              transactionSpendingLimits: {
                TransactionCountLimitMap: {
                  BASIC_TRANSFER: 1e9,
                  SUBMIT_POST: 2,
                },
                CreatorCoinOperationLimitMap: {
                  BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s: {
                    any: 1,
                    buy: 2,
                    sell: 3,
                  },
                },
              },
            },
          },
        })
      );
      const hasPermissions = identity.hasPermissions({
        TransactionCountLimitMap: {
          BASIC_TRANSFER: 'UNLIMITED',
        },
      });
      expect(hasPermissions).toBe(true);
    });
    it('it returns false if checking for a permission that does not exist yet', () => {
      const activeUserKey =
        'BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s';
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.activePublicKey,
        activeUserKey
      );
      windowFake.localStorage.setItem(
        LOCAL_STORAGE_KEYS.identityUsers,
        JSON.stringify({
          [activeUserKey]: {
            primaryDerivedKey: {
              IsValid: true,
              transactionSpendingLimits: {
                TransactionCountLimitMap: {
                  SUBMIT_POST: 2,
                },
                CreatorCoinOperationLimitMap: {
                  BC1YLhtBTFXAsKZgoaoYNW8mWAJWdfQjycheAeYjaX46azVrnZfJ94s: {
                    any: 1,
                    buy: 2,
                    sell: 3,
                  },
                },
              },
            },
          },
        })
      );
      const hasPermissions = identity.hasPermissions({
        TransactionCountLimitMap: {
          // basic transfer is not in the user's actual permissions
          BASIC_TRANSFER: 1,
        },
      });
      expect(hasPermissions).toBe(false);
    });
  });
  describe('.desoAddressToEthereumAddress()', () => {
    it('works', () => {
      expect(
        identity.desoAddressToEthereumAddress(
          'BC1YLiSayiRJKRut5gNW8CnN7vGugm3UzH8wXJiwx4io4FJKgRTGVqF'
        )
      ).toEqual('0x648D0cdA8D9C79fcC3D808fE35c2BF3887bcB6db');
    });
  });
  describe('.ethereumAddressToDesoAddress()', () => {
    it('works for mainnet', async () => {
      const ethAddress = '0x648d0cda8d9c79fcc3d808fe35c2bf3887bcb6db';
      const ethTransactionsForAddressResponse = {
        status: '1',
        message: 'OK',
        result: [
          // This is is just a partial result object. We only care about the from field and the hash.
          {
            from: ethAddress,
            hash: '0x1aeac6a985eeb2937e5a3069e149d70c1b623e3da96853755bfe2b9940a58f14',
          },
        ],
      };

      const queryETHRPCForTransactionResponse = {
        id: 1,
        jsonrpc: '2.0',
        result: {
          accessList: [],
          blockHash:
            '0x0e5fe1cd87180c85350c464e235a5e9e70bb0a4b4b5eff033cc600b4ed76f88f',
          blockNumber: '0x70b92e',
          chainId: '0x5',
          from: '0x648d0cda8d9c79fcc3d808fe35c2bf3887bcb6db',
          gas: '0x5208',
          gasPrice: '0x73a20d11',
          hash: '0x5a63939f9f5f6c90d4a302395e8f9d92be4e4b85d2430ede1d52aa62442c705d',
          input: '0x',
          maxFeePerGas: '0x73a20d17',
          maxPriorityFeePerGas: '0x73a20d00',
          nonce: '0x0',
          r: '0xb348e2bdba7eb4b833f77684709a15094d5f94307309f3fa47f6c603d5390894',
          s: '0x5993e2aa5653427090178d9714840924ca73a775b79e916d9f8ca4ed2294ca2d',
          to: '0xc8b2fdcf829e3d56f9917cd6356a1bb206101152',
          transactionIndex: '0x71',
          type: '0x2',
          v: '0x1',
          value: '0x5a0369b1f2b48',
        },
        error: {
          code: 0,
          message: '',
        },
      };

      apiFake.get = jest
        .fn()
        .mockImplementation((url: string) => {
          if (
            url.endsWith(
              `get-eth-transactions-for-eth-address/${ethAddress}?eth_network=mainnet`
            )
          ) {
            return Promise.resolve(ethTransactionsForAddressResponse);
          }

          return Promise.resolve(null);
        })
        .mockName('api.get');

      apiFake.post = jest
        .fn()
        .mockImplementation((url: string) => {
          if (url.endsWith('query-eth-rpc')) {
            return Promise.resolve(queryETHRPCForTransactionResponse);
          }

          return Promise.resolve(null);
        })
        .mockName('api.get');

      expect(
        await identity.ethereumAddressToDesoAddress(
          '0x648d0cda8d9c79fcc3d808fe35c2bf3887bcb6db'
        )
      ).toEqual('BC1YLiSayiRJKRut5gNW8CnN7vGugm3UzH8wXJiwx4io4FJKgRTGVqF');
    });
    it('works for testnet', async () => {
      identity.configure({ network: 'testnet' });
      const ethAddress = '0x648d0cda8d9c79fcc3d808fe35c2bf3887bcb6db';
      const ethTransactionsForAddressResponse = {
        status: '1',
        message: 'OK',
        result: [
          // This is is just a partial result object. We only care about the from field and the hash.
          {
            from: ethAddress,
            hash: '0x1aeac6a985eeb2937e5a3069e149d70c1b623e3da96853755bfe2b9940a58f14',
          },
        ],
      };

      const queryETHRPCForTransactionResponse = {
        id: 1,
        jsonrpc: '2.0',
        result: {
          accessList: [],
          blockHash:
            '0x0e5fe1cd87180c85350c464e235a5e9e70bb0a4b4b5eff033cc600b4ed76f88f',
          blockNumber: '0x70b92e',
          chainId: '0x5',
          from: '0x648d0cda8d9c79fcc3d808fe35c2bf3887bcb6db',
          gas: '0x5208',
          gasPrice: '0x73a20d11',
          hash: '0x5a63939f9f5f6c90d4a302395e8f9d92be4e4b85d2430ede1d52aa62442c705d',
          input: '0x',
          maxFeePerGas: '0x73a20d17',
          maxPriorityFeePerGas: '0x73a20d00',
          nonce: '0x0',
          r: '0xb348e2bdba7eb4b833f77684709a15094d5f94307309f3fa47f6c603d5390894',
          s: '0x5993e2aa5653427090178d9714840924ca73a775b79e916d9f8ca4ed2294ca2d',
          to: '0xc8b2fdcf829e3d56f9917cd6356a1bb206101152',
          transactionIndex: '0x71',
          type: '0x2',
          v: '0x1',
          value: '0x5a0369b1f2b48',
        },
        error: {
          code: 0,
          message: '',
        },
      };

      apiFake.get = jest
        .fn()
        .mockImplementation((url: string) => {
          if (
            url.endsWith(
              `get-eth-transactions-for-eth-address/${ethAddress}?eth_network=goerli`
            )
          ) {
            return Promise.resolve(ethTransactionsForAddressResponse);
          }

          return Promise.resolve(null);
        })
        .mockName('api.get');

      apiFake.post = jest
        .fn()
        .mockImplementation((url: string) => {
          if (url.endsWith('query-eth-rpc')) {
            return Promise.resolve(queryETHRPCForTransactionResponse);
          }

          return Promise.resolve(null);
        })
        .mockName('api.get');

      expect(
        await identity.ethereumAddressToDesoAddress(
          '0x648d0cda8d9c79fcc3d808fe35c2bf3887bcb6db'
        )
      ).toEqual('tBCKXZpzthFjXpopawpaFNbvKaw55ZFvMt1T2Psh56c7CDH7dRU7fm');
    });
  });
  describe('.subscribe()', () => {
    it.todo('it notifies the caller of the correct events');
  });
  describe('authorize error handling', () => {
    it.todo(
      'it properly handles the case where a users derived key cannot be authorized'
    );
  });

  describe('tx size and fee test', () => {
    const testPubKey =
      'BC1YLiSayiRJKRut5gNW8CnN7vGugm3UzH8wXJiwx4io4FJKgRTGVqF';
    const testPostHashHex =
      '1a1702bbf5b49c088ccf33da4b620a1d0c099f958a3931be3af47ad532bfe29c';
    const MinFeeRateNanosPerKB = 1000;
    it('basic transfer', async () => {
      console.log('send 1 deso');
      const sendDeso = await constructSendDeSoTransaction({
        AmountNanos: 1e9,
        MinFeeRateNanosPerKB,
        SenderPublicKeyBase58Check: testPubKey,
        RecipientPublicKeyOrUsername: testPubKey,
      });
      console.log('send 10 deso');
      await constructSendDeSoTransaction({
        AmountNanos: 10 * 1e9,
        MinFeeRateNanosPerKB,
        SenderPublicKeyBase58Check: testPubKey,
        RecipientPublicKeyOrUsername: testPubKey,
      });
      // Note: we don't suppport local construction for diamond txs yet since it requires an
      // add'l api request if you're upgrading from one diamond amount to another.
      console.log('send 1 diamond');
      const diamondTxWithFee = getTxWithFeeNanos(
        testPubKey,
        new TransactionMetadataBasicTransfer(),
        {
          MinFeeRateNanosPerKB,
          ConsensusExtraDataKVs: buildSendDiamondsConsensusKVs({
            DiamondPostHashHex: testPostHashHex,
            DiamondLevel: 1,
            SenderPublicKeyBase58Check: testPubKey,
            ReceiverPublicKeyBase58Check: testPubKey,
          }),
        }
      );
      console.log(
        'Txn Type: ',
        diamondTxWithFee.getTxnTypeString(),
        '\nComputed Fee: ',
        diamondTxWithFee.feeNanos,
        '\nComputed Size: ',
        computeTxSize(diamondTxWithFee) + 71
      );
    });
    it('submit post', async () => {
      console.log('submit 100 character post');
      await constructSubmitPost({
        BodyObj: {
          Body: [...Array(100)].map(() => 'a').join(''),
          ImageURLs: [],
          VideoURLs: [],
        },
        MinFeeRateNanosPerKB,
        UpdaterPublicKeyBase58Check: testPubKey,
      });
      console.log('submit 500 character post');
      await constructSubmitPost({
        BodyObj: {
          Body: [...Array(500)].map(() => 'a').join(''),
          ImageURLs: [],
          VideoURLs: [],
        },
        MinFeeRateNanosPerKB,
        UpdaterPublicKeyBase58Check: testPubKey,
      });
      console.log('comment on post w/ 100 character comment');
      await constructSubmitPost({
        BodyObj: {
          Body: [...Array(100)].map(() => 'a').join(''),
          ImageURLs: [],
          VideoURLs: [],
        },
        MinFeeRateNanosPerKB,
        UpdaterPublicKeyBase58Check: testPubKey,
        ParentStakeID:
          '1a1702bbf5b49c088ccf33da4b620a1d0c099f958a3931be3af47ad532bfe29c',
      });
      console.log('comment on post w/ 500 character comment');
      await constructSubmitPost({
        BodyObj: {
          Body: [...Array(500)].map(() => 'a').join(''),
          ImageURLs: [],
          VideoURLs: [],
        },
        MinFeeRateNanosPerKB,
        UpdaterPublicKeyBase58Check: testPubKey,
        ParentStakeID: testPostHashHex,
      });
      console.log('repost no body');
      await constructSubmitPost({
        BodyObj: {
          Body: '',
          ImageURLs: [],
          VideoURLs: [],
        },
        MinFeeRateNanosPerKB,
        UpdaterPublicKeyBase58Check: testPubKey,
        RepostedPostHashHex: testPostHashHex,
      });
    });
    it('create NFT', async () => {
      console.log('1 copy NFT');
      await constructCreateNFTTransaction({
        MinFeeRateNanosPerKB,
        UpdaterPublicKeyBase58Check: testPubKey,
        NumCopies: 1,
        IsForSale: false,
        MinBidAmountNanos: 0,
        NFTPostHashHex: testPostHashHex,
        NFTRoyaltyToCoinBasisPoints: 0,
        NFTRoyaltyToCreatorBasisPoints: 0,
        HasUnlockable: false,
      });
    });
    it('like', async () => {
      console.log('like a post');
      await constructLikeTransaction({
        MinFeeRateNanosPerKB,
        ReaderPublicKeyBase58Check: testPubKey,
        LikedPostHashHex: testPostHashHex,
      });
    });
    it('follow', async () => {
      console.log('follow a user');
      await constructFollowTransaction({
        FollowerPublicKeyBase58Check: testPubKey,
        FollowedPublicKeyBase58Check: testPubKey,
        MinFeeRateNanosPerKB,
      });
    });
    it('creator coin', async () => {
      console.log('buy 1 DESO worth of creator coin, expecting 0.5 CCs');
      const creatorCoinBuyMetadata = new TransactionMetadataCreatorCoin();
      creatorCoinBuyMetadata.operationType = 0;
      creatorCoinBuyMetadata.desoToSellNanos = 1e9;
      creatorCoinBuyMetadata.minCreatorCoinExpectedNanos = 0.5 * 1e9;
      creatorCoinBuyMetadata.profilePublicKey =
        bs58PublicKeyToCompressedBytes(testPubKey);
      const creatorCoinBuyTxWithFee = getTxWithFeeNanos(
        testPubKey,
        creatorCoinBuyMetadata,
        {
          MinFeeRateNanosPerKB,
        }
      );
      console.log(
        'Txn Type: ',
        creatorCoinBuyTxWithFee.getTxnTypeString(),
        '\nComputed Fee: ',
        creatorCoinBuyTxWithFee.feeNanos,
        '\nComputed Size: ',
        computeTxSize(creatorCoinBuyTxWithFee) + 71
      );

      console.log('sell 0.5 CCs and expect 1 DESO in return');
      const creatorCoinSellMetadata = new TransactionMetadataCreatorCoin();
      creatorCoinSellMetadata.operationType = 1;
      creatorCoinSellMetadata.desoToSellNanos = 0.5 * 1e9;
      creatorCoinSellMetadata.minDeSoExpectedNanos = 1e9;
      creatorCoinSellMetadata.profilePublicKey =
        bs58PublicKeyToCompressedBytes(testPubKey);
      const creatorCoinSellTxWithFee = getTxWithFeeNanos(
        testPubKey,
        creatorCoinSellMetadata,
        {
          MinFeeRateNanosPerKB,
        }
      );
      console.log(
        'Txn Type: ',
        creatorCoinSellTxWithFee.getTxnTypeString(),
        '\nComputed Fee: ',
        creatorCoinSellTxWithFee.feeNanos,
        '\nComputed Size: ',
        computeTxSize(creatorCoinSellTxWithFee) + 71
      );
    });
    it('update profile', async () => {
      console.log('update all metadata fields of profile');
      await constructUpdateProfileTransaction({
        UpdaterPublicKeyBase58Check: testPubKey,
        NewUsername: 'LazyNina',
        NewDescription: "I'm a lazy nina",
        IsHidden: false,
        NewCreatorBasisPoints: 10000,
        NewStakeMultipleBasisPoints: 12500,
        ProfilePublicKeyBase58Check: '',
        // Note: this is the field that usually results in the most impact on the fee
        NewProfilePic:
          'data:image/webp;base64,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',
        MinFeeRateNanosPerKB,
      });
    });
  });
});
