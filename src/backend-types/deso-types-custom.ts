import { ec } from 'elliptic';
import { PartialWithRequiredFields } from '../data/index.js';
import {
  DAOCoinLimitOrderSimulatedExecutionResult,
  DeSoNonce,
  MsgDeSoTxn,
  ProfileEntryResponse,
  SubmitTransactionResponse,
  TransactionFee,
  TransactionSpendingLimitResponse,
} from './deso-types.js';

export interface GetApproveResponse {
  id?: string;
  service: 'identity';
  method: 'approve';
  payload: {
    users: {
      [key: string]: {
        accessLevel: number;
        accessLevelHmac: string;
        btcDepositAddress: string;
        encryptedSeedHex: string;
        hasExtraText: boolean;
        network: string;
      };
    };
    signedTransactionHex: string;
  };
}

export interface IdentityLoginResponse {
  id?: string;
  service: 'identity';
  method: string;
  payload: {
    users: LoginUsers;
    publicKeyAdded: string;
    signedUp: boolean;
  };
}

export interface UploadImageRequest {
  UserPublicKeyBase58Check: string;
  JWT: string;
  file: File;
}

export interface UploadVideoRequest {
  UserPublicKeyBase58Check: string;
  JWT: string;
  file: File;
}

export interface GetVideoStatusRequest {
  videoId: string;
}

export interface UploadVideoResponse {
  streamMediaId: string;
}

export interface LoginUser {
  accessLevel: number;
  accessLevelHmac: string;
  btcDepositAddress: string;
  encryptedSeedHex: string;
  hasExtraText: boolean;
  ethDepositAddress: string;
  network: string;
  encryptedMessagingKeyRandomness?: string;
  derivedPublicKeyBase58Check?: string;
}

export interface LoginUsers {
  [user: string]: LoginUser;
}

export interface IdentityApproveResponse {
  id?: string;
  service: 'identity';
  method: string;
  payload: {
    users: LoginUser;
    signedTransactionHex: string;
  };
}

export interface IdentityJwtResponse {
  id: string;
  service: 'identity';
  payload: {
    jwt: string;
  };
}

export interface IdentitySignRequest {
  id: string;
  service: string;
  method: string;
  payload: {
    accessLevel: number;
    accessLevelHmac: string;
    encryptedSeedHex: string;
    transactionHex?: string;
    signedTransactionHex?: string;
    encryptedMessage?: {
      EncryptedHex: string;
      PublicKey: string;
      IsSender: boolean;
      Legacy: boolean;
    }[];
  };
}

export interface GetDecryptMessagesRequest {
  EncryptedHex: string;
  PublicKey: string;
  IsSender: boolean;
  Legacy: boolean;
  Version: number;
  SenderMessagingPublicKey: string;
  SenderMessagingGroupKeyName: string;
  RecipientMessagingPublicKey: string;
  RecipientMessagingGroupKeyName: string;
}

export interface GetDecryptMessagesResponse {
  EncryptedHex: string;
  PublicKey: string;
  IsSender: boolean;
  Legacy: boolean;
  Version: number;
  SenderMessagingPublicKey: string;
  SenderMessagingGroupKeyName: string;
  RecipientMessagingPublicKey: string;
  RecipientMessagingGroupKeyName: string;
  decryptedMessage: string;
}

export enum DeSoNetwork {
  mainnet = 'mainnet',
  testnet = 'testnet',
}

export interface DerivedPrivateUserInfo {
  derivedSeedHex: string;
  derivedPublicKeyBase58Check: string;
  publicKeyBase58Check: string;
  btcDepositAddress: string;
  ethDepositAddress: string;
  expirationBlock: number;
  network: DeSoNetwork;
  accessSignature: string;
  jwt: string;
  derivedJwt: string;
  messagingPublicKeyBase58Check: string;
  messagingPrivateKey: string;
  messagingKeyName: string;
  messagingKeySignature: string;
  transactionSpendingLimitHex: string | undefined;
}

export enum CreatorCoinLimitOperationString {
  ANY = 'any',
  BUY = 'buy',
  SELL = 'sell',
  TRANSFER = 'transfer',
}

export enum DAOCoinLimitOperationString {
  ANY = 'any',
  MINT = 'mint',
  BURN = 'burn',
  DISABLE_MINTING = 'disable_minting',
  UPDATE_TRANSFER_RESTRICTION_STATUS = 'update_transfer_restriction_status',
  TRANSFER = 'transfer',
}

