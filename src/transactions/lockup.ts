import {
  ConstructedAndSubmittedTx,
  TxRequestOptions,
  TypeWithOptionalFeesAndExtraData,
} from '../types.js';
import {
  CoinLockResponse,
  CoinLockupRequest,
  CoinLockupTransferRequest,
  CoinUnlockRequest,
  ConstructedTransactionResponse,
  LockupLimitMapItem,
  LockupLimitOperationString,
  LockupLimitScopeType,
  UpdateCoinLockupParamsRequest,
} from '../backend-types/index.js';
import {
  bs58PublicKeyToCompressedBytes,
  TransactionMetadataCoinLockup,
  TransactionMetadataCoinLockupTransfer,
  TransactionMetadataCoinUnlock,
  TransactionMetadataUpdateCoinLockupParams,
} from '../identity/index.js';
import { hexToBytes } from '@noble/hashes/utils';
import {
  constructBalanceModelTx,
  getTxWithFeeNanos,
  handleSignAndSubmit,
  sumTransactionFees,
} from '../internal.js';
import { guardTxPermission, stripHexPrefix } from './utils.js';

type CoinLockupRequestParams =
  TypeWithOptionalFeesAndExtraData<CoinLockupRequest>;

const buildCoinLockupMetadata = (params: CoinLockupRequestParams) => {
  const metadata = new TransactionMetadataCoinLockup();
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.ProfilePublicKeyBase58Check
  );
  metadata.recipientPublicKey = bs58PublicKeyToCompressedBytes(
    params.RecipientPublicKeyBase58Check
  );
  // TODO: make sure this replace is correct.
  metadata.lockupAmountBaseUnits = hexToBytes(
    stripHexPrefix(params.LockupAmountBaseUnits)
  );
  metadata.unlockTimestampNanoSecs = params.UnlockTimestampNanoSecs;
  metadata.vestingEndTimestampNanoSecs = params.VestingEndTimestampNanoSecs;
  return metadata;
};

