import { api, cleanURL } from 'src/data/index.js';
import { RequestOptions } from '../backend-types/index.js';
import { TxRequestOptions } from '../types.js';

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
  const endpoint = 'api/v0/twaps/create';
  return api.post(
    options?.nodeURI ? cleanURL(options.nodeURI, endpoint) : endpoint,
    params
  );
};

export type GetMyTwapOrdersResponse = {
  TwapOrders: Array<TwapOrderResponse>;
  TotalCount: number;
};
export const getMyTwapOrders = (
  params: { publicKey: string; limit?: number; offset?: number },
  options?: RequestOptions
): Promise<GetMyTwapOrdersResponse> => {
  const endpoint = `api/v0/twaps/${params.publicKey}?limit=${
    params.limit ?? 0
  }&offset=${params.offset ?? 0}`;
  return api.get(
    options?.nodeURI ? cleanURL(options.nodeURI, endpoint) : endpoint
  );
};

export type CancelTwapOrderRequestParams = {
  OwnerPublicKey: string;
  TwapConfigId: number;
};

export const cancelTwapOrder = (
  params: CancelTwapOrderRequestParams,
  options?: RequestOptions
): Promise<TwapOrderResponse> => {
  const endpoint = `api/v0/twaps/cancel`;
  return api.post(
    options?.nodeURI ? cleanURL(options.nodeURI, endpoint) : endpoint,
    params
  );
};
