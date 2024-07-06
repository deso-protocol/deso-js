import { hexToBytes } from '@noble/hashes/utils';
import {
  ConstructedTransactionResponse,
  RegisterAsValidatorRequest,
  UnjailValidatorRequest,
  UnregisterAsValidatorRequest,
  ValidatorTxnResponse,
} from '../backend-types/index.js';
import {
  TransactionMetadataRegisterAsValidator,
  TransactionMetadataUnjailValidator,
  TransactionMetadataUnregisterAsValidator,
  encodeUTF8ToBytes,
  identity,
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

type RegisterAsValidatorRequestParams =
  TypeWithOptionalFeesAndExtraData<RegisterAsValidatorRequest>;

const buildRegisterAsValidatorMetadata = (
  params: RegisterAsValidatorRequestParams
) => {
  let parsedVotingPublicKey: Uint8Array;
  let parsedVotingAuthorization: Uint8Array;

  try {
    parsedVotingPublicKey = hexToBytes(stripHexPrefix(params.VotingPublicKey));
  } catch (e) {
    throw new Error('Error parsing voting public key: ' + String(e));
  }

  try {
    parsedVotingAuthorization = hexToBytes(
      stripHexPrefix(params.VotingAuthorization)
    );
  } catch (e) {
    throw new Error('Error parsing voting authorization: ' + String(e));
  }

  const metadata = new TransactionMetadataRegisterAsValidator();
  metadata.domains = params.Domains.map((d) => encodeUTF8ToBytes(d));
  metadata.delegatedStakeCommissionBasisPoints =
    params.DelegatedStakeCommissionBasisPoints;
  metadata.disableDelegatedStake = params.DisableDelegatedStake;
  metadata.votingPublicKey = parsedVotingPublicKey;
  metadata.votingAuthorization = parsedVotingAuthorization;

  return metadata;
};

export const constructRegisterAsValidatorTransaction = (
  params: RegisterAsValidatorRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildRegisterAsValidatorMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

export const registerAsValidator = async (
  params: RegisterAsValidatorRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    ValidatorTxnResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.TransactorPublicKeyBase58Check,
    buildRegisterAsValidatorMetadata(params),
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
      TransactionCountLimitMap: {
        REGISTER_AS_VALIDATOR:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
            ?.REGISTER_AS_VALIDATOR ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/validators/register', params, {
    ...options,
    constructionFunction: constructRegisterAsValidatorTransaction,
  });
};

type UnregisterAsValidatorRequestParams =
  TypeWithOptionalFeesAndExtraData<UnregisterAsValidatorRequest>;

const buildUnregisterAsValidatorMetadata = (
  params: UnregisterAsValidatorRequestParams
) => {
  return new TransactionMetadataUnregisterAsValidator();
};

export const constructUnregisterAsValidatorTransaction = (
  params: UnregisterAsValidatorRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildUnregisterAsValidatorMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

export const unRegisterAsValidator = async (
  params: UnregisterAsValidatorRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    ValidatorTxnResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.TransactorPublicKeyBase58Check,
    buildUnregisterAsValidatorMetadata(params),
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
      TransactionCountLimitMap: {
        UNREGISTER_AS_VALIDATOR:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
            ?.UNREGISTER_AS_VALIDATOR ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/validators/unregister', params, {
    ...options,
    constructionFunction: constructUnregisterAsValidatorTransaction,
  });
};

type UnjailValidatorRequestParams =
  TypeWithOptionalFeesAndExtraData<UnjailValidatorRequest>;

const buildUnjailValidatorMetadata = (params: UnjailValidatorRequestParams) => {
  return new TransactionMetadataUnjailValidator();
};

export const constructUnjailValidatorTransaction = (
  params: UnjailValidatorRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildUnjailValidatorMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

export const unJailValidator = async (
  params: UnjailValidatorRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    ValidatorTxnResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.TransactorPublicKeyBase58Check,
    buildUnjailValidatorMetadata(params),
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
      TransactionCountLimitMap: {
        UNJAIL_VALIDATOR:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
            ?.UNREGISTER_AS_VALIDATOR ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/validators/unjail', params, {
    ...options,
    constructionFunction: constructUnjailValidatorTransaction,
  });
};