export type CoinLimitOperationString =
  | DAOCoinLimitOperationString
  | CreatorCoinLimitOperationString;

export interface CoinOperationLimitMap<T extends CoinLimitOperationString> {
  [public_key: string]: OperationToCountMap<T>;
}

export type OperationToCountMap<T extends LimitOperationString> = {
  [operation in T]?: number;
};

export type LimitOperationString =
  | DAOCoinLimitOperationString
  | CreatorCoinLimitOperationString
  | NFTLimitOperationString;
export type CreatorCoinOperationLimitMap =
  CoinOperationLimitMap<CreatorCoinLimitOperationString>;
export type DAOCoinOperationLimitMap =
  CoinOperationLimitMap<DAOCoinLimitOperationString>;
export type DAOCoinLimitOrderLimitMap = {
  [buying_public_key: string]: { [selling_public_key: string]: number };
};

export enum NFTLimitOperationString {
  ANY = 'any',
  UPDATE = 'update',
  BID = 'nft_bid',
  ACCEPT_BID = 'accept_nft_bid',
  TRANSFER = 'transfer',
  BURN = 'burn',
  ACCEPT_TRANSFER = 'accept_nft_transfer',
}
export interface NFTOperationLimitMap {
  [post_hash_hex: string]: {
    [serial_number: number]: OperationToCountMap<NFTLimitOperationString>;
  };
}

export enum ConfigureTransferRestrictionStatus {
  Unrestricted = 'unrestricted',
  ProfileOwnerOnly = 'profile_owner_only',
  DAOMembersOnly = 'dao_members_only',
  PermanentlyUnrestricted = 'permanently_unrestricted',
}

export enum TransferRestrictionStatusByOperation {
  'unrestricted' = 0,
  'profile_owner_only' = 1,
  'dao_members_only' = 2,
  'permanently_unrestricted' = 3,
}

export enum TransactionType {
  BasicTransfer = 'BASIC_TRANSFER',
  BitcoinExchange = 'BITCOIN_EXCHANGE',
  PrivateMessage = 'PRIVATE_MESSAGE',
  SubmitPost = 'SUBMIT_POST',
  UpdateProfile = 'UPDATE_PROFILE',
  UpdateBitcoinUSDExchangeRate = 'UPDATE_BITCOIN_USD_EXCHANGE_RATE',
  Follow = 'FOLLOW',
  Like = 'LIKE',
  CreatorCoin = 'CREATOR_COIN',
  SwapIdentity = 'SWAP_IDENTITY',
  UpdateGlobalParams = 'UPDATE_GLOBAL_PARAMS',
  CreatorCoinTransfer = 'CREATOR_COIN_TRANSFER',
  CreateNFT = 'CREATE_NFT',
  UpdateNFT = 'UPDATE_NFT',
  AcceptNFTBid = 'ACCEPT_NFT_BID',
  NFTBid = 'NFT_BID',
  NFTTransfer = 'NFT_TRANSFER',
  AcceptNFTTransfer = 'ACCEPT_NFT_TRANSFER',
  BurnNFT = 'BURN_NFT',
  AuthorizeDerivedKey = 'AUTHORIZE_DERIVED_KEY',
  MessagingGroup = 'MESSAGING_GROUP',
  DAOCoin = 'DAO_COIN',
  DAOCoinTransfer = 'DAO_COIN_TRANSFER',
  DAOCoinLimitOrder = 'DAO_COIN_LIMIT_ORDER',
  CreateUserAssociation = 'CREATE_USER_ASSOCIATION',
  DeleteUserAssociation = 'DELETE_USER_ASSOCIATION',
  CreatePostAssociation = 'CREATE_POST_ASSOCIATION',
  DeletePostAssociation = 'DELETE_POST_ASSOCIATION',
  AccessGroup = 'ACCESS_GROUP',
  AccessGroupMembers = 'ACCESS_GROUP_MEMBERS',
  NewMessage = 'NEW_MESSAGE',
  RegisterAsValidator = 'REGISTER_AS_VALIDATOR',
  UnregisterAsValidator = 'UNREGISTER_AS_VALIDATOR',
  Stake = 'STAKE',
  Unstake = 'UNSTAKE',
  UnlockStake = 'UNLOCK_STAKE',
  UnjailValidator = 'UNJAIL_VALIDATOR',
  CoinLockup = 'COIN_LOCKUP',
  UpdateCoinLockupParams = 'UPDATE_COIN_LOCKUP_PARAMS',
  CoinLockupTransfer = 'COIN_LOCKUP_TRANSFER',
  CoinUnlock = 'COIN_UNLOCK',
  AtomicTxnsWrapper = 'ATOMIC_TXNS_WRAPPER',
}

