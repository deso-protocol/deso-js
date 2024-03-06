import { hexToBytes } from '@noble/hashes/utils';
import {
  ConstructedTransactionResponse,
  DAOCoinLimitOrderRequest,
  DAOCoinLimitOrderWithCancelOrderIDRequest,
  DAOCoinMarketOrderRequest,
  DAOCoinOrderResponse,
  DAOCoinRequest,
  DAOCoinResponse,
  RequestOptions,
  TransferDAOCoinRequest,
  TransferDAOCoinResponse,
  TxRequestWithOptionalFeesAndExtraData,
} from '../backend-types/index.js';
import { PartialWithRequiredFields } from '../data/index.js';
import {
  TransactionMetadataDAOCoin,
  TransactionMetadataTransferDAOCoin,
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
 * https://docs.deso.org/deso-backend/construct-transactions/dao-transactions-api#create-deso-token-dao-coin
 */
export type ConstructBurnDeSoTokenRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      Omit<DAOCoinRequest, 'OperationType'>,
      | 'UpdaterPublicKeyBase58Check'
      | 'ProfilePublicKeyBase58CheckOrUsername'
      | 'CoinsToBurnNanos'
    >
  >;
export const burnDeSoToken = (
  params: ConstructBurnDeSoTokenRequestParams,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinResponse>> => {
  return handleSignAndSubmit(
    'api/v0/dao-coin',
    {
      ...params,
      OperationType: 'burn',
    },
    { ...options, constructionFunction: constructBurnDeSoTokenTransaction }
  );
};

export const constructBurnDeSoTokenTransaction = (
  params: ConstructBurnDeSoTokenRequestParams
): Promise<ConstructedTransactionResponse> => {
  const metadata = new TransactionMetadataDAOCoin();
  // TODO: I know we're passing hex strings representing uint256, but need
  // to figure out how they go to bytes.
  if (!isMaybeDeSoPublicKey(params.ProfilePublicKeyBase58CheckOrUsername)) {
    return Promise.reject(
      'must provide profile public key, not username for local transaction construction'
    );
  }
  metadata.coinsToBurnNanos = hexToBytes(
    params.CoinsToBurnNanos.replace('0x', 'x')
  );
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.ProfilePublicKeyBase58CheckOrUsername
  );
  metadata.operationType = 1;
  return constructBalanceModelTx(params.UpdaterPublicKeyBase58Check, metadata, {
    ExtraData: params.ExtraData,
    MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
    TransactionFees: params.TransactionFees,
  });
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/dao-transactions-api#create-deso-token-dao-coin
 */
export type MintDeSoTokenRequestParams = TxRequestWithOptionalFeesAndExtraData<
  PartialWithRequiredFields<
    Omit<DAOCoinRequest, 'OperationType'>,
    | 'UpdaterPublicKeyBase58Check'
    | 'ProfilePublicKeyBase58CheckOrUsername'
    | 'CoinsToMintNanos'
  >
>;
export const mintDeSoToken = (
  params: MintDeSoTokenRequestParams,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinResponse>> => {
  return handleSignAndSubmit(
    'api/v0/dao-coin',
    {
      ...params,
      OperationType: 'mint',
    },
    { ...options, constructionFunction: constructMintDeSoTokenTransaction }
  );
};

export const constructMintDeSoTokenTransaction = (
  params: MintDeSoTokenRequestParams
): Promise<ConstructedTransactionResponse> => {
  const metadata = new TransactionMetadataDAOCoin();
  // TODO: I know we're passing hex strings representing uint256, but need
  // to figure out how they go to bytes.
  if (!isMaybeDeSoPublicKey(params.ProfilePublicKeyBase58CheckOrUsername)) {
    return Promise.reject(
      'must provide profile public key, not username for local transaction construction'
    );
  }
  metadata.coinsToMintNanos = hexToBytes(
    params.CoinsToMintNanos.replace('0x', 'x')
  );
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.ProfilePublicKeyBase58CheckOrUsername
  );
  metadata.operationType = 0;
  return constructBalanceModelTx(params.UpdaterPublicKeyBase58Check, metadata, {
    ExtraData: params.ExtraData,
    MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
    TransactionFees: params.TransactionFees,
  });
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/dao-transactions-api#create-deso-token-dao-coin
 */
export type UpdateDeSoTokenTransferRestrictionStatusRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      Omit<DAOCoinRequest, 'OperationType'>,
      'UpdaterPublicKeyBase58Check' | 'ProfilePublicKeyBase58CheckOrUsername'
    >
  >;
export const updateDeSoTokenTransferRestrictionStatus = (
  params: UpdateDeSoTokenTransferRestrictionStatusRequestParams,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinResponse>> => {
  return handleSignAndSubmit(
    'api/v0/dao-coin',
    {
      ...params,
      OperationType: 'update_transfer_restriction_status',
    },
    {
      ...options,
      constructionFunction:
        constructUpdateDeSoTokenTransferRestrictionStatusTransaction,
    }
  );
};

export const constructUpdateDeSoTokenTransferRestrictionStatusTransaction = (
  params: UpdateDeSoTokenTransferRestrictionStatusRequestParams
): Promise<ConstructedTransactionResponse> => {
  const metadata = new TransactionMetadataDAOCoin();
  // TODO: I know we're passing hex strings representing uint256, but need
  // to figure out how they go to bytes.
  if (!isMaybeDeSoPublicKey(params.ProfilePublicKeyBase58CheckOrUsername)) {
    return Promise.reject(
      'must provide profile public key, not username for local transaction construction'
    );
  }
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.ProfilePublicKeyBase58CheckOrUsername
  );
  metadata.operationType = 3;
  let transferRestrictionStatus: number;
  switch (params.TransferRestrictionStatus) {
    case 'dao_members_only':
      transferRestrictionStatus = 2;
      break;
    case 'permanently_unrestricted':
      transferRestrictionStatus = 3;
      break;
    case 'profile_owner_only':
      transferRestrictionStatus = 1;
      break;
    case 'unrestricted':
      transferRestrictionStatus = 0;
      break;
    default:
      return Promise.reject('invalid transfer restriction status value');
  }
  metadata.transferRestrictionStatus = transferRestrictionStatus;
  return constructBalanceModelTx(params.UpdaterPublicKeyBase58Check, metadata, {
    ExtraData: params.ExtraData,
    MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
    TransactionFees: params.TransactionFees,
  });
};

export type DisableMintingDeSoTokenRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      Omit<DAOCoinRequest, 'OperationType'>,
      'UpdaterPublicKeyBase58Check' | 'ProfilePublicKeyBase58CheckOrUsername'
    >
  >;
export const disableMintingDeSoToken = (
  params: DisableMintingDeSoTokenRequestParams,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinResponse>> => {
  return handleSignAndSubmit(
    'api/v0/dao-coin',
    {
      ...params,
      OperationType: 'disable_minting',
    },
    { ...options, constructionFunction: constructDisableMintingDeSoToken }
  );
};

export const constructDisableMintingDeSoToken = (
  params: DisableMintingDeSoTokenRequestParams
): Promise<ConstructedTransactionResponse> => {
  const metadata = new TransactionMetadataDAOCoin();
  if (!isMaybeDeSoPublicKey(params.ProfilePublicKeyBase58CheckOrUsername)) {
    return Promise.reject(
      'must provide profile public key, not username for local transaction construction'
    );
  }
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.ProfilePublicKeyBase58CheckOrUsername
  );
  metadata.operationType = 2;
  return constructBalanceModelTx(params.UpdaterPublicKeyBase58Check, metadata, {
    ExtraData: params.ExtraData,
    MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
    TransactionFees: params.TransactionFees,
  });
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/dao-transactions-api#transfer-deso-token-dao-coin
 */
export const transferDeSoToken = async (
  params: TxRequestWithOptionalFeesAndExtraData<TransferDAOCoinRequest>,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<TransferDAOCoinResponse>> => {
  if (options?.checkPermissions !== false) {
    const txWithFee = getTxWithFeeNanos(
      params.SenderPublicKeyBase58Check,
      new TransactionMetadataTransferDAOCoin(),
      {
        // TODO: I'm not sure exactly what outputs are needed here... for the time
        // being I'm just adding a static 1500 nanos to make sure the derived key
        // transaction can be submitted.
        // Outputs: ...,
        ExtraData: params.ExtraData,
        MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
        TransactionFees: params.TransactionFees,
      }
    );

    if (!isMaybeDeSoPublicKey(params.ProfilePublicKeyBase58CheckOrUsername)) {
      return Promise.reject(
        'must provide profile public key, not username for ProfilePublicKeyBase58CheckOrUsername when checking dao coin transfer permissions'
      );
    }
    await guardTxPermission({
      GlobalDESOLimit:
        // TODO: when I figure out how to properly calculate the fee for this transaction
        // we can remove this static 1500 buffer.
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees) + 1500,
      TransactionCountLimitMap: {
        DAO_COIN_TRANSFER:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions.TransactionCountLimitMap
            ?.DAO_COIN_TRANSFER ??
          1,
      },
      DAOCoinOperationLimitMap: {
        [params.ProfilePublicKeyBase58CheckOrUsername]: {
          transfer: 1,
        },
      },
    });
  }

  return handleSignAndSubmit('api/v0/transfer-dao-coin', params, {
    ...options,
    constructionFunction: constructTransferDeSoToken,
  });
};

export const constructTransferDeSoToken = (
  params: TxRequestWithOptionalFeesAndExtraData<TransferDAOCoinRequest>
): Promise<ConstructedTransactionResponse> => {
  if (!isMaybeDeSoPublicKey(params.ProfilePublicKeyBase58CheckOrUsername)) {
    return Promise.reject(
      'must provide profile public key, not username for local transaction construction'
    );
  }
  const metadata = new TransactionMetadataTransferDAOCoin();
  metadata.daoCoinToTransferNanos = hexToBytes(
    params.DAOCoinToTransferNanos.replace('0x', 'x')
  );
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.ProfilePublicKeyBase58CheckOrUsername
  );
  metadata.receiverPublicKey = bs58PublicKeyToCompressedBytes(
    params.ReceiverPublicKeyBase58CheckOrUsername
  );
  return constructBalanceModelTx(params.SenderPublicKeyBase58Check, metadata, {
    ExtraData: params.ExtraData,
    MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
    TransactionFees: params.TransactionFees,
  });
};

// TODO: Balance model transaction construction for limit orders.
/**
 * https://docs.deso.org/deso-backend/construct-transactions/dao-transactions-api#create-deso-token-dao-coin-limit-order
 */
export const createDeSoTokenLimitOrder = (
  params: DAOCoinLimitOrderRequest,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinOrderResponse>> => {
  return handleSignAndSubmit(
    'api/v0/create-dao-coin-limit-order',
    {
      ...params,
    },
    options
  );
};

export const createDeSoTokenMarketOrder = (
  params: DAOCoinMarketOrderRequest,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinOrderResponse>> => {
  return handleSignAndSubmit(
    'api/v0/create-dao-coin-market-order',
    {
      ...params,
    },
    options
  );
};

export const buyDeSoTokenMarketOrder = (
  params: PartialWithRequiredFields<
    Omit<
      DAOCoinMarketOrderRequest,
      'SellingDAOCoinCreatorPublicKeyBase58Check' | 'OperationType'
    >,
    | 'TransactorPublicKeyBase58Check'
    | 'BuyingDAOCoinCreatorPublicKeyBase58Check'
    | 'Quantity'
  >,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinOrderResponse>> => {
  return handleSignAndSubmit(
    'api/v0/create-dao-coin-market-order',
    {
      ...params,
      SellingDAOCoinCreatorPublicKeyBase58Check: '',
      OperationType: 'BID',
    },
    options
  );
};

export const sellDeSoTokenMarketOrder = (
  params: PartialWithRequiredFields<
    Omit<
      DAOCoinMarketOrderRequest,
      'BuyingDAOCoinCreatorPublicKeyBase58Check' | 'OperationType'
    >,
    | 'TransactorPublicKeyBase58Check'
    | 'SellingDAOCoinCreatorPublicKeyBase58Check'
    | 'Quantity'
  >,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinOrderResponse>> => {
  return handleSignAndSubmit(
    'api/v0/create-dao-coin-market-order',
    {
      ...params,
      SellingDAOCoinCreatorPublicKeyBase58Check: '',
      OperationType: 'ASK',
    },
    options
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/dao-transactions-api#cancel-deso-token-dao-coin-limit-order
 */
export const cancelDeSoTokenLimitOrder = (
  params: TxRequestWithOptionalFeesAndExtraData<DAOCoinLimitOrderWithCancelOrderIDRequest>,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinOrderResponse>> => {
  return handleSignAndSubmit(
    'api/v0/cancel-dao-coin-limit-order',
    params,
    options
  );
};
