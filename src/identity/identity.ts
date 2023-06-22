import { keccak_256 } from '@noble/hashes/sha3';
import { Point, utils as ecUtils } from '@noble/secp256k1';
import { ethers } from 'ethers';
import { TextEncoder } from 'util';
import {
  AccessGroupEntryResponse,
  AuthorizeDerivedKeyRequest,
  ChatType,
  DecryptedMessageEntryResponse,
  GetAppStateResponse,
  InfuraResponse,
  NewMessageEntryResponse,
  QueryETHRPCRequest,
  SubmitTransactionResponse,
  type InfuraTx,
  type TransactionSpendingLimitResponse,
} from '../backend-types/index.js';
import {
  DEFAULT_IDENTITY_URI,
  DEFAULT_NODE_URI,
  DEFAULT_PERMISSIONS as DEFAULT_TRANSACTION_SPENDING_LIMIT,
  DESO_NETWORK_TO_ETH_NETWORK,
  IDENTITY_SERVICE_VALUE,
  LOCAL_STORAGE_KEYS,
} from './constants.js';
import {
  bs58PublicKeyToBytes,
  decrypt,
  decryptChatMessage,
  deriveAccessGroupKeyPair,
  encryptChatMessage,
  getSignedJWT,
  keygen,
  publicKeyToBase58Check,
  sha256X2,
  sign,
  signTx,
  uvarint64ToBuf,
} from './crypto-utils.js';
import { ERROR_TYPES } from './error-types.js';
import {
  buildTransactionSpendingLimitResponse,
  compareTransactionSpendingLimits,
} from './permissions-utils.js';
import { parseQueryParams } from './query-param-utils.js';
import {
  AccessGroupPrivateInfo,
  EtherscanTransaction,
  IdentityResponse,
  IdentityState,
  KeyPair,
  LoginOptions,
  NOTIFICATION_EVENTS,
  StorageProvider,
  type APIProvider,
  type Deferred,
  type EtherscanTransactionsByAddressResponse,
  type IdentityConfiguration,
  type IdentityDerivePayload,
  type IdentityLoginPayload,
  type Network,
  type StoredUser,
  type SubscriberNotification,
  type TransactionSpendingLimitResponseOptions,
  type jwtAlgorithm,
} from './types.js';

export class Identity<T extends StorageProvider> {
  /**
   * @private
   */
  #window: typeof globalThis;

  /**
   * @private
   */
  #api: APIProvider;

  /**
   * @private
   */
  #identityURI: string = DEFAULT_IDENTITY_URI;

  /**
   * @private
   */
  #network: Network = 'mainnet';

  /**
   * @private
   */
  #nodeURI: string = DEFAULT_NODE_URI;

  /**
   * @private
   */
  #identityPopupWindow?: Window | null;

  /**
   * @private
   */
  #redirectURI?: string;

  /**
   * @private
   */
  #pendingWindowRequest?: Deferred & { event: NOTIFICATION_EVENTS };

  /**
   * @private
   */
  #defaultTransactionSpendingLimit: TransactionSpendingLimitResponse =
    DEFAULT_TRANSACTION_SPENDING_LIMIT;

  /**
   * @private
   */
  #appName = '';

  /**
   * @private
   */
  #jwtAlgorithm: jwtAlgorithm = 'ES256';

  /**
   * @private
   */
  #defaultGroupName = 'default-key';

  /**
   * @private
   */
  #boundPostMessageListener?: (event: MessageEvent) => void;

  /**
   * @private
   */
  #subscribers: ((notification: SubscriberNotification) => void)[] = [];

  /**
   * @private
   */
  #didConfigure = false;

  /**
   * @private
   */
  #isBrowser: boolean;

  /**
   * @private
   */
  #identityPresenter?: (url: string) => void;

  /**
   * @private
   */
  #storageProvider: T;

  /**
   * @private
   */
  #showSkip = false;

  /**
   * @private
   */
  #isAutoDeriveLogin = false;

  /**
   * Defaults to 10 years. These login keys should essentially never expire
   * unless a user explicity de-authorizes them.
   * @private
   */
  #defaultNumDaysBeforeExpiration = 3650;

  /**
   * The current internal state of identity. This is a combination of the
   * current user and all other users stored in local storage.
   * @private
   */
  #getState(): T extends Storage ? IdentityState : Promise<IdentityState> {
    const users = this.#getUsers();
    const constructState = (
      users: Record<string, StoredUser> | null,
      activePublicKey: string | null
    ) => {
      const currentUser =
        activePublicKey && users && (users[activePublicKey] ?? null);
      const alternateUsers =
        users &&
        Object.keys(users).reduce<Record<string, StoredUser>>(
          (res, publicKey) => {
            if (publicKey !== activePublicKey) {
              res[publicKey] = (users as Record<string, StoredUser>)?.[
                publicKey
              ];
            }
            return res;
          },
          {}
        );

      return {
        currentUser: currentUser && {
          ...currentUser,
          publicKey: currentUser.primaryDerivedKey.publicKeyBase58Check,
        },
        alternateUsers: Object.keys(alternateUsers ?? {})?.length
          ? alternateUsers
          : null,
      };
    };

    if (typeof users?.then === 'function') {
      // we're in async mode
      return Promise.all([users, this.#getActivePublicKey()]).then((args) =>
        constructState(...args)
      ) as T extends Storage ? IdentityState : Promise<IdentityState>;
    } else {
      // we're in sync mode
      const activePublicKey = this.#getActivePublicKey() as string | null;

      return constructState(
        users as Record<string, StoredUser> | null,
        activePublicKey
      ) as T extends Storage ? IdentityState : Promise<IdentityState>;
    }
  }

  /**
   * @private
   */
  #getActivePublicKey(): T extends Storage
    ? string | null
    : Promise<string | null> {
    if (!this.#storageProvider) {
      throw new Error('No storage provider available.');
    }
    const activePublicKey = this.#storageProvider.getItem(
      LOCAL_STORAGE_KEYS.activePublicKey
    );

    if (typeof activePublicKey === 'string' || activePublicKey === null) {
      return activePublicKey as any;
    }