export interface IdentityDeriveParams {
  callback?: string;
  webview?: boolean;
  publicKey?: string;
  transactionSpendingLimitResponse?: TransactionSpendingLimitResponse;
  derivedPublicKey?: string;
  deleteKey?: boolean;
  expirationDays?: number;
}

export interface IdentityDeriveQueryParams {
  callback?: string;
  webview?: boolean;
  publicKey?: string;
  transactionSpendingLimitResponse?: string;
  derivedPublicKey?: string;
  deleteKey?: boolean;
  expirationDays?: number;
}

export interface AuthorizeDerivedKeyParams {
  OwnerPublicKeyBase58Check?: string;
  DerivedPublicKeyBase58Check?: string;
  ExpirationBlock?: number;
  DeleteKey: boolean;
  DerivedKeySignature?: boolean;
  TransactionFees: TransactionFee[] | null;
  MinFeeRateNanosPerKB: number;
  TransactionSpendingLimitResponse?: TransactionSpendingLimitResponse;
  Memo?: string;
  AppName?: string;
  ExtraData?: { [k: string]: string };
  ExpirationDays?: number;
}

// Temporary manual creation of classes for DAO coin limit orders

export enum DAOCoinLimitOrderOperationTypeString {
  DAOCoinLimitOrderOperationTypeStringASK = 'ASK',
  DAOCoinLimitOrderOperationTypeStringBID = 'BID',
}

export interface TransactionConstructionResponse {
  TransactionHex: string;
}

// issues with the converter lately so just going to add these to the custom types
export interface DAOCoinMarketOrderWithQuantityRequest {
  TransactorPublicKeyBase58Check: string;
  BuyingDAOCoinCreatorPublicKeyBase58Check: string;
  SellingDAOCoinCreatorPublicKeyBase58Check: string;
  QuantityToFill: number;
  OperationType: string;
  FillType: string;
  MinFeeRateNanosPerKB: number;
  TransactionFees: TransactionFee[];
}

/**
 * @deprecated
 */
export interface DAOCoinLimitOrderWithExchangeRateAndQuantityRequest {
  TransactorPublicKeyBase58Check: string;
  BuyingDAOCoinCreatorPublicKeyBase58Check: string;
  SellingDAOCoinCreatorPublicKeyBase58Check: string;
  Price: number;
  Quantity: number;
  QuantityToFill: number;
  ExchangeRateCoinsToSellPerCoinToBuy: number;
  OperationType: string;
  MinFeeRateNanosPerKB?: number;
  TransactionFees: TransactionFee[] | null;
}

export interface DAOCoinLimitOrderRequest {
  TransactorPublicKeyBase58Check: string;
  BuyingDAOCoinCreatorPublicKeyBase58Check: string;
  SellingDAOCoinCreatorPublicKeyBase58Check: string;
  /**
   * A decimal string (ex: '1.23') representing the exchange rate of the two coins in the order.
   */
  Price: string;
  /**
   * A decimal string (ex: '1.23') representing the quantity of the coins being bought or sold.
   */
  Quantity: string;
  FillType: string;
  OperationType: 'ASK' | 'BID';
  MinFeeRateNanosPerKB?: number;
  TransactionFees?: TransactionFee[] | null;
}

export type DAOCoinMarketOrderRequest = Omit<DAOCoinLimitOrderRequest, 'Price'>;

export interface MetaMaskInitResponse {
  derivedKeyPair: ec.KeyPair;
  derivedPublicKeyBase58Check: string;
  submissionResponse: SubmitTransactionResponse;
  ethereumAddress: string;
}

export interface OptionalFeesAndExtraData {
  MinFeeRateNanosPerKB?: number;
  TransactionFees?: TransactionFee[] | null;
  ExtraData?: { [key: string]: string };
  Nonce?: PartialWithRequiredFields<DeSoNonce, 'ExpirationBlockHeight'>;
}

