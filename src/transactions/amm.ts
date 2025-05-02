import { identity } from '../identity/index.js';
import {
  AmmConfig,
  AmmLevel,
  AmmOrder,
  ProfileEntryResponse,
  RequestOptions,
  SubmitTransactionResponse,
  YieldCurvePoint,
} from '../backend-types/index.js';
import { amm, cleanURL } from '../data/index.js';
import { TxRequestOptions } from '../types.js';

export interface GetCoinPropertiesRequest {
  BaseCurrencyPublicKey: string;
}

export interface GetCoinPropertiesResponse {
  AmmConfigs: AmmConfig[];
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
  Levels: AmmLevel[];
  MinLockupDurationNanos: number;
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
  RunAt: Date[];
  TotalTradingFeeBasisPoints: number;
}

export const getCoinProperties = async (
  params: GetCoinPropertiesRequest,
  options?: RequestOptions
): Promise<GetCoinPropertiesResponse> => {
  const endpoint = cleanURL(
    options?.nodeURI ?? '',
    '/api/v0/get-coin-properties'
  );
  return amm.post(endpoint, params);
};

interface BaseTwapOrder {
  DerivedPubKey: string;
  Side: 'BID' | 'ASK';
  QuoteCurrencyPubKey: string;
  BaseCurrencyPubKey: string;
  AmountInQuoteCurrency: string;
  AmountInBaseCurrency: string;
  AmountSuborderJitterBasisPoints?: number;
  AmountSuborderMaxScalingBasisPoints?: number;
  StartAt: string;
  DurationSeconds: number;
  EndAt: string | null;
  SuborderIntervalSeconds: number;
  SuborderIntervalMaxJitterSeconds?: number;
  LimitPriceInUsd: string;
  LimitPriceInQuoteCurrency: string;
  LimitPriceMaxSlippageBasisPoints?: number;
}

export type CreateTwapOrderRequestParams = BaseTwapOrder;

export type TwapOrderResponse = BaseTwapOrder & {
  TwapConfigId: number;
  Status: string;
  CreatedAt: string;
  UpdatedAt: string;
  TwapOperations: Array<TwapOrderOperation>;
};

export type TwapOrderOperation = {
  TwapOperationId: number;
  TwapConfigId: number;
  Status: string;
  RunAt: string;
  OrderIdHex: string;
  TxnIdHex: string;
  AmountCurrencyType: string;
  ReceiveAmountCurrencyType: string;
  QuoteCurrencyPriceInUsd: string;
  LimitAmount: string;
  LimitAmountInUsd: string;
  LimitReceiveAmount: string;
  LimitReceiveAmountInUsd: string;
  LimitPriceInQuoteCurrency: string;
  LimitPriceInUsd: string;
  ExecutionAmount: string;
  ExecutionAmountUsd: string;
  ExecutionReceiveAmount: string;
  ExecutionReceiveAmountUsd: string;
  ExecutionPriceInQuoteCurrency: string;
  ExecutionPriceInUsd: string;
  ExecutionFeePercentage: string;
  ExecutionFeeAmountInQuoteCurrency: string;
  ExecutionFeeAmountInUsd: string;
  MarketTotalTradingFeeBasisPoints: string;
  CreatedAt: string;
  UpdatedAt: string;
  TwapConfig: null;
  TwapOperationError: null;
};

export const createTwapOrder = async (
  params: CreateTwapOrderRequestParams,
  options?: TxRequestOptions
): Promise<TwapOrderResponse> => {
  const jwt = await identity.jwt();
  const endpoint = cleanURL(options?.nodeURI ?? '', 'api/v0/twaps/create');
  return amm.post(endpoint, params, {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });
};

export type GetMyTwapOrdersResponse = {
  TwapOrders: Array<TwapOrderResponse>;
  TotalCount: number;
};

export const getMyTwapOrders = async (
  params: { publicKey: string; limit?: number; offset?: number },
  options?: RequestOptions
): Promise<GetMyTwapOrdersResponse> => {
  const jwt = await identity.jwt();
  const endpoint = cleanURL(
    options?.nodeURI ?? '',
    `api/v0/twaps/${params.publicKey}?limit=${params.limit ?? 0}&offset=${
      params.offset ?? 0
    }`
  );
  return amm.get(endpoint, {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });
};

export type CancelTwapOrderRequestParams = {
  OwnerPublicKey: string;
  TwapConfigId: number;
};

