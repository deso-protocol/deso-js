import { hexToBytes } from '@noble/hashes/utils';
import {
  ConstructedTransactionResponse,
  StakeRequest,
  StakeRewardMethod,
  StakeTxnResponse,
  UnlockStakeRequest,
  UnstakeRequest,
} from '../backend-types/index.js';
import {
  TransactionMetadataStake,
  TransactionMetadataUnlockStake,
  TransactionMetadataUnstake,
  bs58PublicKeyToCompressedBytes,
} from '../identity/index.js';
import {
  constructBalanceModelTx,
  getTxWithFeeNanos,
  handleSignAndSubmit,
  sumTransactionFees,
} from '../internal.js';
import {
  ConstructedAndSubmittedTx,
  TxRequestOptions,
  TypeWithOptionalFeesAndExtraData,
} from '../types.js';
import { guardTxPermission, stripHexPrefix } from './utils.js';

type StakeRequestParams = TypeWithOptionalFeesAndExtraData<StakeRequest>;

const buildStakeMetadata = (params: StakeRequestParams) => {
  const metadata = new TransactionMetadataStake();
  metadata.validatorPublicKey = bs58PublicKeyToCompressedBytes(
    params.ValidatorPublicKeyBase58Check
  );
  metadata.rewardMethod =
    params.RewardMethod === StakeRewardMethod.PayToBalance ? 0 : 1;
  metadata.stakeAmountNanos = hexToBytes(
    stripHexPrefix(params.StakeAmountNanos)
  );

  return metadata;
};

export const constructStakeTransaction = (
  params: StakeRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildStakeMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

export const stake = async (
  params: StakeRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<StakeTxnResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.TransactorPublicKeyBase58Check,
    buildStakeMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        parseInt(params.StakeAmountNanos, 16) +
        txWithFee.feeNanos +
        sumTransactionFees(params.TransactionFees),
      StakeLimitMap: [
        {
          ValidatorPublicKeyBase58Check: params.ValidatorPublicKeyBase58Check,
          StakeLimit: params.StakeAmountNanos,
        },
      ],
    });
  }

  return handleSignAndSubmit('api/v0/stake', params, {
    ...options,
    constructionFunction: constructStakeTransaction,
  });
};

type UnstakeRequestParams = TypeWithOptionalFeesAndExtraData<UnstakeRequest>;

const buildUnstakeMetadata = (params: UnstakeRequestParams) => {
  const metadata = new TransactionMetadataUnstake();
  metadata.validatorPublicKey = bs58PublicKeyToCompressedBytes(
    params.ValidatorPublicKeyBase58Check
  );
  // TODO: make sure this replace is correct.
  metadata.unstakeAmountNanos = hexToBytes(
    params.UnstakeAmountNanos.replace('0x', 'x')
  );

  return metadata;
};

export const constructUnstakeTransaction = (
  params: UnstakeRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildUnstakeMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

export const unstake = async (
  params: UnstakeRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<StakeTxnResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.TransactorPublicKeyBase58Check,
    buildUnstakeMetadata(params),
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
      UnstakeLimitMap: [
        {
          ValidatorPublicKeyBase58Check: params.ValidatorPublicKeyBase58Check,
          UnstakeLimit: params.UnstakeAmountNanos,
        },
      ],
    });
  }

  return handleSignAndSubmit('api/v0/unstake', params, {
    ...options,
    constructionFunction: constructUnstakeTransaction,
  });
};

type UnlockStakeRequestParams =
  TypeWithOptionalFeesAndExtraData<UnlockStakeRequest>;

const buildUnlockStakeMetadata = (params: UnlockStakeRequestParams) => {
  const metadata = new TransactionMetadataUnlockStake();
  metadata.validatorPublicKey = bs58PublicKeyToCompressedBytes(
    params.ValidatorPublicKeyBase58Check
  );
  metadata.startEpochNumber = params.StartEpochNumber;
  metadata.endEpochNumber = params.EndEpochNumber;

  return metadata;
};

export const constructUnlockStakeTransaction = (
  params: UnlockStakeRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildUnlockStakeMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

export const unlockStake = async (
  params: UnlockStakeRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<StakeTxnResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.TransactorPublicKeyBase58Check,
    buildUnlockStakeMetadata(params),
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
      UnlockStakeLimitMap: [
        {
          ValidatorPublicKeyBase58Check: params.ValidatorPublicKeyBase58Check,
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
    });
  }

  return handleSignAndSubmit('api/v0/unlock-stake', params, {
    ...options,
    constructionFunction: constructUnlockStakeTransaction,
  });
};