export type TxRequestWithOptionalFeesAndExtraData<T> = Omit<
  T,
  | 'MinFeeRateNanosPerKB'
  | 'TransactionFees'
  | 'ExtraData'
  | 'InTutorial'
  | 'Nonce'
> &
  OptionalFeesAndExtraData;

export interface RequestOptions {
  /**
   * This is only relevant for write operations that require a signed
   * transaction (submit-post, update-profile, etc). It determines whether to
   * broadcast the transaction to the network. Defaults to true. If set to
   * false, the transaction will be constructed but not signed or submitted
   * which is useful for constructing transactions to preview them without
   * broadcasting as a sort of "dry-run".
   */
  broadcast?: boolean;

  /**
   * The node to send the request to. If not provided, either the default node
   * or the configured node will be used.
   */
  nodeURI?: string;

  /**
   * Experimental param. When localConstruction is true, transactions will
   * be constructed locally. This only applies after the balance model fork.
   */
  localConstruction?: boolean;
  /**
   * Function to be used to construct the transaction locally.
   * @param params
   * @returns Promise with the ConstructedTransactionResponse
   */
  constructionFunction?: (
    params: any // TODO: I actually think we want any to be TxRequestWithOptionalFeesAndExtraData
  ) => Promise<ConstructedTransactionResponse>;

  jwt?: boolean;
}

export type ConstructedTransactionResponse = {
  Transaction: MsgDeSoTxn;
  FeeNanos: number;
  TransactionHex: string;
  TxnHashHex: string;
  TotalInputNanos: number;
  ChangeAmountNanos: number;
  SpendAmountNanos: number;
  TransactionIDBase58Check?: string;
  // Buy or sell creator coins (server side only)
  ExpectedDeSoReturnedNanos?: number;
  ExpectedCreatorCoinReturnedNanos?: number;
  FounderRewardGeneratedNanos?: number;
  // SubmitPost (server side only)
  TstampNanos?: number;
  PostHashHex?: string;
  // UpdateProfile (server side only)
  CompProfileCreationTxnHashHex?: string;
  // DAO Coin Limit Order (server side only)
  SimulatedExecutionResult?: DAOCoinLimitOrderSimulatedExecutionResult;
  // Create/Update NFT, NFT Bid, Accept NFT Bid (server side only)
  NFTPostHashHex?: string;
  // Update NFT, NFT Bid, Accept NFT Bid (server side only)
  SerialNumber?: number;
  // NFT Bid (server side only)
  UpdaterPublicKeyBase58Check?: string;
  // NFT Bid, Accept NFT Bid (server side only)
  BidAmountNanos?: number;
  // Accept NFT Bid (server side only)
  BidderPublicKeyBase58Check?: string;
};

export type MessagingGroupPayload = {
  messagingKeySignature: string;
  encryptedToApplicationGroupMessagingPrivateKey: string;
  encryptedToMembersGroupMessagingPrivateKey: string[];
  messagingPublicKeyBase58Check: string;
  encryptedMessagingKeyRandomness: string | undefined;
};

export enum MessagingGroupOperation {
  DEFAULT_KEY = 'DefaultKey',
  CREATE_GROUP = 'CreateGroup',
  ADD_MEMBERS = 'AddMembers',
}

export interface DAOCoinEntry {
  NumberOfHolders: number;
  CoinsInCirculationNanos: string;
  MintingDisabled: boolean;
  TransferRestrictionStatus: string;
}

export interface UploadVideoV2Response {
  asset: {
    id: string;
    playbackId: string;
  };
  tusEndpoint: string;
  url: string;
}

export enum OperationTypeWithFee {
  BID = 'BID',
  ASK = 'ASK',
}

export enum FillTypeWithFee {
  GOOD_TILL_CANCELLED = 'GOOD_TILL_CANCELLED',
  FILL_OR_KILL = 'FILL_OR_KILL',
  IMMEDIATE_OR_CANCEL = 'IMMEDIATE_OR_CANCEL',
}

export enum CurrencyType {
  usd = 'usd',
  base = 'base',
  quote = 'quote',
}

