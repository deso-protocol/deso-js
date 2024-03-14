import {
  BuyOrSellCreatorCoinRequest,
  BuyOrSellCreatorCoinResponse,
  ConstructedTransactionResponse,
  SendDeSoRequest,
  SendDeSoResponse,
  TransferCreatorCoinRequest,
  TransferCreatorCoinResponse,
  TxRequestWithOptionalFeesAndExtraData,
} from '../backend-types/index.js';
import { PartialWithRequiredFields } from '../data/index.js';
import {
  TransactionMetadataBasicTransfer,
  TransactionMetadataCreatorCoin,
  TransactionMetadataCreatorCoinTransfer,
  TransactionOutput,
  bs58PublicKeyToCompressedBytes,
  identity,
} from '../identity/index.js';
import {
  constructBalanceModelTx,
  getTxWithFeeNanos,
  handleSignAndSubmit,
  isMaybeDeSoPublicKey,
  sumTransactionFees,
} from '../internal.js';
import { ConstructedAndSubmittedTx, TxRequestOptions } from '../types.js';
import { guardTxPermission } from './utils.js';

/**
 * https://docs.deso.org/deso-backend/construct-transactions/financial-transactions-api#send-deso
 *
 * NOTE: In the case of a max send, the AmountNanos param will be a -1, which
 * is not useful for calculating the GlobalDESOLimit. In this case, the caller
 * should provide the optional spendingLimitAmountNanos to be used instead.
 */
export const sendDeso = async (
  params: TxRequestWithOptionalFeesAndExtraData<SendDeSoRequest>,
  options?: TxRequestOptions & { spendingLimitAmountNanos?: number }
): Promise<
  ConstructedAndSubmittedTx<SendDeSoResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.SenderPublicKeyBase58Check,
    new TransactionMetadataBasicTransfer(),
    {
      Outputs: buildSendDeSoOutputs({
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

  const amountNanos =
    typeof options?.spendingLimitAmountNanos === 'number'
      ? options.spendingLimitAmountNanos
      : params.AmountNanos;

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        amountNanos +
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

const buildSendDeSoOutputs = (
  params: TxRequestWithOptionalFeesAndExtraData<SendDeSoRequest>
) => {
  const transactionOutput = new TransactionOutput();
  transactionOutput.amountNanos = params.AmountNanos;
  transactionOutput.publicKey = bs58PublicKeyToCompressedBytes(
    // FIXME: this will throw an error if the recipient is a username. We need
    // to either fetch the public key and overwrite the username with it or
    // throw a more helpful error to consumers explaining that we require the
    // public key instead of the username.
    params.RecipientPublicKeyOrUsername
  );
  return [transactionOutput];
};

export const constructSendDeSoTransaction = (
  params: TxRequestWithOptionalFeesAndExtraData<SendDeSoRequest>
): Promise<ConstructedTransactionResponse> => {
  if (!isMaybeDeSoPublicKey(params.RecipientPublicKeyOrUsername)) {
    throw new Error(
      'must provide public key, not user name for local construction'
    );
  }

  return constructBalanceModelTx(
    params.SenderPublicKeyBase58Check,
    new TransactionMetadataBasicTransfer(),
    {
      Outputs: buildSendDeSoOutputs(params),
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
      Nonce: params.Nonce,
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
export const buyCreatorCoin = async (
  params: BuyCreatorCoinRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    BuyOrSellCreatorCoinResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.UpdaterPublicKeyBase58Check,
    buildBuyCreatorCoinMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        params.DeSoToSellNanos +
        txWithFee.feeNanos +
        sumTransactionFees(params.TransactionFees),
      CreatorCoinOperationLimitMap: {
        [params.CreatorPublicKeyBase58Check]: {
          buy: options?.txLimitCount ?? 1,
        },
      },
    });
  }

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

export const sellCreatorCoin = async (
  params: SellCreatorCoinRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    BuyOrSellCreatorCoinResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.UpdaterPublicKeyBase58Check,
    buildSellCreatorCoinMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees),
      CreatorCoinOperationLimitMap: {
        [params.CreatorPublicKeyBase58Check]: {
          sell: options?.txLimitCount ?? 1,
        },
      },
    });
  }

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
export const transferCreatorCoin = async (
  params: TransferCreatorCoinRequestParams,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<TransferCreatorCoinResponse>> => {
  const txWithFee = getTxWithFeeNanos(
    params.SenderPublicKeyBase58Check,
    buildTransferCreatorCoinMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees),
      CreatorCoinOperationLimitMap: {
        [params.CreatorPublicKeyBase58Check]: {
          transfer: options?.txLimitCount ?? 1,
        },
      },
    });
  }

  return handleSignAndSubmit('api/v0/transfer-creator-coin', params, {
    ...options,
    constructionFunction: constructTransferCreatorCoinTransaction,
  });
};

const buildTransferCreatorCoinMetadata = (
  params: TransferCreatorCoinRequestParams
) => {
  const metadata = new TransactionMetadataCreatorCoinTransfer();
  metadata.creatorCoinToTransferNanos = params.CreatorCoinToTransferNanos;
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.CreatorPublicKeyBase58Check
  );
  metadata.receiverPublicKey = bs58PublicKeyToCompressedBytes(
    params.ReceiverUsernameOrPublicKeyBase58Check
  );

  return metadata;
};

const constructTransferCreatorCoinTransaction = (
  params: TransferCreatorCoinRequestParams
): Promise<ConstructedTransactionResponse> => {
  if (!isMaybeDeSoPublicKey(params.ReceiverUsernameOrPublicKeyBase58Check)) {
    return Promise.reject(
      'must provide public key, not user name for local construction'
    );
  }
  return constructBalanceModelTx(
    params.SenderPublicKeyBase58Check,
    buildTransferCreatorCoinMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

const buildBuyCreatorCoinMetadata = (params: BuyCreatorCoinRequestParams) => {
  // NOTE: This is not exactly accurate and gives an upper bound estimate for
  // minCreatorCoinExpectedNanos. It should not but used for actual tx
  // construction, but it is useful for estimating tx fees.
  const metadata = new TransactionMetadataCreatorCoin();
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.CreatorPublicKeyBase58Check
  );
  metadata.operationType = 0;
  metadata.desoToSellNanos = params.DeSoToSellNanos;
  metadata.minCreatorCoinExpectedNanos =
    params.MinCreatorCoinExpectedNanos ?? Number.MAX_SAFE_INTEGER;

  return metadata;
};

const buildSellCreatorCoinMetadata = (params: SellCreatorCoinRequestParams) => {
  // NOTE: This is not exactly accurate and gives an upper bound estimate for
  // minDeSoExpectedNanos. It should not but used for actual tx construction,
  // but it is useful for estimating tx fees.
  const metadata = new TransactionMetadataCreatorCoin();
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.CreatorPublicKeyBase58Check
  );
  metadata.operationType = 1;
  metadata.creatorCoinToSellNanos = params.CreatorCoinToSellNanos;
  metadata.minDeSoExpectedNanos =
    params.MinDeSoExpectedNanos ?? Number.MAX_SAFE_INTEGER;

  return metadata;
};