export const cancelTwapOrder = (
  params: CancelTwapOrderRequestParams,
  options?: RequestOptions
): Promise<TwapOrderResponse> => {
  const endpoint = cleanURL(options?.nodeURI ?? '', `api/v0/twaps/cancel`);
  return amm.post(endpoint, params);
};

export interface CreateDerivedKeyRequest {
  OwnerPublicKey: string;
  DerivedKeyType: string;
}

export interface CreateDerivedKeyAMMResponse {
  DerivedKeyId: number;
  DerivedPubKey: string;
  OwnerPubKey: string;
  Type: string;
  Status: string;
  ExpirationBlock: number;
  AccessSignature: string;
  TransactionSpendingLimitHex: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface AuthorizeDerivedKeyAMMRequest {
  OwnerPublicKey: string;
  DerivedPublicKey: string;
  ExpirationBlock: number;
  AccessSignature: string;
  TransactionSpendingLimitHex: string;
  Memo: string;
}

export interface AuthorizeDerivedKeyAMMResponse {
  AuthorizeDerivedKeyResponse: {
    SpendAmountNanos: number;
    TotalInputNanos: number;
    ChangeAmountNanos: number;
    FeeNanos: number;
    Transaction: any; // Replace with a more specific type if available
    TransactionHex: string;
    TxnHashHex: string;
  };
  SubmitTransactionResponse: SubmitTransactionResponse;
}

export async function createDerivedKeyAMM(
  request: CreateDerivedKeyRequest
): Promise<CreateDerivedKeyAMMResponse> {
  const jwt = await identity.jwt();
  const endpoint = cleanURL('', 'api/v0/derived-keys/create');
  return await amm.post(endpoint, request, {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });
}

export async function authorizeDerivedKeyAMM(
  request: CreateDerivedKeyAMMResponse,
  payload: {
    BuyingDAOCoinCreatorPublicKey: string;
    SellingDAOCoinCreatorPublicKey: string;
    QuoteCurrencyPublicKey: string;
    numSubOrders: number;
  }
) {
  const jwt = await identity.jwt();
  const deriveResponse = await identity.derive(
    {
      GlobalDESOLimit:
        payload.QuoteCurrencyPublicKey === 'DESO' ? 100000 * 1e9 : 1e9,
      TransactionCountLimitMap: {
        AUTHORIZE_DERIVED_KEY: 1,
        // CREATE_USER_ASSOCIATION: payload.numSubOrders,
        // DAO_COIN_TRANSFER: payload.numSubOrders,
        // DAO_COIN_LIMIT_ORDER: payload.numSubOrders,
        ...(payload.QuoteCurrencyPublicKey === 'DESO'
          ? { BASIC_TRANSFER: payload.numSubOrders * 4 }
          : {}),
      },
      AssociationLimitMap: [
        {
          AssociationClass: 'User',
          AssociationType: 'DeSoTokenWhitelistAssociationKey',
          AppScopeType: 'Any',
          AppPublicKeyBase58Check: '',
          AssociationOperation: 'Create',
          OpCount: payload.numSubOrders,
        },
      ],
      DAOCoinLimitOrderLimitMap: {
        [payload.BuyingDAOCoinCreatorPublicKey]: {
          [payload.SellingDAOCoinCreatorPublicKey]: payload.numSubOrders,
        },
      },
      ...(payload.QuoteCurrencyPublicKey === 'DESO'
        ? {}
        : {
            DAOCoinOperationLimitMap: {
              [payload.QuoteCurrencyPublicKey]: {
                transfer: 4 * payload.numSubOrders,
              },
            },
          }),
    },
    {
      derivedPublicKey: request.DerivedPubKey,
      ownerPublicKey: request.OwnerPubKey,
    }
  );

  const endpoint = cleanURL('', 'api/v0/derived-keys/authorize');
  return await amm.post(
    endpoint,
    {
      OwnerPublicKey: deriveResponse.publicKeyBase58Check,
      DerivedPublicKey: deriveResponse.derivedPublicKeyBase58Check,
      ExpirationBlock: deriveResponse.expirationBlock,
      AccessSignature: deriveResponse.accessSignature,
      TransactionSpendingLimitHex: deriveResponse.transactionSpendingLimitHex,
      Memo: 'TWAP_ORDER',
    },
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    }
  );
}