export interface DeSoTokenMarketOrderWithFeeRequest {
  TransactorPublicKeyBase58Check: string;
  QuoteCurrencyPublicKeyBase58Check: string;
  BaseCurrencyPublicKeyBase58Check: string;
  OperationType: OperationTypeWithFee;
  FillType: FillTypeWithFee;
  Price: string;
  PriceCurrencyType: CurrencyType;
  Quantity: string;
  QuantityCurrencyType: CurrencyType;
  MinFeeRateNanosPerKB: number;
  TransactionFees: TransactionFee[] | null;
  OptionalPrecedingTransactions: Array<MsgDeSoTxn> | null;
}

export interface DeSoTokenMarketOrderWithFeeResponse {
  FeeNanos: number;
  Transaction: MsgDeSoTxn;
  TransactionHex: string;
  TxnHashHex: string;
  LimitAmount: string;
  LimitAmountCurrencyType: string;
  LimitAmountInUsd: string;
  LimitReceiveAmount: string;
  LimitReceiveAmountCurrencyType: string;
  LimitReceiveAmountInUsd: string;
  LimitPriceInQuoteCurrency: string;
  LimitPriceInUsd: string;
  ExecutionAmount: string;
  ExecutionAmountCurrencyType: string;
  ExecutionAmountUsd: string;
  ExecutionReceiveAmount: string;
  ExecutionReceiveAmountCurrencyType: string;
  ExecutionReceiveAmountUsd: string;
  ExecutionPriceInQuoteCurrency: string;
  ExecutionPriceInUsd: string;
  ExecutionFeePercentage: string;
  ExecutionFeeAmountInQuoteCurrency: string;
  ExecutionFeeAmountInUsd: string;
  MarketTotalTradingFeeBasisPoints: string;
  MarketTradingFeeBasisPointsByUserPkid: Record<string, number>;
  InnerTransactionHexes: string[];
}

export interface CreateNewCoinRequest {
  UpdaterPublicKey: string;
  DryRun: boolean;
  AmmConfig: AmmConfig | null;
  AuctionDurationSeconds: number;
  OwnershipPercentageBasisPoints: number;
  CreatorRevsharePercentageBasisPoints: number | null;
  TradingFeeBasisPoints: number | null;
  CoinApyBasisPoints: number | null;
  LockPercentageOfCreatorMintedCoinsBasisPoints: number;
  LockDurationNanoSeconds: number;
  DisableCreatorRevshareUpdate: boolean;
  DisableMintingOfNewCoins: boolean;
  DisableTradingFeeUpdate: boolean;
  EnablePermanentlyUnrestrictedTransfers: boolean;
  NewProfileUsername: string;
  NewCoinCategory: string;
}

export interface CreateNewCoinResponse {
  ConfigureMarketResponse: ConfigureMarketResponse | null;
  PreExistingCoins: number;
  CoinsInAmm: number;
  UnlockedFounderCoins: number;
  LockedFounderCoins: number;
  TotalCoinsAfterAmmStart: number;
  Transaction: MsgDeSoTxn | null;
  SignedAmmMetadataTxnHexes: string[];
  UnsignedUserTxnHexes: string[];
  TransactionHex: string;
  InnerTransactionHexes: string[];
}

export interface UpdateCoinPropertiesRequest {
  UpdaterPublicKey: string;
  CreatorRevsharePercentageBasisPoints?: number;
  TradingFeeBasisPoints: number | null;
  CoinApyBasisPoints: number | null;
  NewProfileUsername: string;
  NewCoinCategory: string;
  DisableCreatorRevshareUpdate: boolean;
  DisableMintingOfNewCoins: boolean;
  DisableTradingFeeUpdate: boolean;
}

export interface UpdateCoinPropertiesResponse {
  Transaction: MsgDeSoTxn | null;
  SignedAmmMetadataTxnHexes: string[];
  UnsignedUserTxnHexes: string[];
  TransactionHex: string;
  InnerTransactionHexes: string[];
}

export interface GetCoinPropertiesRequest {
  BaseCurrencyPublicKey: string;
}

