import { hexToBytes } from '@noble/hashes/utils';
import {
  CoinTransferRestrictionStatusByOperation,
  ConstructedTransactionResponse,
  CreateNewCoinRequest,
  CreateNewCoinResponse,
  DAOCoinLimitOrderRequest,
  DAOCoinLimitOrderWithCancelOrderIDRequest,
  DAOCoinMarketOrderRequest,
  DAOCoinOrderResponse,
  DAOCoinRequest,
  DAOCoinResponse,
  DeSoTokenMarketOrderWithFeeRequest,
  DeSoTokenMarketOrderWithFeeResponse,
  LockupLimitMapItem,
  LockupLimitOperationString,
  LockupLimitScopeType,
  OperationTypeWithFee,
  RequestOptions,
  TransactionType,
  TransferDAOCoinRequest,
  TransferDAOCoinResponse,
  TxRequestWithOptionalFeesAndExtraData,
  UpdateCoinPropertiesRequest,
  UpdateCoinPropertiesResponse,
} from '../backend-types/index.js';
import { PartialWithRequiredFields } from '../data/index.js';
import {
  bs58PublicKeyToCompressedBytes,
  identity,
  TransactionMetadataDAOCoin,
  TransactionMetadataTransferDAOCoin,
} from '../identity/index.js';
import {
  constructBalanceModelTx,
  getTxWithFeeNanos,
  handleSignAndSubmit,
  handleSignAndSubmitAtomic,
  isMaybeDeSoPublicKey,
  sumTransactionFees,
} from '../internal.js';
import {
  ConstructedAndSubmittedTx,
  ConstructedAndSubmittedTxAtomic,
  TxRequestOptions,
} from '../types.js';
import { guardTxPermission, stripHexPrefix } from './utils.js';

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
export const burnDeSoToken = async (
  params: ConstructBurnDeSoTokenRequestParams,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinResponse>> => {
  if (options?.checkPermissions !== false) {
    const txWithFee = getTxWithFeeNanos(
      params.UpdaterPublicKeyBase58Check,
      new TransactionMetadataDAOCoin(),
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

    const txnLimitCount =
      options?.txLimitCount ??
      identity.transactionSpendingLimitOptions?.DAOCoinOperationLimitMap?.[
        params.ProfilePublicKeyBase58CheckOrUsername
      ].burn ??
      1;

    await guardTxPermission({
      GlobalDESOLimit:
        // TODO: when I figure out how to properly calculate the fee for this transaction
        // we can remove this static 1500 buffer.
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees) + 1500,
      DAOCoinOperationLimitMap: {
        [params.ProfilePublicKeyBase58CheckOrUsername]: {
          burn: txnLimitCount,
        },
      },
    });
  }

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
    stripHexPrefix(params.CoinsToBurnNanos)
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

export const mintDeSoToken = async (
  params: MintDeSoTokenRequestParams,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinResponse>> => {
  if (options?.checkPermissions !== false) {
    if (!isMaybeDeSoPublicKey(params.ProfilePublicKeyBase58CheckOrUsername)) {
      return Promise.reject(
        'must provide profile public key, not username for local transaction construction'
      );
    }

    await guardTxPermission({
      GlobalDESOLimit: 1 * 1e9,
      DAOCoinOperationLimitMap: {
        [params.UpdaterPublicKeyBase58Check]: {
          mint: 1,
        },
      },
    });
  }

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
    stripHexPrefix(params.CoinsToMintNanos)
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
      Omit<DAOCoinRequest, 'OperationType' | 'TransferRestrictionStatus'>,
      'UpdaterPublicKeyBase58Check' | 'ProfilePublicKeyBase58CheckOrUsername'
    > & {
      TransferRestrictionStatus: keyof typeof CoinTransferRestrictionStatusByOperation;
    }
  >;

export const updateDeSoTokenTransferRestrictionStatus = async (
  params: UpdateDeSoTokenTransferRestrictionStatusRequestParams,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<DAOCoinResponse>> => {
  if (options?.checkPermissions !== false) {
    if (!isMaybeDeSoPublicKey(params.UpdaterPublicKeyBase58Check)) {
      return Promise.reject(
        'must provide profile public key, not username for UpdaterPublicKeyBase58Check when checking dao coin token transfer restriction status permissions'
      );
    }

    await guardTxPermission({
      GlobalDESOLimit: 1 * 1e9,
      DAOCoinOperationLimitMap: {
        [params.UpdaterPublicKeyBase58Check]: {
          update_transfer_restriction_status: 1,
        },
      },
    });
  }

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

    const txnLimitCount =
      options?.txLimitCount ??
      identity.transactionSpendingLimitOptions?.DAOCoinOperationLimitMap?.[
        params.ProfilePublicKeyBase58CheckOrUsername
      ].transfer ??
      1;

    await guardTxPermission({
      GlobalDESOLimit:
        // TODO: when I figure out how to properly calculate the fee for this transaction
        // we can remove this static 1500 buffer.
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees) + 1500,
      DAOCoinOperationLimitMap: {
        [params.ProfilePublicKeyBase58CheckOrUsername]: {
          transfer: txnLimitCount,
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
    stripHexPrefix(params.DAOCoinToTransferNanos)
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

export const createDeSoTokenMarketOrderWithFee = async (
  params: TxRequestWithOptionalFeesAndExtraData<DeSoTokenMarketOrderWithFeeRequest>,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTxAtomic<DeSoTokenMarketOrderWithFeeResponse>
> => {
  if (options?.checkPermissions !== false) {
    if (!isMaybeDeSoPublicKey(params.TransactorPublicKeyBase58Check)) {
      return Promise.reject(
        'must provide profile public key, not username for ProfilePublicKeyBase58CheckOrUsername when checking dao coin transfer permissions'
      );
    }

    const DAOCoinLimitOrderLimitMap =
      params.OperationType === OperationTypeWithFee.BID
        ? {
            [params.BaseCurrencyPublicKeyBase58Check]: {
              [params.QuoteCurrencyPublicKeyBase58Check]: 1,
            },
          }
        : {
            [params.QuoteCurrencyPublicKeyBase58Check]: {
              [params.BaseCurrencyPublicKeyBase58Check]: 1,
            },
          };

    await guardTxPermission({
      GlobalDESOLimit:
        // TODO: there is no way to calculate how much we are spending so this is going to fail
        1000 * 1e9,
      DAOCoinLimitOrderLimitMap: DAOCoinLimitOrderLimitMap,

      /*
      This is hideous, however if we are not providing the spending limits
      we need to assume that this transaction may contain many dao coin transfers
      and basic transfers.

      Any users of this function should preview the transaction first and construct
      appropriate spending limits and pass them in options.spendingLimits.
      */
      ...((identity.transactionSpendingLimitOptions?.DAOCoinOperationLimitMap?.[
        params.QuoteCurrencyPublicKeyBase58Check
      ]?.transfer || 0) < 10
        ? {
            DAOCoinOperationLimitMap: {
              [params.QuoteCurrencyPublicKeyBase58Check]: {
                transfer: 'UNLIMITED',
              },
            },
          }
        : {}),
      ...((identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
        ?.BASIC_TRANSFER || 0) < 10
        ? {
            TransactionCountLimitMap: {
              BASIC_TRANSFER: 'UNLIMITED',
            },
          }
        : {}),

      ...(options?.spendingLimit || {}),
    });
  }

  return handleSignAndSubmitAtomic<DeSoTokenMarketOrderWithFeeResponse>(
    'api/v0/create-dao-coin-limit-order-with-fee',
    params,
    options
  );
};

export const createNewCoin = async (
  params: TxRequestWithOptionalFeesAndExtraData<CreateNewCoinRequest>,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTxAtomic<CreateNewCoinResponse>> => {
  if (options?.checkPermissions !== false) {
    if (!isMaybeDeSoPublicKey(params.UpdaterPublicKey)) {
      return Promise.reject(
        'must provide profile public key, not username for UpdaterPublicKey when checking your transfer permissions'
      );
    }

    const lockupLimitMapParam = {
      LockupLimitMap: [] as LockupLimitMapItem[],
    };

    if (params.CoinApyBasisPoints) {
      lockupLimitMapParam.LockupLimitMap.push({
        ProfilePublicKeyBase58Check: params.UpdaterPublicKey,
        Operation: LockupLimitOperationString.UPDATE_COIN_LOCKUP_YIELD_CURVE,
        ScopeType: LockupLimitScopeType.SCOPED,
        OpCount: 1,
      });
    }

    if (params.OwnershipPercentageBasisPoints) {
      lockupLimitMapParam.LockupLimitMap.push({
        ProfilePublicKeyBase58Check: params.UpdaterPublicKey,
        Operation: LockupLimitOperationString.COIN_LOCKUP,
        ScopeType: LockupLimitScopeType.SCOPED,
        OpCount: 1,
      });
    }

    await guardTxPermission({
      GlobalDESOLimit:
        // TODO: there is no way to calculate how much we are spending so this is going to fail
        1 * 1e9,
      DAOCoinOperationLimitMap: {
        [params.UpdaterPublicKey]: {
          disable_minting: params.DisableMintingOfNewCoins ? 1 : 0,
          update_transfer_restriction_status:
            params.EnablePermanentlyUnrestrictedTransfers ? 1 : 0,
          mint: 2,
          transfer: 1,
        },
      },
      TransactionCountLimitMap: {
        [TransactionType.UpdateProfile]: params.NewProfileUsername ? 2 : 1,
      },
      ...(lockupLimitMapParam.LockupLimitMap.length ? lockupLimitMapParam : {}),
    });
  }

  return handleSignAndSubmitAtomic<CreateNewCoinResponse>(
    'api/v0/create-new-coin',
    params,
    { ...options, jwt: true }
  );
};

export const updateCoinProperties = async (
  params: TxRequestWithOptionalFeesAndExtraData<UpdateCoinPropertiesRequest>,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTxAtomic<UpdateCoinPropertiesResponse>> => {
  if (options?.checkPermissions !== false) {
    if (!isMaybeDeSoPublicKey(params.UpdaterPublicKey)) {
      return Promise.reject(
        'must provide profile public key, not username for UpdaterPublicKey when checking your transfer permissions'
      );
    }

    const lockupLimitMapParam = {
      LockupLimitMap: [] as LockupLimitMapItem[],
    };

    if (params.CoinApyBasisPoints) {
      lockupLimitMapParam.LockupLimitMap.push({
        ProfilePublicKeyBase58Check: params.UpdaterPublicKey,
        Operation: LockupLimitOperationString.UPDATE_COIN_LOCKUP_YIELD_CURVE,
        ScopeType: LockupLimitScopeType.SCOPED,
        OpCount: 1,
      });
    }

    await guardTxPermission({
      GlobalDESOLimit: 1 * 1e9,
      DAOCoinOperationLimitMap: {
        [params.UpdaterPublicKey]: {
          disable_minting: params.DisableMintingOfNewCoins ? 1 : 0,
          update_transfer_restriction_status: 1,
          mint: 2,
          transfer: 1,
        },
      },
      TransactionCountLimitMap: {
        [TransactionType.UpdateProfile]: params.NewProfileUsername ? 2 : 1,
      },
      LockupLimitMap: [
        {
          ProfilePublicKeyBase58Check: params.UpdaterPublicKey,
          Operation: LockupLimitOperationString.UPDATE_COIN_LOCKUP_YIELD_CURVE,
          ScopeType: LockupLimitScopeType.SCOPED,
          OpCount: 1,
        },
        {
          ProfilePublicKeyBase58Check: params.UpdaterPublicKey,
          Operation: LockupLimitOperationString.COIN_LOCKUP,
          ScopeType: LockupLimitScopeType.SCOPED,
          OpCount: 1,
        },
      ],
    });
  }

  return handleSignAndSubmitAtomic<UpdateCoinPropertiesResponse>(
    '/api/v0/update-coin-properties',
    params,
    { ...options, jwt: true }
  );
};
