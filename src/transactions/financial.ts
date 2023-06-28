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
        // QUESTION: we don't need to add anything extra for the sell check, right?
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees),
      CreatorCoinOperationLimitMap: {
        [params.CreatorPublicKeyBase58Check]: {
          sell: options?.txLimitCount ?? 1,
        },
      },
    });
  }

  // TODO: Add tx permission check once local tx construction is implemented.
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
  const metadata = new TransactionMetadataCreatorCoin();
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.CreatorPublicKeyBase58Check
  );
  metadata.operationType = 0;
  metadata.desoToSellNanos = params.DeSoToSellNanos;
  metadata.desoToAddNanos = params.DeSoToAddNanos ?? 0;
  metadata.minCreatorCoinExpectedNanos = params.MinDeSoExpectedNanos ?? 0;
  metadata.minDeSoExpectedNanos = params.MinDeSoExpectedNanos ?? 0;

  return metadata;
};

const buildSellCreatorCoinMetadata = (params: SellCreatorCoinRequestParams) => {
  // NOTE: I'm not sure if this is completely correct... I'm not sure if it matters
  // for just checking permissions. If we are using this for local tx construction
  // it might need to be updated.
  const metadata = new TransactionMetadataCreatorCoin();
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.CreatorPublicKeyBase58Check
  );
  metadata.operationType = 1;
  metadata.creatorCoinToSellNanos = params.CreatorCoinToSellNanos;
  metadata.desoToAddNanos = params.DeSoToAddNanos ?? 0;
  metadata.minCreatorCoinExpectedNanos = params.MinDeSoExpectedNanos ?? 0;
  metadata.minDeSoExpectedNanos = params.MinDeSoExpectedNanos ?? 0;

  return metadata;
};

// TODO: Make sure these are good to use for full local tx construction.
const constructBuyCreatorCoinTransaction = (
  params: BuyCreatorCoinRequestParams
) => {
  return constructBalanceModelTx(
    params.UpdaterPublicKeyBase58Check,
    buildBuyCreatorCoinMetadata(params),
    {
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

const constructSellCreatorCoinTransaction = (
  params: SellCreatorCoinRequestParams
) => {
  return constructBalanceModelTx(
    params.UpdaterPublicKeyBase58Check,
    buildSellCreatorCoinMetadata(params),
    {
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};
