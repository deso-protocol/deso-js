import {
  BuyOrSellCreatorCoinRequest,
  BuyOrSellCreatorCoinResponse,
  ConstructedTransactionResponse,
  RequestOptions,
  SendDeSoRequest,
  SendDeSoResponse,
  TransferCreatorCoinRequest,
  TransferCreatorCoinResponse,
  TxRequestWithOptionalFeesAndExtraData,
} from '../backend-types';
import { PartialWithRequiredFields } from '../data';
import {
  TransactionMetadataBasicTransfer,
  TransactionMetadataCreatorCoinTransfer,
  TransactionOutput,
  bs58PublicKeyToCompressedBytes,
  identity,
} from '../identity';
import { guardTxPermission } from '../identity/permissions-utils';
import {
  constructBalanceModelTx,
  getTxWithFeeNanos,
  handleSignAndSubmit,
  isMaybeDeSoPublicKey,
  sumTransactionFees,
} from '../internal';
import { ConstructedAndSubmittedTx, TxRequestOptions } from '../types';

/**
 * https://docs.deso.org/deso-backend/construct-transactions/financial-transactions-api#send-deso
 */
export const sendDeso = async (
  params: TxRequestWithOptionalFeesAndExtraData<SendDeSoRequest>,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<SendDeSoResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.SenderPublicKeyBase58Check,
    new TransactionMetadataBasicTransfer(),
    {
      Outputs: buildSendDesoOutputs({
        ...params,
        // NOTE: this is a bit of an odd hack, but bc we are only using this to
        // estimate the fee, we can overwrite the recipient to be the sender to
        // ensure the value is a valid public key that can be converted to
        // bytes. The reason we cannot make an api call to get the true public
        // key is because it could cause the derived key re-approval popup to
        // get blocked by browser popup blockers.
        RecipientPublicKeyOrUsername: params.SenderPublicKeyBase58Check,
      }),
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        params.AmountNanos +
        txWithFee.feeNanos +
        sumTransactionFees(params.TransactionFees),
      TransactionCountLimitMap: {
        BASIC_TRANSFER:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions.TransactionCountLimitMap
            ?.BASIC_TRANSFER ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/send-deso', params, {
    ...options,
    constructionFunction: constructSendDeSoTransaction,
  });
};

const buildSendDesoOutputs = (
  params: TxRequestWithOptionalFeesAndExtraData<SendDeSoRequest>
) => {
  const transactionOutput = new TransactionOutput();
  transactionOutput.amountNanos = params.AmountNanos;
  transactionOutput.publicKey = bs58PublicKeyToCompressedBytes(
    params.RecipientPublicKeyOrUsername
  );
  return [transactionOutput];
};

export const constructSendDeSoTransaction = (
  params: TxRequestWithOptionalFeesAndExtraData<SendDeSoRequest>
): Promise<ConstructedTransactionResponse> => {
  const transactionOutput = new TransactionOutput();
  transactionOutput.amountNanos = params.AmountNanos;
  transactionOutput.publicKey = bs58PublicKeyToCompressedBytes(
    params.RecipientPublicKeyOrUsername
  );
  return constructBalanceModelTx(
    params.SenderPublicKeyBase58Check,
    new TransactionMetadataBasicTransfer(),
    {
      Outputs: buildSendDesoOutputs(params),
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

// TODO: BUY creator coins is hard. Need to move some
// big float math into js.
/**
 * https://docs.deso.org/deso-backend/construct-transactions/financial-transactions-api#buy-or-sell-creator-coin
 */
export type BuyCreatorCoinRequestParams = TxRequestWithOptionalFeesAndExtraData<
  PartialWithRequiredFields<
    Omit<
      BuyOrSellCreatorCoinRequest,
      'CreatorCoinToSellNanos' | 'OperationType'
    >,
    | 'UpdaterPublicKeyBase58Check'
    | 'CreatorPublicKeyBase58Check'
    | 'DeSoToSellNanos'
  >
>;
export const buyCreatorCoin = (
  params: BuyCreatorCoinRequestParams,
  options?: RequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    BuyOrSellCreatorCoinResponse | ConstructedTransactionResponse
  >
> => {
  return handleSignAndSubmit(
    'api/v0/buy-or-sell-creator-coin',
    {
      ...params,
      OperationType: 'buy',
    },
    options
  );
};

// TODO: SELL creator coins is hard. Need to move some
// big float math into js.
/**
 * https://docs.deso.org/deso-backend/construct-transactions/financial-transactions-api#buy-or-sell-creator-coin
 */

export type SellCreatorCoinRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      Omit<BuyOrSellCreatorCoinRequest, 'DesoToSellNanos' | 'OperationType'>,
      | 'UpdaterPublicKeyBase58Check'
      | 'CreatorPublicKeyBase58Check'
      | 'CreatorCoinToSellNanos'
    >
  >;

export const sellCreatorCoin = (
  params: SellCreatorCoinRequestParams,
  options?: RequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    BuyOrSellCreatorCoinResponse | ConstructedTransactionResponse
  >
> => {
  return handleSignAndSubmit(
    'api/v0/buy-or-sell-creator-coin',
    {
      ...params,
      OperationType: 'sell',
    },
    options
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/financial-transactions-api#transfer-creator-coin
 */
export type TransferCreatorCoinRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      TransferCreatorCoinRequest,
      | 'SenderPublicKeyBase58Check'
      | 'CreatorPublicKeyBase58Check'
      | 'ReceiverUsernameOrPublicKeyBase58Check'
      | 'CreatorCoinToTransferNanos'
    >
  >;
export const transferCreatorCoin = (
  params: TransferCreatorCoinRequestParams,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<TransferCreatorCoinResponse>> => {
  return handleSignAndSubmit('api/v0/transfer-creator-coin', params, {
    ...options,
    constructionFunction: constructTransferCreatorCoinTransaction,
  });
};

export const constructTransferCreatorCoinTransaction = (
  params: TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      TransferCreatorCoinRequest,
      | 'SenderPublicKeyBase58Check'
      | 'CreatorPublicKeyBase58Check'
      | 'ReceiverUsernameOrPublicKeyBase58Check'
      | 'CreatorCoinToTransferNanos'
    >
  >
): Promise<ConstructedTransactionResponse> => {
  if (!isMaybeDeSoPublicKey(params.ReceiverUsernameOrPublicKeyBase58Check)) {
    return Promise.reject(
      'must provide public key, not user name for local construction'
    );
  }
  const metadata = new TransactionMetadataCreatorCoinTransfer();
  metadata.creatorCoinToTransferNanos = params.CreatorCoinToTransferNanos;
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.CreatorPublicKeyBase58Check
  );
  metadata.receiverPublicKey = bs58PublicKeyToCompressedBytes(
    params.ReceiverUsernameOrPublicKeyBase58Check
  );
  return constructBalanceModelTx(params.SenderPublicKeyBase58Check, metadata, {
    ExtraData: params.ExtraData,
    MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
    TransactionFees: params.TransactionFees,
  });
};