export const constructCoinLockupTransaction = (
  params: CoinLockupRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildCoinLockupMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

export const coinLockup = async (
  params: CoinLockupRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<CoinLockResponse | ConstructedTransactionResponse>
> => {
  if (options?.checkPermissions !== false) {
    const txWithFee = getTxWithFeeNanos(
      params.TransactorPublicKeyBase58Check,
      buildCoinLockupMetadata(params),
      {
        ExtraData: params.ExtraData,
        MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
        TransactionFees: params.TransactionFees,
      }
    );

    await guardTxPermission({
      GlobalDESOLimit:
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees),
      LockupLimitMap: [
        {
          ProfilePublicKeyBase58Check: params.ProfilePublicKeyBase58Check,
          Operation: LockupLimitOperationString.COIN_LOCKUP,
          ScopeType: LockupLimitScopeType.SCOPED,
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
    });
  }

  return handleSignAndSubmit('api/v0/coin-lockup', params, {
    ...options,
    constructionFunction: constructCoinLockupTransaction,
  });
};

type CoinUnlockRequestParams =
  TypeWithOptionalFeesAndExtraData<CoinUnlockRequest>;

const buildCoinUnlockMetadata = (params: CoinUnlockRequestParams) => {
  const metadata = new TransactionMetadataCoinUnlock();
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.ProfilePublicKeyBase58Check
  );
  return metadata;
};

export const constructCoinUnlockTransaction = (
  params: CoinUnlockRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildCoinUnlockMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

export const coinUnlock = async (
  params: CoinUnlockRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<CoinLockResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.TransactorPublicKeyBase58Check,
    buildCoinUnlockMetadata(params),
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
      LockupLimitMap: [
        {
          ProfilePublicKeyBase58Check: params.ProfilePublicKeyBase58Check,
          Operation: LockupLimitOperationString.COIN_UNLOCK,
          ScopeType: LockupLimitScopeType.SCOPED,
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
    });
  }

  return handleSignAndSubmit('api/v0/coin-unlock', params, {
    ...options,
    constructionFunction: constructCoinUnlockTransaction,
  });
};

type CoinLockupTransferRequestParams =
  TypeWithOptionalFeesAndExtraData<CoinLockupTransferRequest>;

const buildCoinLockupTransferMetadata = (
  params: CoinLockupTransferRequestParams
) => {
  const metadata = new TransactionMetadataCoinLockupTransfer();
  metadata.profilePublicKey = bs58PublicKeyToCompressedBytes(
    params.ProfilePublicKeyBase58Check
  );
  metadata.recipientPublicKey = bs58PublicKeyToCompressedBytes(
    params.RecipientPublicKeyBase58Check
  );
  metadata.unlockTimestampNanoSecs = params.UnlockTimestampNanoSecs;
  // TODO: make sure this replace is correct.
  metadata.lockedCoinsToTransferBaseUnits = hexToBytes(
    params.LockedCoinsToTransferBaseUnits.replace('0x', 'x')
  );
  return metadata;
};

export const constructCoinLockupTransferTransaction = (
  params: CoinLockupTransferRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildCoinLockupTransferMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

export const coinLockupTransfer = async (
  params: CoinLockupTransferRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<CoinLockResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.TransactorPublicKeyBase58Check,
    buildCoinLockupTransferMetadata(params),
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
      LockupLimitMap: [
        {
          ProfilePublicKeyBase58Check: params.ProfilePublicKeyBase58Check,
          Operation: LockupLimitOperationString.COIN_LOCKUP_TRANSFER,
          ScopeType: LockupLimitScopeType.SCOPED,
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
    });
  }

  return handleSignAndSubmit('api/v0/coin-lockup-transfer', params, {
    ...options,
    constructionFunction: constructCoinLockupTransferTransaction,
  });
};

type UpdateCoinLockupParamsRequestParams =
  TypeWithOptionalFeesAndExtraData<UpdateCoinLockupParamsRequest>;

const buildUpdateCoinLockupParamsMetadata = (
  params: UpdateCoinLockupParamsRequestParams
) => {
  const metadata = new TransactionMetadataUpdateCoinLockupParams();
  metadata.lockupYieldDurationNanoSecs = params.LockupYieldDurationNanoSecs;
  metadata.lockupYieldAPYBasisPoints = params.LockupYieldAPYBasisPoints;
  metadata.removeYieldCurvePoint = params.RemoveYieldCurvePoint;
  metadata.newLockupTransferRestrictions = params.NewLockupTransferRestrictions;
  let transferRestrictionStatus: number;
  switch (params.LockupTransferRestrictionStatus) {
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
      throw new Error('Invalid LockupTransferRestrictionStatus');
  }
  metadata.lockupTransferRestrictionStatus = transferRestrictionStatus;
  return metadata;
};

export const constructUpdateCoinLockupParamsTransaction = (
  params: UpdateCoinLockupParamsRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildUpdateCoinLockupParamsMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

export const updateCoinLockupParams = async (
  params: UpdateCoinLockupParamsRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<CoinLockResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.TransactorPublicKeyBase58Check,
    buildUpdateCoinLockupParamsMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    // TODO: this one is tricky since a single transaction can reduce from two
    // different limits.
    // @jacksondean - help me plzzz.
    const newLockupTransferRestrictionLimit =
      params.NewLockupTransferRestrictions
        ? {
            ProfilePublicKeyBase58Check: params.TransactorPublicKeyBase58Check,
            Operation:
              LockupLimitOperationString.UPDATE_COIN_LOCKUP_TRANSFER_RESTRICTIONS,
            ScopeType: LockupLimitScopeType.SCOPED,
            OpCount: options?.txLimitCount ?? 1,
          }
        : null;
    const addYieldCurvePointLimit = {
      ProfilePublicKeyBase58Check: params.TransactorPublicKeyBase58Check,
      Operation: LockupLimitOperationString.UPDATE_COIN_LOCKUP_YIELD_CURVE,
      ScopeType: LockupLimitScopeType.SCOPED,
      OpCount: options?.txLimitCount ?? 1,
    };
    const limits = [addYieldCurvePointLimit];
    if (newLockupTransferRestrictionLimit) {
      limits.push(newLockupTransferRestrictionLimit);
    }
    await guardTxPermission({
      GlobalDESOLimit:
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees),
      LockupLimitMap: limits,
    });
  }

  return handleSignAndSubmit('api/v0/update-coin-lockup-params', params, {
    ...options,
    constructionFunction: constructUpdateCoinLockupParamsTransaction,
  });
};