export interface GetCoinPropertiesResponse {
  AmmConfigs: AmmConfig[];
  BaseCurrencyTotal: number;
  CirculatingCoinsLocked: number;
  CirculatingCoinsTotal: number;
  CirculatingCoinsUnlocked: number;
  CoinApyBasisPoints: number;
  CoinsInAmmAsks: number[];
  CoinsInAmmAsksTotal: number;
  CoinsInAmmPubkeys: number[];
  CoinsInAmmPubkeysTotal: number;
  CreatorRevsharePercentageBasisPoints: number;
  DisableCreatorRevshareUpdate: boolean;
  DisableMintingOfNewCoins: boolean;
  DisableTradingFeeUpdate: boolean;
  EnablePermanentlyUnrestrictedTransfers: boolean;
  FeeProfiles: { [key: string]: ProfileEntryResponse };
  FounderCoinsLocked: number;
  FounderCoinsTotal: number;
  FounderCoinsUnlocked: number;
  Levels: AmmLevel[];
  MinLockupDurationNanos: number;
  NextCirculatingUnlockTimeNanos: number;
  NextFounderUnlockTimeNanos: number;
  OrdersPlaced: AmmOrder[];
  Profile: ProfileEntryResponse;
  QuoteCurrencyInAmmBids: number[];
  QuoteCurrencyInAmmBidsTotal: number;
  TradingFeeMap: {
    [key: string]: number;
  };
  UsdInAmmBids: number[];
  UsdInAmmBidsTotal: number;
  YieldCurvePoints: YieldCurvePoint[];
}

export interface YieldCurvePoint {
  ProfileEntryResponse: ProfileEntryResponse | null;
  LockupDurationNanoSecs: number;
  LockupYieldAPYBasisPoints: number;
  ProfilePublicKeyBase58Check: string;
}
export interface AmmConfig {
  AmmConfigId: number;
  OwnerPkid: string;
  AmmPublicKey: string;
  AmmConfigType: AMMConfigType;
  MarketStatus: MarketStatus;
  StartPriceUsd: number;
  StartPriceInQuoteCurrency: number;
  OrderSpacingBasisPoints: number;
  SpreadFeeBasisPoints: number;
  BaseAmountPerLevelUsd: number;
  IncreaseBaseAmountByBasisPointsEachLevel: number;
  IncreaseBaseAmountByUsdEachLevel: number;
  TerminalPriceUsd: number;
  TerminalAmountUsd: number;
  FinalPriceUsd: number;
  MakeBidLevelsDownToPriceUsd: number;
  MaxOrdersPerSide: number;
  CreatedAt: Date | null;
  UpdatedAt: Date | null;
  BaseCurrencyPkid: string;
  QuoteCurrencyPkid: string;
}

export interface AmmLevel {
  AmmConfigId: number;
  Level: number;
  PriceInQuoteCurrency: number;
  PriceInUsdAtSetup: number;
  AmountInQuoteCurrency: number;
  AmountInUsdAtSetup: number;
  CreatedAt: Date | null;
  UpdatedAt: Date | null;
}

export interface AmmOrder {
  AmmConfigId: number;
  OrderStatus: AmmOrderStatus;
  PriceInQuoteCurrency: number;
  AmountInBaseCurrency: number;
  Side: string;
  OrderIdHex: string | null;
  TxnIdHex: string | null;
  CreatedAt: Date | null;
  UpdatedAt: Date | null;
}

export interface MarketInfo {
  BaseCurrencyPkid: string;
  QuoteCurrencyPkid: string;
}

export enum AMMConfigType {
  NewMarket = 'NewMarket',
  ExistingMarket = 'ExistingMarket',
  Custom = 'Custom',
}

export enum MarketStatus {
  None = 'None',
  Configured = 'Configured',
  PlacingInitialOrders = 'PlacingInitialOrders',
  Started = 'Started',
  CancelingOrders = 'CancelingOrders',
  OrdersCancelled = 'OrdersCancelled',
  UncancelingOrders = 'UncancelingOrders',
}

export enum AmmOrderStatus {
  None = 'None',
  Open = 'Open',
  Filled = 'Filled',
  Canceled = 'Canceled',
}

export interface ConfigureMarketResponse {
  LevelsToCreate: AmmLevel[] | null;
  InitialOrders: AmmOrder[] | null;
  MarketOpenTime: Date | null;
  AmmConfigId: number;
  AmmPublicKey: string;
  QuoteCurrencyPriceInUsd: number;
  InitialBaseCurrencyAmount: number;
  BaseCurrencyBalance: number;
  BaseCurrencyNeeded: number;
  InitialQuoteCurrencyAmount: number;
  QuoteCurrencyBalance: number;
  QuoteCurrencyNeeded: number;
}