    return activePublicKey as any;
  }

  /**
   * @private
   */
  #getUsers(): T extends Storage
    ? Record<string, StoredUser> | null
    : Promise<Record<string, StoredUser> | null> {
    if (!this.#storageProvider) {
      throw new Error('No storage provider available.');
    }
    const storedUsers = this.#storageProvider.getItem(
      LOCAL_STORAGE_KEYS.identityUsers
    );

    if (typeof storedUsers === 'string' || storedUsers === null) {
      return storedUsers && JSON.parse(storedUsers);
    }

    return storedUsers.then((users) => users && JSON.parse(users)) as any;
  }

  /**
   * @private
   */
  #getCurrentUser(): T extends Storage
    ? StoredUser | null
    : Promise<StoredUser | null> {
    const activePublicKey = this.#getActivePublicKey();

    if (typeof activePublicKey === 'string' || activePublicKey === null) {
      if (!activePublicKey) return null as any;

      // we know we're dealing with sync storage
      const users = this.#getUsers() as Record<string, StoredUser> | null;
      const currentUser =
        (users?.[activePublicKey as string] as StoredUser) ?? null;
      return currentUser as any;
    }

    // we assume we're dealing with async storage if we make it here
    return Promise.all([activePublicKey, this.#getUsers()]).then(
      ([publicKey, users]) => {
        if (!publicKey) return null;
        return (users?.[publicKey] as StoredUser) ?? null;
      }
    ) as any;
  }

  /**
   * The configured nodeURI used for any network calls. Making this accessible
   * behind a getter ensures it is read-only and can only be set via the
   * configure call.
   */
  get nodeURI() {
    return this.#nodeURI;
  }

  /**
   * The configured transaction spending limit values provided by the initial
   * configure call.  These can be used to determine the default tx limit count
   * to use if a derived key needs to be re-authorized.
   */
  get transactionSpendingLimitOptions() {
    return this.#defaultTransactionSpendingLimit;
  }

  constructor(windowProvider: typeof globalThis, apiProvider: APIProvider) {
    this.#window = windowProvider;
    this.#api = apiProvider;
    this.#isBrowser = typeof windowProvider.location !== 'undefined';
    this.#storageProvider = globalThis.localStorage as T;

    if (this.#isBrowser && this.#window.location.search) {
      this.handleRedirectURI(this.#window.location.search);
    }
  }

  /**
   * Configures the identity instance. This should be called before any other
   * method calls, ideally before any app code is run.  The most important
   * configuration options are `spendingLimitOptions` and `appName`.
   * `spendingLimitOptions` is used to determine the default permissions that a
   * user will be asked to approve when logging into an app. `appName` is used
   * to identity derived keys issued by an app.
   *
   * See more about the spending limit options object here
   * https://docs.deso.org/for-developers/backend/blockchain-data/basics/data-types#transactionspendinglimitresponse
   *
   * And See an exhaustive list of transaction types here:
   * https://github.com/deso-protocol/core/blob/a836e4d2e92f59f7570c7a00f82a3107ec80dd02/lib/network.go#L244
   *
   * @example
   * ```typescript
   * import { identity } from '@deso/identity';
   *
   * identity.configure({
   *   spendingLimitOptions: {
   *     // NOTE: this value is in Deso nanos, 1000000000 nanos (or 1e9) = 1 Deso
   *     GlobalDESOLimit: 1 * 1e9 // 1 Deso
   *     // Map of transaction type to the number of times this derived key is
   *     // allowed to perform this operation on behalf of the owner public key
   *     TransactionCountLimitMap: {
   *       BASIC_TRANSFER: 2, // 2 basic transfer transactions are authorized
   *       SUBMIT_POST: 'UNLIMITED', // unlimited submit post transactions are authorized
   *     },
   *   }
   * });
   * ```
   */
  configure({
    identityURI = DEFAULT_IDENTITY_URI,
    network = 'mainnet',
    nodeURI = 'https://node.deso.org',
    spendingLimitOptions = DEFAULT_TRANSACTION_SPENDING_LIMIT,
    redirectURI,
    jwtAlgorithm = 'ES256',
    appName = '',
    storageProvider,
    identityPresenter,
    showSkip,
  }: IdentityConfiguration) {
    this.#identityURI = identityURI;
    this.#network = network;
    this.#nodeURI = nodeURI;
    this.#redirectURI = redirectURI;
    this.#jwtAlgorithm = jwtAlgorithm;
    this.#appName = appName;
    this.#identityPresenter = identityPresenter;
    this.#showSkip = !!showSkip;

    if (storageProvider) {
      this.#storageProvider = storageProvider as T;
    }

    if (!this.#didConfigure) {
      this.#defaultTransactionSpendingLimit =
        buildTransactionSpendingLimitResponse(spendingLimitOptions);

      if (this.#storageProvider) {
        // If we don't have a storage provider it means we are likely running in
        // a node environment (SSR, etc). In this case we will skip
        // refreshDerivedKeyPermissions since it relies on the storage provider.
        // Once the code executes in a UI environment, the storage provider
        // should be available and we can refresh the derived key permissions.
        this.refreshDerivedKeyPermissions();
      }
    }

    this.#didConfigure = true;
  }

  /**
   * Allows listening to changes to identity state. The subscriber will be
   * called with the new state any time a user logs in, logs out, approves a
   * derived key, etc. Apps can use this to sync their state with the identity
   * instance such that their application reacts to changes and re-renders
   * accordingly.
   *
   * NOTE: This method could be very chatty. Depending on the needs of your
   * application, you may want to implement some caching or memoization to
   * reduce any unnecessary re-renders or network calls.
   *
   * @example
   * ```typescript
   * identity.subscribe(({ event, currentUser, alternateUsers }) => {
   *   if (event === NOTIFICATION_EVENTS.AUTHORIZE_DERIVED_KEY_START) {
   *     // show a loading indicator while the underlying network call to authorize the derived key is made.
   *   }
   *
   *   if (event === NOTIFICATION_EVENTS.LOGIN_END) {
   *      // do something with currentUser
   *   }
   *
   *   // see and exhaustive list of events here: https://github.com/deso-protocol/deso-workspace/blob/a3c02742a342610bb6af8f2b1396d5430931cf41/libs/identity/src/lib/types.ts#L182
   * });
   * ```
   *
   * @param subscriber this is a callback that will be called with the current
   * state and the event that triggered the change.
   */
  async subscribe(subscriber: (notification: SubscriberNotification) => void) {
    this.#subscribers.push(subscriber);
    const state = await this.#getState();
    this.#subscribers.forEach((s) =>
      s({ event: NOTIFICATION_EVENTS.SUBSCRIBE, ...state })
    );
  }

  /**
   * Remove a subscriber so it no longer gets called when identity state changes.
   */
  unsubscribe(subscriber: (notification: SubscriberNotification) => void) {
    this.#subscribers = this.#subscribers.filter((s) => s !== subscriber);
  }

  /**
   * Returns the current underlying state of the identity instance. In general,
   * you should use the `subscribe` method to listen to changes to observe and
   * react to the state over time, but if you need a snapshot of the current
   * state you can use this method. Can be useful for debugging or setting up
   * initial state in your app.
   */
  snapshot(): T extends Storage ? IdentityState : Promise<IdentityState> {
    return this.#getState();
  }

  /**
   * Starts a login flow. This will open a new window and prompt the user to
   * select an existing account or create a new account. If there is an error
   * during the login flow, the promise will reject with an error which you can
   * catch and handle in your app by showing some error feedback in the UI.
   *
   * @example
   * ```typescript
   * import { identity, ERROR_TYPES } from '@deso/identity';
   *
   *
   * await identity.login().catch((err) => {
   *   if (err.type === ERROR_TYPES.NO_MONEY) {
   *     // handle no money error
   *   } else {
   *     // handle other errors
   *   }
   * });
   * ```
   *
   * @returns returns a promise that resolves to the identity login
   * payload, or rejects if there was an error.
   */
  async login(
    { getFreeDeso }: LoginOptions = { getFreeDeso: true }
  ): Promise<IdentityDerivePayload> {
    if (!this.#storageProvider) {
      throw new Error(
        'No storage provider available. Did you forget to configure a custom storageProvider?'
      );
    }

    const event = NOTIFICATION_EVENTS.LOGIN_START;
    const state = await this.#getState();
    this.#subscribers.forEach((s) => s({ event, ...state }));

    let derivedPublicKey: string;
    const loginKeyPair = await this.#storageProvider.getItem(
      LOCAL_STORAGE_KEYS.loginKeyPair
    );

    if (loginKeyPair) {
      derivedPublicKey = JSON.parse(loginKeyPair).publicKey;
    } else {
      const keys = keygen();
      derivedPublicKey = publicKeyToBase58Check(keys.public, {
        network: this.#network,
      });
      await this.#storageProvider.setItem(
        LOCAL_STORAGE_KEYS.loginKeyPair,
        JSON.stringify({
          publicKey: derivedPublicKey,
          seedHex: keys.seedHex,
        })
      );
    }

    return await new Promise((resolve, reject) => {
      this.#pendingWindowRequest = { resolve, reject, event };

      const identityParams: {
        derivedPublicKey: string;
        transactionSpendingLimitResponse: TransactionSpendingLimitResponse;
        derive: boolean;
        getFreeDeso?: boolean;
        expirationDays: number;
        showSkip?: boolean;
      } = {
        derive: true,
        derivedPublicKey,
        transactionSpendingLimitResponse: this.#defaultTransactionSpendingLimit,
        expirationDays: this.#defaultNumDaysBeforeExpiration,
        showSkip: this.#showSkip,
      };

      if (getFreeDeso) {
        identityParams.getFreeDeso = true;
      }

      this.#launchIdentity('derive', identityParams);
    });
  }

  async loginWithAutoDerive({
    ownerSeedHex,
  }: {
    ownerSeedHex?: string;
  }): Promise<IdentityDerivePayload> {
    const event = NOTIFICATION_EVENTS.LOGIN_START;
    const state = await this.#getState();
    this.#subscribers.forEach((s) => s({ event, ...state }));

    const ownerKeys = keygen(ownerSeedHex);
    const derivedKeys = keygen();
    const derivedPublicKeyBase58 = publicKeyToBase58Check(derivedKeys.public, {
      network: this.#network,
    });

    // When the derived payload is handled, we look at local storage to see if
    // this is a login derived key, so we need to set this before we handle the response.
    await this.#storageProvider?.setItem(
      LOCAL_STORAGE_KEYS.loginKeyPair,
      JSON.stringify({
        publicKey: derivedPublicKeyBase58,
        seedHex: derivedKeys.seedHex,
      })
    );

    const payload = await this.#generateDerivedKeyPayload(
      ownerKeys,
      derivedKeys
    );

    return new Promise((resolve, reject) => {
      this.#pendingWindowRequest = { resolve, reject, event };
      // NOTE: this is a bit hacky, but we need to ensure showSkip is true so we
      // don't get stuck when the user has no money and we can't authorize the
      // derived key.
      this.#isAutoDeriveLogin = true;
      this.#handleIdentityResponse({
        service: 'identity',
        method: 'derive',
        payload,
      });
    });
  }

  #generateDerivedKeyPayload = async (
    ownerKeys: KeyPair,
    derivedKeys: KeyPair
  ): Promise<IdentityDerivePayload> => {
    const { BlockHeight } = (await this.#api.post(
      `${this.#nodeURI}/api/v0/get-app-state`,
      {}
    )) as GetAppStateResponse;
    // days * (24 hours / day) * (60 minutes / hour) * (1 block / 5 minutes) = blocks
    const expirationBlockHeight =
      BlockHeight + (this.#defaultNumDaysBeforeExpiration * 24 * 60) / 5;
    const ownerPublicKeyBase58 = publicKeyToBase58Check(ownerKeys.public, {
      network: this.#network,
    });
    const derivedPublicKeyBase58 = publicKeyToBase58Check(derivedKeys.public, {
      network: this.#network,
    });

    const { TransactionSpendingLimitHex } = await this.#api.post(
      `${this.#nodeURI}/api/v0/get-access-bytes`,
      {
        DerivedPublicKeyBase58Check: derivedPublicKeyBase58,
        ExpirationBlock: expirationBlockHeight,
        TransactionSpendingLimit: this.#defaultTransactionSpendingLimit,
      }
    );

    const transactionSpendingLimitBytes = TransactionSpendingLimitHex
      ? ecUtils.hexToBytes(TransactionSpendingLimitHex)
      : [];

    const accessBytes = new Uint8Array([
      ...derivedKeys.public,
      ...uvarint64ToBuf(expirationBlockHeight),
      ...transactionSpendingLimitBytes,
    ]);

    const accessHash = sha256X2(accessBytes);

    const [accessSignature] = await sign(
      ecUtils.bytesToHex(accessHash),
      ecUtils.hexToBytes(ownerKeys.seedHex)
    );

    const messagingKey = deriveAccessGroupKeyPair(
      ownerKeys.seedHex,
      this.#defaultGroupName
    );

    const {
      AccessGroupPublicKeyBase58Check,
      AccessGroupPrivateKeyHex,
      AccessGroupKeyName,
    } = await this.accessGroupStandardDerivation(this.#defaultGroupName, {
      messagingPrivateKey: messagingKey.seedHex,
    });

    const messagingKeyHash = sha256X2(
      new Uint8Array([
        ...messagingKey.public,
        ...new TextEncoder().encode(this.#defaultGroupName),
      ])
    );

    const [messagingKeySignature] = await sign(
      ecUtils.bytesToHex(messagingKeyHash),
      ecUtils.hexToBytes(ownerKeys.seedHex)
    );

    return {
      derivedSeedHex: derivedKeys.seedHex,
      derivedPublicKeyBase58Check: derivedPublicKeyBase58,
      publicKeyBase58Check: ownerPublicKeyBase58,
      btcDepositAddress: 'Not implemented yet',
      ethDepositAddress: 'Not implemented yet',
      expirationBlock: expirationBlockHeight,
      network: this.#network,
      accessSignature: ecUtils.bytesToHex(accessSignature),
      jwt: '', // NOTE: We should not need this since we generate JWTs on the fly when we need it.
      derivedJwt: '', // NOTE: We should not need this since we generate JWTs on the fly when we need it.
      messagingPublicKeyBase58Check: AccessGroupPublicKeyBase58Check,
      messagingPrivateKey: AccessGroupPrivateKeyHex,
      messagingKeyName: AccessGroupKeyName,
      messagingKeySignature: ecUtils.bytesToHex(messagingKeySignature),
      transactionSpendingLimitHex: TransactionSpendingLimitHex,
      signedUp: false, // QUESTION: Should this be true? I think either false or true is okay, but not totally clear until we do a full ETE test.
      publicKeyAdded: ownerPublicKeyBase58,
    };
  };

  /**
   * Starts a logout flow. This will open a new window and prompt the user to
   * confirm they want to logout. Similar to the login flow, if there is an error
   * the returned promise will reject with an error which you can catch and handle.
   *
   * @example
   * ```typescript
   * import { identity } from '@deso/identity';
   *
   *
   * await identity.logout().catch((err) => {
   *   // handle errors
   * });
   * ```
   *
   * @returns returns a promise that resolves to undefined, or rejects if there
   * was an error.
   */
  async logout(): Promise<undefined> {
    const event = NOTIFICATION_EVENTS.LOGOUT_START;
    const state = await this.#getState();
    this.#subscribers.forEach((s) => s({ event, ...state }));

    return new Promise((resolve, reject) => {
      const activePublicKey = this.#getActivePublicKey();
      const launchIdentity = (activePublicKey: string | null) => {
        this.#pendingWindowRequest = { resolve, reject, event };
        if (!activePublicKey) {
          this.#pendingWindowRequest.reject(
            new Error('cannot logout without an active public key')
          );
        } else {
          this.#launchIdentity('logout', { publicKey: activePublicKey });
        }
      };

      // NOTE: in the case of a browser context, we are using synchronous local
      // storage, We cannot introduce any async operations because it may
      // trigger popup blockers, which is why we need to branch the logic like
      // this.
      if (typeof activePublicKey === 'string' || activePublicKey === null) {
        launchIdentity(activePublicKey);
      } else {
        activePublicKey?.then(launchIdentity);
      }
    });
  }

  /**
   * Signs a transaction hex using the derived key issued to the currently
   * active user when they logged into an application. The `TransactionHex`
   * parameter should come from a transaction object returned from a transaction
   * construction endpoint, such as the `submit-post` endpoint of the DeSo
   * backend api.
   *
   * We return a signed transaction hex value that can be used to submit a
   * transaction to the network for confirmation. This method is used internally
   * by the signAndSubmit method, which is a convenience method to sign and
   * submit a transaction in a single step. It can also be used as a standalone
   * method if you want to sign a transaction and submit it yourself.
   *
   *
   * @example
   * ```typescript
   * const signedTxHex = await identity.signTx(txHex);
   * ```
   */
  async signTx(TransactionHex: string) {
    const { primaryDerivedKey } = (await this.#getCurrentUser()) ?? {};

    if (!primaryDerivedKey?.derivedSeedHex) {
      // This *should* never happen, but just in case we throw here to surface any bugs.
      throw new Error('Cannot sign transaction without a derived seed hex');
    }

    return await signTx(TransactionHex, primaryDerivedKey.derivedSeedHex, {
      isDerivedKey: true,
    });
  }

  /**
   * Submits a signed transaction to the network for confirmation. NOTE: you
   * must sign a transaction before submitting it. This method is used
   * internally by the `signAndSubmit` method, which is a convenience method to
   * sign and submit a transaction in a single step.
   *
   * @example
   * ```typescript
   * const submittedTx = await identity.submitTx(signedTxHex);
   * ```
   */
  async submitTx(TransactionHex: string) {
    const res = await this.#api.post(
      `${this.#nodeURI}/api/v0/submit-transaction`,
      {
        TransactionHex,
      }
    );

    this.refreshDerivedKeyPermissions();

    return res;
  }

  /**
   * This is a convenience method to sign and submit a transaction in a single
   * step. It receives a transaction object and signs it using the derived key
   * issued to the currently logged in user. This can be chained with
   * transaction construction promises that return a transaction object such as
   * a promise that wraps the call to the `submit-post` endpoint of the DeSo
   * backend api.
   *
   * @example
   * ```typescript
   * const transactionObject = await myApiClient.post('https://node.deso.org/api/v0/submit-post', { ...data });
   *
   * await identity.signAndSubmit(transactionObject);
   * ```
   */
  async signAndSubmit(tx: {
    TransactionHex: string;
  }): Promise<SubmitTransactionResponse> {
    return await this.submitTx(await this.signTx(tx.TransactionHex));
  }

  /**
   * @deprecated Use signAndSubmit instead. Since we don't support unauthorized
   * keys anymore, this is no longer necessary. It's only purpose was to
   * authorize a derived key if it wasn't already authorized and retry the
   * transaction.
   *
   * @param constructTx generic function for constructing a transaction. Should
   * return a promise that resolves to a transaction object.
   * @returns
   */
  async signAndSubmitTx(
    constructTx: () => Promise<{ TransactionHex: string }>
  ) {
    try {
      const tx = await constructTx();
      return await this.submitTx(await this.signTx(tx.TransactionHex));
    } catch (e: any) {
      // if the derived key is not authorized, authorize it and try again
      if (e?.message?.includes('RuleErrorDerivedKeyNotAuthorized')) {
        const { primaryDerivedKey } = (await this.#getCurrentUser()) ?? {};
        if (primaryDerivedKey == null) {
          throw new Error(
            'Cannot authorize derived key without a logged in user'
          );
        }
        // if the derived key is not authorized
        // we try to authorize it and retry
        await this.#authorizePrimaryDerivedKey(
          primaryDerivedKey.publicKeyBase58Check
        );

        // reconstruct the original transaction and try again
        // this will throw if the previous authorization failed
        const tx = await constructTx();
        return await this.submitTx(await this.signTx(tx.TransactionHex));
      }

      // just rethrow unexpected errors
      throw e;
    }
  }

  /**
   * Encrypt an arbitrary string using the recipient's
   * public key.
   *
   * @example
   * ```typescript
   * const message = "Hi, this is my first encrypted message!";
   *
   * const cipherText = await identity.encryptMessage(
   *   recipientPublicKeyBase58Check,
   *   message
   * );
   * ```
   */
  async encryptMessage(
    recipientPublicKeyBase58Check: string,
    messagePlainText: string
  ) {
    const { primaryDerivedKey } = (await this.#getCurrentUser()) ?? {};

    if (!primaryDerivedKey?.messagingPrivateKey) {
      // This *should* never happen, but just in case we throw here to surface any bugs.
      throw new Error('Cannot encrypt message without a private messaging key');
    }

    return await encryptChatMessage(
      primaryDerivedKey.messagingPrivateKey,
      recipientPublicKeyBase58Check,
      messagePlainText
    );
  }

  /**
   * @param message This is a message object returned any of the messages
   * endpoints of the DeSo backend api, could be a DM or a Group message.
   * @param groups This is an array of group chats the user belongs to. This is
   * required to decrypt group messages.
   * @returns
   */
  async decryptMessage(
    message: NewMessageEntryResponse,
    groups: AccessGroupEntryResponse[]
  ): Promise<DecryptedMessageEntryResponse> {
    const { primaryDerivedKey, publicKey: userPublicKeyBase58Check } =
      (await this.#getCurrentUser()) ?? {};
    if (!(primaryDerivedKey?.messagingPrivateKey && userPublicKeyBase58Check)) {
      // This *should* never happen, but just in case we throw here to surface any bugs.
      throw new Error('Cannot decrypt messages without a logged in user');
    }

    const isSender =
      message.SenderInfo.OwnerPublicKeyBase58Check ===
        userPublicKeyBase58Check &&
      (message.SenderInfo.AccessGroupKeyName === this.#defaultGroupName ||
        !message.SenderInfo.AccessGroupKeyName);
    let DecryptedMessage = '';
    let errorMsg = '';

    switch (message.ChatType) {
      case ChatType.DM:
        if (message.MessageInfo?.ExtraData?.unencrypted) {
          DecryptedMessage = unencryptedHexToPlainText(
            message.MessageInfo.EncryptedText
          );
        } else {
          try {
            DecryptedMessage = await this.#decryptDM(
              userPublicKeyBase58Check,
              primaryDerivedKey.messagingPrivateKey,
              message,
              isSender
            );
          } catch (e: any) {
            errorMsg = e?.toString() ?? 'Could not decrypt direct message';
          }
        }
        break;
      case ChatType.GROUPCHAT:
        try {
          DecryptedMessage = await this.#decryptGroupChat(groups, message);
        } catch (e: any) {
          errorMsg = e?.toString() ?? 'Could not decrypt group message';
        }
        break;
      default:
        // If we add new chat types, we need to add explicit support for them.
        throw new Error(`unsupported chat type: ${message.ChatType}`);
    }

    return {
      ...message,
      ...{ DecryptedMessage, IsSender: isSender, error: errorMsg },
    };
  }

  /**
   * Decrypts the encrypted access group private key that we will need to use to decrypt group messages.
   *
   * @param encryptedKeyHex
   * @returns returns a promise that resolves t the decrypted key pair.
   */
  async decryptAccessGroupKeyPair(encryptedKeyHex: string) {
    const { primaryDerivedKey } = (await this.#getCurrentUser()) ?? {};

    if (!primaryDerivedKey?.messagingPrivateKey) {
      // This *should* never happen, but just in case we throw here to surface any bugs.
      throw new Error('Cannot encrypt message without a private messaging key');
    }

    const decryptedPrivateKeyHex = await decrypt(
      primaryDerivedKey.messagingPrivateKey,
      encryptedKeyHex
    );

    return keygen(decryptedPrivateKeyHex);
  }

  /**
   * Generate a key pair for an access group. This is used to encrypt and
   * decrypt group messages.
   *
   * @param groupName the plaintext name of the group chat
   * @param options.messagingPrivateKey the optional messaging private key
   * @returns a promise that resolves to the new key info.
   */
  async accessGroupStandardDerivation(
    groupName: string,
    { messagingPrivateKey }: { messagingPrivateKey?: string } = {}
  ): Promise<AccessGroupPrivateInfo> {
    const { primaryDerivedKey } = (await this.#getCurrentUser()) ?? {};
    const messagingKey =
      messagingPrivateKey ?? primaryDerivedKey?.messagingPrivateKey;

    if (!messagingKey) {
      // This *should* never happen, but just in case we throw here to surface any bugs.
      throw new Error('Cannot derive access group without a messaging key');
    }

    const keys = deriveAccessGroupKeyPair(messagingKey, groupName);
    const publicKeyBase58Check = publicKeyToBase58Check(keys.public, {
      network: this.#network,
    });

    return {
      AccessGroupPrivateKeyHex: keys.seedHex,
      AccessGroupPublicKeyBase58Check: publicKeyBase58Check,
      AccessGroupKeyName: groupName,
    };
  }

  /**
   * Get a jwt token signed by the derived key issued to the currently active user. This can be used to pass to
   * authenticated endpoints on the DeSo backend api or to create authenticated endpoints on your own backend.
   * Typically this will be used to construct an Authorization header or pass as a parameter in a post body.
   *
   * @example
   * ```typescript
   * const token = await identity.jwt();
   *
   * const authHeaders = {
   *   Authorization: `Bearer ${token}`,
   * }
   *
   * myApiClient.post('https://myapi.com/some-authenticated-endpoint', { ...data }, { headers: authHeaders });
   * ```
   */
  async jwt() {
    const { primaryDerivedKey } = (await this.#getCurrentUser()) ?? {};

    if (!primaryDerivedKey?.derivedSeedHex) {
      // This *should* never happen, but just in case we throw here to surface any bugs.
      throw new Error('Cannot sign jwt without a derived seed hex');
    }

    return await getSignedJWT(
      primaryDerivedKey.derivedSeedHex,
      this.#jwtAlgorithm,
      {
        derivedPublicKeyBase58Check:
          primaryDerivedKey.derivedPublicKeyBase58Check,
        expiration: 60 * 10,
      }
    );
  }

  /**
   * This method will open a new identity window with a options for getting deso
   * by verifying a phone number or buying/transferring deso anonymously for the
   * currently logged in user. NOTE: A user must already be logged in to use
   * this method.
   *
   * @example
   * ```typescript
   * await identity.getDeso();
   * ```
   */
  async getDeso() {
    const event = NOTIFICATION_EVENTS.GET_FREE_DESO_START;
    const state = await this.#getState();
    this.#subscribers.forEach((s) => s({ event, ...state }));

    return await new Promise((resolve, reject) => {
      const activePublicKey = this.#getActivePublicKey();
      const launchIdentity = (activePublicKey: string | null) => {
        this.#pendingWindowRequest = { resolve, reject, event };

        if (!activePublicKey) {
          this.#pendingWindowRequest.reject(
            new Error('Cannot get free deso without a logged in user')
          );
          return;
        }

        this.#launchIdentity('get-deso', {
          publicKey: activePublicKey,
          getFreeDeso: true,
          showSkip: this.#showSkip,
        });
      };

      // NOTE: in the case of a browser context, we are using synchronous local
      // storage, We cannot introduce any async operations because it may
      // trigger popup blockers, which is why we need to branch the logic like
      // this.
      if (typeof activePublicKey === 'string' || activePublicKey === null) {
        launchIdentity(activePublicKey);
      } else {
        activePublicKey?.then(launchIdentity);
      }
    });
  }

  /**
   * This method is very similar to getDeso, but it will only present the option
   * for verifying a phone number to get deso. Also requires a user to be logged in.
   *
   * @example
   * ```typescript
   * await identity.verifyPhoneNumber();
   * ```
   */
  async verifyPhoneNumber() {
    const event = NOTIFICATION_EVENTS.VERIFY_PHONE_NUMBER_START;
    const state = await this.#getState();
    this.#subscribers.forEach((s) => s({ event, ...state }));
    return await new Promise((resolve, reject) => {
      const activePublicKey = this.#getActivePublicKey();
      const launchIdentity = (activePublicKey: string | null) => {
        this.#pendingWindowRequest = { resolve, reject, event };

        if (!activePublicKey) {
          this.#pendingWindowRequest.reject(
            new Error('Cannon verify phone number without an active user')
          );
        }

        this.#launchIdentity('verify-phone-number', {
          public_key: activePublicKey,
          showSkip: this.#showSkip,
        });
      };

      // NOTE: in the case of a browser context, we are using synchronous local
      // storage, We cannot introduce any async operations because it may
      // trigger popup blockers, which is why we need to branch the logic like
      // this.
      if (typeof activePublicKey === 'string' || activePublicKey === null) {
        launchIdentity(activePublicKey);
      } else {
        activePublicKey?.then(launchIdentity);
      }
    });
  }

  /**
   * This method will set the currently active user. This is useful for changing
   * accounts when a user has logged into an application with multiple accounts.
   * NOTE: This method will not trigger a login event, but, rather, it will do a
   * lookup on all the users that have already been logged in to find the user
   * with the matching public key.  If the key is not found, it will throw an
   * error. The users that are available to be set as active are provided via
   * the `alternateUsers` property on the state object.
   *
   * @example
   * ```typescript
   * identity.setActiveUser(someLoggedInPublicKey);
   * ```
   */
  setActiveUser(publicKey: string): T extends Storage ? void : Promise<void> {
    const maybePromise = this.#setActiveUser(publicKey);

    if (typeof maybePromise?.then === 'function') {
      // we're in async storage mode
      return maybePromise.then(() => {
        return (this.#getState() as Promise<IdentityState>).then((state) => {
          this.refreshDerivedKeyPermissions();
          this.#subscribers.forEach((s) =>
            s({
              event: NOTIFICATION_EVENTS.CHANGE_ACTIVE_USER,
              ...state,
            })
          );
        });
      }) as T extends Storage ? void : Promise<void>;
    }

    // sync storage
    const state = this.#getState() as IdentityState;
    this.refreshDerivedKeyPermissions();
    this.#subscribers.forEach((s) =>
      s({
        event: NOTIFICATION_EVENTS.CHANGE_ACTIVE_USER,
        ...state,
      })
    );

    return undefined as T extends Storage ? void : Promise<void>;
  }

  /**
   * Reloads the derived key permissions for the active user. NOTE: In general
   * consumers should not need to call this directly, but it is exposed for
   * advanced use cases. We call this internally any time derived key
   * permissions are updated, a transaction is submitted, or the logged in user
   * changes.
   * @returns void
   */
  async refreshDerivedKeyPermissions() {
    const { primaryDerivedKey } = (await this.#getCurrentUser()) ?? {};

    if (
      primaryDerivedKey == null ||
      primaryDerivedKey.derivedKeyRegistered === false
    ) {
      // if we don't have a logged in user, we just bail
      return;
    }

    try {
      const resp = await this.#api.get(
        `${this.#nodeURI}/api/v0/get-single-derived-key/${
          primaryDerivedKey.publicKeyBase58Check
        }/${primaryDerivedKey.derivedPublicKeyBase58Check}`
      );
      await this.#updateUser(primaryDerivedKey.publicKeyBase58Check, {
        primaryDerivedKey: {
          ...primaryDerivedKey,
          transactionSpendingLimits:
            resp.DerivedKey?.TransactionSpendingLimit ?? null,
          IsValid: !!resp.DerivedKey?.IsValid,
        },
      });
    } catch (e) {
      // TODO: handle this better?
      if (this.#window.location.hostname === 'localhost') {
        console.error(e);
      }
    }
  }

  async generateDerivedKey(seedHex: string) {}

  /**
   * Use this in a browser context where localStorage is used as the storage
   * provider, and it is necessary to check permissions synchronously to prevent
   * issues with pop up blockers. If a user's derived key has the permissions to
   * perform a given action or batch of actions. The permissions are passed in
   * as an object with the same shape as the
   * `TransactionSpendingLimitResponseOptions` type, which is the same as the
   * `spendingLimitOptions` passed to the configure method.
   *
   *
   * @example
   * Here we check if the user has the permissions to submit at least 1 post.
   *
   * ```typescript
   * const hasPermissions = identity.hasPermissions({
   *   TransactionCountLimitMap: {
   *     SUBMIT_POST: 1,
   *    },
   * });
   * ```
   */
  hasPermissions(
    permissionsToCheck: Partial<TransactionSpendingLimitResponseOptions>
  ): T extends Storage ? boolean : Promise<boolean> {
    if (Object.keys(permissionsToCheck).length === 0) {
      throw new Error('You must pass at least one permission to check');
    }

    const users = this.#getUsers();
    const checkPermissions = (
      users: Record<string, StoredUser> | null,
      activeKey: string | null
    ) => {
      if (!(users && activeKey)) {
        return false as any;
      }

      const activeUser = (users as Record<string, StoredUser>)[
        activeKey as string
      ];

      const { primaryDerivedKey } = activeUser ?? {};

      // If the key is expired, unauthorized, or has no money we can't do anything with it
      if (
        !primaryDerivedKey?.IsValid ||
        primaryDerivedKey?.derivedKeyRegistered === false
      ) {
        return false as any;
      }

      // if the key has no spending limits, we can't do anything with it
      if (!primaryDerivedKey?.transactionSpendingLimits) {
        return false as any;
      }

      return compareTransactionSpendingLimits(
        permissionsToCheck,
        primaryDerivedKey.transactionSpendingLimits
      );
    };

    if (typeof users?.then === 'function') {
      // async mode
      return Promise.all([users, this.#getActivePublicKey()]).then(
        ([users, activeKey]) => checkPermissions(users, activeKey)
      ) as any;
    } else {
      // sync mode
      const activeKey = this.#getActivePublicKey();
      return checkPermissions(
        users as Record<string, StoredUser>,
        activeKey as string
      ) as any;
    }
  }

  /**
   * This method will request permissions from the user to perform an action or
   * batch of actions. It will open an identity window and prompt the user to
   * approve the permissions requested. It also takes a
   * `TransactionSpendingLimitResponseOptions` object.
   *
   * @example
   *
   * ```typescript
   * await identity.requestPermissions({
   *   TransactionCountLimitMap: {
   *     SUBMIT_POST: 'UNLIMITED',
   *    },
   * });
   * ```
   */
  async requestPermissions(
    transactionSpendingLimitResponse: Partial<TransactionSpendingLimitResponseOptions>
  ) {
    const { primaryDerivedKey } = (await this.#getCurrentUser()) ?? {};
    if (primaryDerivedKey == null) {
      throw new Error('Cannot request permissions without a logged in user');
    }

    const { publicKeyBase58Check, derivedPublicKeyBase58Check } =
      primaryDerivedKey;

    return await this.derive(transactionSpendingLimitResponse, {
      ownerPublicKey: publicKeyBase58Check,
      derivedPublicKey: derivedPublicKeyBase58Check,
    });
  }

  /**
   * This method will issue a derive request to identity which can be used to
   * either create a new derived key or to update an existing derived key.  It
   * will open an identity window and prompt the user to approve the action for
   * the derived key. It optionally take an existing derived key and/or an owner
   * public key. If the owner key is not provided, the user will first be asked
   * to login or create an account. Otherwise the user will be prompted with the
   * derived key approval window immediately. If a derived key is not provided,
   * a new one will be created.
   *
   * @example
   *
   * ```typescript
   * await identity.derive({
   *   TransactionCountLimitMap: {
   *     SUBMIT_POST: 'UNLIMITED',
   *    },
   * }, {
   * });
   * ```
   */
  async derive(
    transactionSpendingLimitResponse: Partial<TransactionSpendingLimitResponseOptions>,
    options?: {
      derivedPublicKey?: string;
      expirationDays?: number;
      deleteKey?: boolean;
      ownerPublicKey?: string;
    }
  ) {
    const event = NOTIFICATION_EVENTS.REQUEST_PERMISSIONS_START;
    const state = await this.#getState();
    this.#subscribers.forEach((s) => s({ event, ...state }));

    return await new Promise((resolve, reject) => {
      this.#pendingWindowRequest = { resolve, reject, event };

      const params = {
        derive: true,
        ...(!!options?.derivedPublicKey && {
          derivedPublicKey: options.derivedPublicKey,
        }),
        ...(!!options?.expirationDays && {
          expirationDays: options.expirationDays,
        }),
        ...(!!options?.deleteKey && {
          deleteKey: options.deleteKey,
        }),
        ...(!!options?.ownerPublicKey && { publicKey: options.ownerPublicKey }),
        transactionSpendingLimitResponse: buildTransactionSpendingLimitResponse(
          transactionSpendingLimitResponse
        ),
        showSkip: this.#showSkip,
      };

      this.#launchIdentity('derive', params);
    });
  }

  desoAddressToEthereumAddress(address: string) {
    const desoPKBytes = bs58PublicKeyToBytes(address).slice(1);
    const ethPKHex = ecUtils.bytesToHex(keccak_256(desoPKBytes)).slice(24);
    // EIP-55 requires a checksum. Reference implementation: https://eips.ethereum.org/EIPS/eip-55
    const checksum = ecUtils.bytesToHex(keccak_256(ethPKHex));

    return Array.from(ethPKHex).reduce(
      (ethAddress, char, index) =>
        ethAddress +
        (parseInt(checksum[index], 16) >= 8 ? char.toUpperCase() : char),
      '0x'
    );
  }

  // TODO: make sure this works and write a test for it...
  async ethereumAddressToDesoAddress(address: string) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error('Invalid Ethereum address');
    }

    const transactions = await this.#getETHTransactionsSignedByAddress(address);
    if (transactions.length === 0) {
      throw new Error(
        `ETH address must sign at least one transaction in order to recover its public key: ${address}`
      );
    }

    const ethNet = DESO_NETWORK_TO_ETH_NETWORK[this.#network];
    let ethereumPublicKey = '';

    for (const { hash } of transactions) {
      try {
        const resp = await this.#queryETHRPC({
          Method: 'eth_getTransactionByHash',
          Params: [hash],
          UseNetwork: ethNet,
        });
        const txn = resp.result as InfuraTx;
        const signature = ethers.utils.joinSignature({
          r: txn.r,
          s: txn.s,
          v: parseInt(txn.v, 16),
        });

        // Special thanks for this answer on ethereum.stackexchange.com: https://ethereum.stackexchange.com/a/126308
        let txnData: any;
        // TODO: figure out how to handle AccessList (type 1) transactions.
        switch (parseInt(txn.type, 16)) {
          case 0:
            txnData = {
              gasPrice: txn.gasPrice,
              gasLimit: txn.gas,
              value: txn.value,
              nonce: parseInt(txn.nonce, 16),
              data: txn.input,
              chainId: parseInt(
                txn.chainId ? txn.chainId : ethNet === 'goerli' ? '0x5' : '0x1',
                16
              ),
              to: txn.to,
            };
            break;
          case 2:
            txnData = {
              gasLimit: txn.gas,
              value: txn.value,
              nonce: parseInt(txn.nonce, 16),
              data: txn.input,
              chainId: parseInt(
                txn.chainId ? txn.chainId : ethNet === 'goerli' ? '0x5' : '0x1',
                16
              ),
              to: txn.to,
              type: 2,
              maxFeePerGas: txn.maxFeePerGas,
              maxPriorityFeePerGas: txn.maxPriorityFeePerGas,
            };
            break;
          default:
            throw new Error('Unsupported txn type');
        }

        const rstxn = await ethers.utils.resolveProperties(txnData);
        const raw = ethers.utils.serializeTransaction(rstxn as any); // returns RLP encoded transactionHash
        const msgHash = ethers.utils.keccak256(raw); // as specified by ECDSA
        const msgBytes = ethers.utils.arrayify(msgHash); // create binary hash
        const recoveredPubKey = ethers.utils.recoverPublicKey(
          msgBytes,
          signature
        );
        const recoveredAddress = ethers.utils.computeAddress(recoveredPubKey);
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
          throw new Error(
            `recovered address ${recoveredAddress} does not match expected address ${address}`
          );
        }
        ethereumPublicKey = recoveredPubKey.slice(2);
        // break out of the loop for the first successful recovery
        break;
      } catch (e) {
        // log the error but keep looking
        console.error(`error recovering public key from txn: ${hash}`, e);
      }
    }

    if (!ethereumPublicKey) {
      throw new Error(
        `failed to recover public key for eth address: ${address}`
      );
    }

    const compressedEthKey = Point.fromHex(ethereumPublicKey).toRawBytes(true);
    return publicKeyToBase58Check(compressedEthKey, { network: this.#network });
  }

  /**
   * Method to handle the redirect URI from the identity service. Typically this
   * would be useful in a mobile context where the user is redirected back to
   * the app after completing the identity flow.
   */
  handleRedirectURI(redirectURI: string) {
    // Check if the URL contains identity query params at startup
    const query = redirectURI.split('?')[1];
    const queryParams = new URLSearchParams(query);

    if (queryParams.get('service') === IDENTITY_SERVICE_VALUE) {
      const initialResponse = parseQueryParams(queryParams);
      // Strip the identity query params from the URL. replaceState removes it from browser history
      this.#window.history?.replaceState(
        {},
        '',
        this.#window.location.pathname
      );
      this.#handleIdentityResponse(initialResponse);
    }

    setTimeout(() => {
      if (!this.#didConfigure) {
        this.refreshDerivedKeyPermissions();
      }
    }, 50);
  }

  async #queryETHRPC(params: QueryETHRPCRequest): Promise<InfuraResponse> {
    return await this.#api.post(
      `${this.#nodeURI}/api/v0/query-eth-rpc`,
      params
    );
  }

  async #getETHTransactionsSignedByAddress(
    address: string
  ): Promise<EtherscanTransaction[]> {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error('Invalid Ethereum address');
    }

    const resp = (await this.#api.get(
      `${
        this.#nodeURI
      }/api/v0/get-eth-transactions-for-eth-address/${address}?eth_network=${
        DESO_NETWORK_TO_ETH_NETWORK[this.#network]
      }`
    )) as EtherscanTransactionsByAddressResponse;

    if (resp.status !== '1' || !resp.message.startsWith('OK')) {
      throw new Error(
        `Error fetching ETH transactions for address ${address}: ${resp.message}`
      );
    }

    return resp.result.filter(
      (tx) => tx.from.toLowerCase() === address.toLowerCase()
    );
  }

  /**
   * @private
   */
  async #authorizeDerivedKey(params: AuthorizeDerivedKeyRequest) {
    return await this.#api.post(
      `${this.#nodeURI}/api/v0/authorize-derived-key`,
      params
    );
  }

  /**
   * @private
   */
  #setActiveUser(publicKey: string): T extends Storage ? void : Promise<void> {
    const users = this.#getUsers();
    const updateActiveKey = (
      users: Record<string, StoredUser> | null,
      newActivePublicKey: string | null
    ): T extends Storage ? void : Promise<void> => {
      if (!(newActivePublicKey && users?.[newActivePublicKey])) {
        throw new Error(
          `No user found for public key. Stored users: ${JSON.stringify(
            users ?? {}
          )}`
        );
      }

      if (!this.#storageProvider) {
        throw new Error(
          'No storage provider available. Did you forget to configure a storageProvider?'
        );
      }

      return this.#storageProvider.setItem(
        LOCAL_STORAGE_KEYS.activePublicKey,
        publicKey
      ) as any;
    };

    if (typeof users?.then === 'function') {
      return users.then((users) => updateActiveKey(users, publicKey)) as any;
    } else {
      return updateActiveKey(
        users as Record<string, StoredUser> | null,
        publicKey
      ) as any;
    }
  }

  /**
   * @private
   */
  #getErrorType(e: Error): ERROR_TYPES | undefined {
    if (
      e?.message?.indexOf(
        'Total input 0 is not sufficient to cover the spend amount'
      ) >= 0
    ) {
      return ERROR_TYPES.NO_MONEY;
    }

    return undefined;
  }

  /**
   * @private
   */
  async #authorizePrimaryDerivedKey(ownerPublicKey: string) {
    const state1 = await this.#getState();
    this.#subscribers.forEach((s) =>
      s({
        event: NOTIFICATION_EVENTS.AUTHORIZE_DERIVED_KEY_START,
        ...state1,
      })
    );
    const users = await this.#getUsers();
    const primaryDerivedKey = users?.[ownerPublicKey]?.primaryDerivedKey;

    if (primaryDerivedKey == null) {
      throw new Error(
        `No primary derived key found for user ${ownerPublicKey}`
      );
    }

    const trimmedAppName = this.#appName.trim();
    const Memo =
      trimmedAppName.length > 0
        ? trimmedAppName
        : this.#window.location?.hostname ?? 'unknown';

    const resp = await this.#authorizeDerivedKey({
      OwnerPublicKeyBase58Check: primaryDerivedKey.publicKeyBase58Check,
      DerivedPublicKeyBase58Check:
        primaryDerivedKey.derivedPublicKeyBase58Check,
      ExpirationBlock: primaryDerivedKey.expirationBlock,
      AccessSignature: primaryDerivedKey.accessSignature,
      DeleteKey: false,
      DerivedKeySignature: false,
      MinFeeRateNanosPerKB: 1000,
      TransactionSpendingLimitHex:
        primaryDerivedKey.transactionSpendingLimitHex,
      Memo,
      AppName: this.#appName,
      TransactionFees: [],
      ExtraData: {},
    });

    const signedTx = await this.signTx(resp.TransactionHex);
    const result = await this.submitTx(signedTx);
    const state2 = await this.#getState();

    this.#subscribers.forEach((s) =>
      s({
        event: NOTIFICATION_EVENTS.AUTHORIZE_DERIVED_KEY_END,
        ...state2,
      })
    );

    return result;
  }

  /**
   * @private
   */
  #handlePostMessage(ev: MessageEvent) {
    if (
      ev.origin !== this.#identityURI ||
      ev.data.service !== IDENTITY_SERVICE_VALUE ||
      ev.source === null
    ) {
      return;
    }

    if (ev.data.method === 'initialize') {
      ev.source.postMessage(
        {
          id: ev.data.id,
          service: IDENTITY_SERVICE_VALUE,
          payload: {},
        },
        this.#identityURI as WindowPostMessageOptions
      );
    } else {
      this.#handleIdentityResponse(ev.data);
      this.#identityPopupWindow?.close();
      if (this.#boundPostMessageListener != null) {
        this.#window.removeEventListener(
          'message',
          this.#boundPostMessageListener
        );
      }
      this.#boundPostMessageListener = undefined;
    }
  }

  /**
   * @private
   */
  #handleIdentityResponse({ method, payload = {} }: IdentityResponse) {
    switch (method) {
      case 'derive':
        this.#handleDeriveMethod(payload as IdentityDerivePayload)
          .then(async (res) => {
            const state = await this.#getState();
            this.#subscribers.forEach((s) =>
              s({
                event:
                  this.#pendingWindowRequest?.event ===
                  NOTIFICATION_EVENTS.LOGIN_START
                    ? NOTIFICATION_EVENTS.LOGIN_END
                    : NOTIFICATION_EVENTS.REQUEST_PERMISSIONS_END,
                ...state,
              })
            );
            this.#pendingWindowRequest?.resolve(res);
          })
          .catch(async (e) => {
            // if we're in a login flow just don't let the user log in if we
            // can't authorize their derived key.  we've already stored the user
            // in local storage before attempting to authorize, so we remove
            // their data.
            const currentUser = await this.#getCurrentUser();
            const showSkipAndNoMoney =
              (this.#showSkip || this.#isAutoDeriveLogin) &&
              e.message.indexOf('RuleErrorInsufficientBalance') >= 0;
            if (showSkipAndNoMoney && currentUser != null) {
              await this.#updateUser(currentUser.publicKey, {
                primaryDerivedKey: {
                  ...currentUser.primaryDerivedKey,
                  ...payload,
                  derivedKeyRegistered: false,
                },
              });
            } else if (
              this.#pendingWindowRequest?.event ===
                NOTIFICATION_EVENTS.LOGIN_START &&
              currentUser != null
            ) {
              this.#purgeUserDataForPublicKey(currentUser.publicKey);

              if (!this.#storageProvider) {
                throw new Error('No storage provider available.');
              }

              await this.#storageProvider.removeItem(
                LOCAL_STORAGE_KEYS.activePublicKey
              );
            }
            const state = await this.#getState();
            this.#subscribers.forEach((s) =>
              s({
                event: NOTIFICATION_EVENTS.AUTHORIZE_DERIVED_KEY_FAIL,
                ...state,
              })
            );
            // propagate the error to the external caller
            this.#pendingWindowRequest?.reject(this.#getErrorInstance(e));
          });
        break;
      case 'login':
        this.#handleLoginMethod(payload as IdentityLoginPayload);
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  /**
   * @private
   */
  async #handleLoginMethod(payload: IdentityLoginPayload) {
    const activePublicKey = await this.#getActivePublicKey();

    // NOTE: this is a bit counterintuitive, but a missing publicKeyAdded
    // identifies this as a logout (even though the method is 'login'), and we
    // don't actually support login via the identity "login" method so don't
    // look for it here. We only support it via the "derive" method.
    if (!payload.publicKeyAdded) {
      if (!activePublicKey) {
        throw new Error('No active public key found');
      }

      if (!this.#storageProvider) {
        throw new Error('No storage provider available.');
      }

      await this.#storageProvider.removeItem(
        LOCAL_STORAGE_KEYS.activePublicKey
      );

      await this.#purgeUserDataForPublicKey(activePublicKey);

      const state = await this.#getState();
      this.#subscribers.forEach((s) =>
        s({
          event: NOTIFICATION_EVENTS.LOGOUT_END,
          ...state,
        })
      );
      this.#pendingWindowRequest?.resolve(payload);

      // This condition identifies the "get deso" flow where a user did not
      // login, but was simply prompted to get some free deso.
    } else if (
      payload.publicKeyAdded &&
      !payload.signedUp &&
      payload.publicKeyAdded === activePublicKey
    ) {
      let endEvent: NOTIFICATION_EVENTS;
      const startEvent = this.#pendingWindowRequest?.event;
      if (startEvent === NOTIFICATION_EVENTS.GET_FREE_DESO_START) {
        endEvent = NOTIFICATION_EVENTS.GET_FREE_DESO_END;
      } else if (startEvent === NOTIFICATION_EVENTS.VERIFY_PHONE_NUMBER_START) {
        endEvent = NOTIFICATION_EVENTS.VERIFY_PHONE_NUMBER_END;
      } else {
        throw new Error(`unexpected identity event: ${startEvent}`);
      }

      this.#authorizePrimaryDerivedKey(payload.publicKeyAdded)
        .then(async () => {
          this.#pendingWindowRequest?.resolve(payload);
          const state = await this.#getState();
          this.#subscribers.forEach((s) => s({ event: endEvent, ...state }));
        })
        .catch(async (e) => {
          const state = await this.#getState();
          this.#subscribers.forEach((s) =>
            s({
              event: NOTIFICATION_EVENTS.AUTHORIZE_DERIVED_KEY_FAIL,
              ...state,
            })
          );
          this.#pendingWindowRequest?.reject(this.#getErrorInstance(e));
        });
    } else {
      // not sure how we would get here, but lets log it just in case we haven't actually
      // handled all the cases.
      console.warn('unhandled identity login payload', payload);
    }
  }

  /**
   * @private
   */
  async #purgeUserDataForPublicKey(publicKey: string) {
    if (!this.#storageProvider) {
      throw new Error('No storage provider is available.');
    }

    const users = await this.#storageProvider.getItem(
      LOCAL_STORAGE_KEYS.identityUsers
    );
    if (users) {
      const usersObj = JSON.parse(users);
      delete usersObj[publicKey];
      if (Object.keys(usersObj).length === 0) {
        await this.#storageProvider.removeItem(
          LOCAL_STORAGE_KEYS.identityUsers
        );
      } else {
        await this.#storageProvider.setItem(
          LOCAL_STORAGE_KEYS.identityUsers,
          JSON.stringify(usersObj)
        );
      }
    }
  }

  /**
   * @private
   */
  async #handleDeriveMethod(
    payload: IdentityDerivePayload
  ): Promise<IdentityDerivePayload> {
    const { primaryDerivedKey } = (await this.#getCurrentUser()) ?? {};

    // NOTE: If we generated the keys and provided the derived public key,
    // identity will respond with an empty string in the derivedSeedHex field.
    // We don't want to inadvertently overwrite our derived seed hex with the
    // empty string, so we delete the field if it's empty.
    if (payload.derivedSeedHex === '') {
      delete payload.derivedSeedHex;
    }

    if (!this.#storageProvider) {
      throw new Error('No storage provider is available.');
    }

    // we may or may not have a login key pair in localStorage. If we do, it means we
    // initiated a login flow.
    const maybeLoginKeyPair = await this.#storageProvider.getItem(
      LOCAL_STORAGE_KEYS.loginKeyPair
    );
    // in the case of a login, we always clean up the login key pair from localStorage.
    await this.#storageProvider.removeItem(LOCAL_STORAGE_KEYS.loginKeyPair);

    // This means we're doing a derived key permissions upgrade for the current user (not a login).
    if (
      primaryDerivedKey != null &&
      primaryDerivedKey.publicKeyBase58Check === payload.publicKeyBase58Check &&
      primaryDerivedKey.derivedPublicKeyBase58Check ===
        payload.derivedPublicKeyBase58Check
    ) {
      await this.#updateUser(payload.publicKeyBase58Check, {
        primaryDerivedKey: { ...primaryDerivedKey, ...payload },
      });

      return await this.#authorizePrimaryDerivedKey(
        payload.publicKeyBase58Check
      ).then(async () => {
        const { primaryDerivedKey } = (await this.#getCurrentUser()) ?? {};
        await this.#updateUser(payload.publicKeyBase58Check, {
          primaryDerivedKey: {
            ...primaryDerivedKey,
            derivedKeyRegistered: true,
          },
        });
        return payload;
      });
    }

    const [users, activePublicKey] = await Promise.all([
      this.#getUsers(),
      this.#getActivePublicKey(),
    ]);

    // This means we're just switching to a user we already have in localStorage, we use the stored user bc they
    // may already have an authorized derived key that we can use.
    if (
      users?.[payload.publicKeyBase58Check] != null &&
      payload.publicKeyBase58Check !== activePublicKey
    ) {
      await this.#setActiveUser(payload.publicKeyBase58Check);
      // if the logged in user changes, we try to refresh the derived key permissions in the background
      // and just return the payload immediately.
      this.refreshDerivedKeyPermissions();
      return payload;

      // This means we're logging in a user we haven't seen yet
    } else if (maybeLoginKeyPair) {
      const { seedHex } = JSON.parse(maybeLoginKeyPair);
      await this.#updateUser(payload.publicKeyBase58Check, {
        primaryDerivedKey: {
          ...primaryDerivedKey,
          ...payload,
          derivedSeedHex: seedHex,
        },
      });

      return await this.#authorizePrimaryDerivedKey(
        payload.publicKeyBase58Check
      ).then(async () => {
        const { primaryDerivedKey } = (await this.#getCurrentUser()) ?? {};
        await this.#updateUser(payload.publicKeyBase58Check, {
          primaryDerivedKey: {
            ...primaryDerivedKey,
            derivedSeedHex: seedHex,
            derivedKeyRegistered: true,
          },
        });
        return {
          ...payload,
          publicKeyAdded: payload.publicKeyBase58Check,
        };
      });
    }

    // For all other derive flows, we just return the payload directly.
    return payload;
  }

  /**
   * @private
   */
  async #updateUser(masterPublicKey: string, attributes: Record<string, any>) {
    if (!this.#storageProvider) {
      throw new Error('No storage provider is available.');
    }

    const users = await this.#storageProvider.getItem(
      LOCAL_STORAGE_KEYS.identityUsers
    );
    if (users) {
      const usersObj = JSON.parse(users);
      if (!usersObj[masterPublicKey]) {
        usersObj[masterPublicKey] = {
          publicKey: masterPublicKey,
          ...attributes,
        };
      } else {
        usersObj[masterPublicKey] = {
          publicKey: masterPublicKey,
          ...usersObj[masterPublicKey],
          ...attributes,
        };
      }
      await this.#storageProvider.setItem(
        LOCAL_STORAGE_KEYS.identityUsers,
        JSON.stringify(usersObj)
      );
    } else {
      await this.#storageProvider.setItem(
        LOCAL_STORAGE_KEYS.identityUsers,
        JSON.stringify({
          [masterPublicKey]: { publicKey: masterPublicKey, ...attributes },
        })
      );
    }
    await this.#storageProvider.setItem(
      LOCAL_STORAGE_KEYS.activePublicKey,
      masterPublicKey
    );
  }

  /**
   * @private
   */
  #buildQueryParams(paramsPojo: Record<string, any>) {
    const qps = new URLSearchParams(
      Object.entries(paramsPojo).reduce<Record<string, any>>((acc, [k, v]) => {
        acc[k] =
          typeof v === 'object' && v !== null
            ? encodeURIComponent(JSON.stringify(v))
            : v;
        return acc;
      }, {})
    );

    if (this.#network === 'testnet') {
      qps.append('testnet', 'true');
    }

    if (this.#redirectURI) {
      qps.append('redirect_uri', this.#redirectURI);
    }

    return qps;
  }

  /**
   * @private
   */
  #openIdentityPopup(url: string) {
    if (this.#identityPopupWindow != null) {
      this.#identityPopupWindow.close();
    }

    const h = 1000;
    const w = 800;
    const y = this.#window.outerHeight / 2 + this.#window.screenY - h / 2;
    const x = this.#window.outerWidth / 2 + this.#window.screenX - w / 2;

    this.#identityPopupWindow = this.#window.open(
      url,
      undefined,
      `toolbar=no, width=${w}, height=${h}, top=${y}, left=${x}`
    );
  }

  /**
   * @private
   */
  #launchIdentity(path: string, params: Record<string, any>) {
    const qps = this.#buildQueryParams(params);
    const url = `${this.#identityURI}/${path.replace(/^\//, '')}?${qps}`;

    // If we have a custom presenter, use that instead of the default browser APIs.
    // This would typically be used for mobile apps.
    if (typeof this.#identityPresenter === 'function') {
      this.#identityPresenter(url);
      return;
    }

    if (typeof this.#window.open !== 'function') {
      throw new Error(
        'No identity presenter is available. Did you forget to configure a custom identityPresenter?'
      );
    }

    if (qps.get('redirect_uri')) {
      this.#window.location.href = url;
    } else {
      // if we had a previously attached listener, remove it and create a new one.
      if (this.#boundPostMessageListener != null) {
        this.#window.removeEventListener(
          'message',
          this.#boundPostMessageListener
        );
      }
      this.#boundPostMessageListener = this.#handlePostMessage.bind(this);
      this.#window.addEventListener('message', this.#boundPostMessageListener);
      this.#openIdentityPopup(url);
    }
  }

  /**
   * @private
   */
  #getErrorInstance(e: any): Error {
    const errorType = this.#getErrorType(e);
    if (!errorType) return e;

    return new DeSoCoreError(e.message, errorType, e);
  }

  /**
   *
   * @private
   */
  async #decryptGroupChat(
    groups: AccessGroupEntryResponse[],
    message: NewMessageEntryResponse
  ) {
    // ASSUMPTION: if it's a group chat, then the RECIPIENT has the group key name we need?
    const accessGroup = groups.find((g) => {
      return (
        g.AccessGroupKeyName === message.RecipientInfo.AccessGroupKeyName &&
        g.AccessGroupOwnerPublicKeyBase58Check ===
          message.RecipientInfo.OwnerPublicKeyBase58Check &&
        g.AccessGroupMemberEntryResponse
      );
    });

    if (!accessGroup?.AccessGroupMemberEntryResponse?.EncryptedKey) {
      throw new Error('access group key not found for group message');
    }

    const decryptedKeys = await this.decryptAccessGroupKeyPair(
      accessGroup.AccessGroupMemberEntryResponse.EncryptedKey
    );

    return await decryptChatMessage(
      decryptedKeys.seedHex,
      message.SenderInfo.AccessGroupPublicKeyBase58Check,
      message.MessageInfo.EncryptedText
    );
  }

  /**
   * @private
   */
  async #decryptDM(
    userPublicKeyBase58Check: string,
    privateKeyHex: string,
    message: NewMessageEntryResponse,
    isSender: boolean
  ) {
    const accessGroupInfo = isSender
      ? message.SenderInfo
      : message.RecipientInfo;

    if (
      message?.MessageInfo?.ExtraData &&
      message.MessageInfo.ExtraData.unencrypted
    ) {
      return unencryptedHexToPlainText(message.MessageInfo.EncryptedText);
    } else {
      const isRecipient =
        message.RecipientInfo.OwnerPublicKeyBase58Check ===
          userPublicKeyBase58Check &&
        message.RecipientInfo.AccessGroupKeyName ===
          accessGroupInfo.AccessGroupKeyName;

      const publicDecryptionKey = isRecipient
        ? message.SenderInfo.AccessGroupPublicKeyBase58Check
        : message.RecipientInfo.AccessGroupPublicKeyBase58Check;

      return await decryptChatMessage(
        privateKeyHex,
        publicDecryptionKey,
        message.MessageInfo.EncryptedText
      );
    }
  }
}

class DeSoCoreError extends Error {
  type: ERROR_TYPES;

  constructor(message: string, type: ERROR_TYPES, originalError: any = {}) {
    super(message);
    Object.assign(this, originalError);
    this.type = type;
    this.name = 'DeSoCoreError';
  }
}

const unencryptedHexToPlainText = (hex: string) => {
  const bytes = ecUtils.hexToBytes(hex);
  const textDecoder = new TextDecoder();
  return textDecoder.decode(bytes);
};
