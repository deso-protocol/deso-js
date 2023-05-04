import { hexToBytes } from '@noble/hashes/utils';
import {
  AssociationTxnResponse,
  ConstructedTransactionResponse,
  CreatePostAssociationRequest,
  CreateUserAssociationRequest,
  DeleteAssociationRequest,
  RequestOptions,
  TxRequestWithOptionalFeesAndExtraData,
} from '../backend-types';
import { PartialWithRequiredFields } from '../data';
import {
  TransactionMetadataCreatePostAssociation,
  TransactionMetadataCreateUserAssociation,
  TransactionMetadataDeletePostAssociation,
  TransactionMetadataDeleteUserAssociation,
  bs58PublicKeyToCompressedBytes,
  encodeUTF8ToBytes,
} from '../identity';
import { guardTxPermission } from '../identity/permissions-utils';
import {
  constructBalanceModelTx,
  getTxWithFeeNanos,
  handleSignAndSubmit,
  sumTransactionFees,
} from '../internal';
import { ConstructedAndSubmittedTx, TxRequestOptions } from '../types';

/**
 * https://docs.deso.org/deso-backend/construct-transactions/associations-transactions-api#create-user-association
 */

export type CreateUserAssociationRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      CreateUserAssociationRequest,
      | 'TargetUserPublicKeyBase58Check'
      | 'TransactorPublicKeyBase58Check'
      | 'AssociationType'
      | 'AssociationValue'
    >
  >;
export const createUserAssociation = async (
  params: CreateUserAssociationRequestParams,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<AssociationTxnResponse>> => {
  const txWithFee = getTxWithFeeNanos(
    params.TransactorPublicKeyBase58Check,
    buildCreateUserAssociationMetadata(params),
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
      AssociationLimitMap: [
        {
          AssociationClass: 'User',
          AssociationType: params.AssociationType,
          AppScopeType: params.AppPublicKeyBase58Check ? 'Scoped' : 'Any',
          AppPublicKeyBase58Check: params.AppPublicKeyBase58Check ?? '',
          AssociationOperation: 'Create',
          OpCount: options?.txLimitCount ?? 1,
        },
        // NOTE: This is a bit weird, but we don't have AppPublicKeyBase58Check
        // or AssociationType in the delete params, so we just ask for delete
        // permission at the same time the association is created.
        {
          AssociationClass: 'User',
          AssociationType: params.AssociationType,
          AppScopeType: params.AppPublicKeyBase58Check ? 'Scoped' : 'Any',
          AppPublicKeyBase58Check: params.AppPublicKeyBase58Check ?? '',
          AssociationOperation: 'Delete',
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
    });
  }

  return handleSignAndSubmit('api/v0/user-associations/create', params, {
    ...options,
    constructionFunction: constructCreateUserAssociationTransaction,
  });
};

const buildCreateUserAssociationMetadata = (
  params: CreateUserAssociationRequestParams
) => {
  const metadata = new TransactionMetadataCreateUserAssociation();
  metadata.appPublicKey = bs58PublicKeyToCompressedBytes(
    params.AppPublicKeyBase58Check || ''
  );
  metadata.associationType = encodeUTF8ToBytes(params.AssociationType);
  metadata.associationValue = encodeUTF8ToBytes(params.AssociationValue);
  metadata.targetUserPublicKey = bs58PublicKeyToCompressedBytes(
    params.TargetUserPublicKeyBase58Check
  );

  return metadata;
};

export const constructCreateUserAssociationTransaction = (
  params: CreateUserAssociationRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildCreateUserAssociationMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/associations-transactions-api#delete-user-association
 */

export type DeleteUserAssociationRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      DeleteAssociationRequest,
      'TransactorPublicKeyBase58Check' | 'AssociationID'
    >
  >;

export const deleteUserAssociation = async (
  params: DeleteUserAssociationRequestParams,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<AssociationTxnResponse>> => {
  return handleSignAndSubmit('api/v0/user-associations/delete', params, {
    ...options,
    constructionFunction: constructDeleteUserAssociationTransaction,
  });
};

const buildDeleteUserAssociationMetadata = (
  params: DeletePostAssociationRequestParams
) => {
  const metadata = new TransactionMetadataDeleteUserAssociation();
  metadata.associationID = encodeUTF8ToBytes(params.AssociationID);
  return metadata;
};

export const constructDeleteUserAssociationTransaction = (
  params: DeleteUserAssociationRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildDeleteUserAssociationMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/associations-transactions-api#create-post-association
 */
export type CreatePostAssociationRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      CreatePostAssociationRequest,
      | 'PostHashHex'
      | 'TransactorPublicKeyBase58Check'
      | 'AssociationType'
      | 'AssociationValue'
    >
  >;
export const createPostAssociation = async (
  params: CreatePostAssociationRequestParams,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<AssociationTxnResponse>> => {
  const txWithFee = getTxWithFeeNanos(
    params.TransactorPublicKeyBase58Check,
    buildCreatePostAssociationMetadata(params),
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
      AssociationLimitMap: [
        {
          AssociationClass: 'Post',
          AssociationType: params.AssociationType,
          AppScopeType: params.AppPublicKeyBase58Check ? 'Scoped' : 'Any',
          AppPublicKeyBase58Check: params.AppPublicKeyBase58Check ?? '',
          AssociationOperation: 'Create',
          OpCount: options?.txLimitCount ?? 1,
        },
        // NOTE: This is a bit weird, but we don't have AppPublicKeyBase58Check
        // or AssociationType in the delete params, so we just ask for delete
        // permission at the same time the association is created.
        {
          AssociationClass: 'Post',
          AssociationType: params.AssociationType,
          AppScopeType: params.AppPublicKeyBase58Check ? 'Scoped' : 'Any',
          AppPublicKeyBase58Check: params.AppPublicKeyBase58Check ?? '',
          AssociationOperation: 'Delete',
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
    });
  }

  return handleSignAndSubmit('api/v0/post-associations/create', params, {
    ...options,
    constructionFunction: constructCreatePostAssociationTransaction,
  });
};

const buildCreatePostAssociationMetadata = (
  params: CreatePostAssociationRequestParams
) => {
  const metadata = new TransactionMetadataCreatePostAssociation();
  metadata.appPublicKey = bs58PublicKeyToCompressedBytes(
    params.AppPublicKeyBase58Check || ''
  );
  metadata.associationType = encodeUTF8ToBytes(params.AssociationType);
  metadata.associationValue = encodeUTF8ToBytes(params.AssociationValue);
  metadata.postHash = hexToBytes(params.PostHashHex);

  return metadata;
};

export const constructCreatePostAssociationTransaction = (
  params: CreatePostAssociationRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    buildCreatePostAssociationMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/associations-transactions-api#delete-post-association
 */
export type DeletePostAssociationRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      DeleteAssociationRequest,
      'TransactorPublicKeyBase58Check' | 'AssociationID'
    >
  >;

export const deletePostAssociation = (
  params: DeletePostAssociationRequestParams,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<AssociationTxnResponse>> => {
  return handleSignAndSubmit('api/v0/post-associations/delete', params, {
    ...options,
    constructionFunction: constructDeletePostAssociationTransaction,
  });
};

export const constructDeletePostAssociationTransaction = (
  params: DeletePostAssociationRequestParams
): Promise<ConstructedTransactionResponse> => {
  const metadata = new TransactionMetadataDeletePostAssociation();
  metadata.associationID = encodeUTF8ToBytes(params.AssociationID);
  return constructBalanceModelTx(
    params.TransactorPublicKeyBase58Check,
    metadata,
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};
