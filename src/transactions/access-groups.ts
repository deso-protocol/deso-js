import {
  AddAccessGroupMembersRequest,
  AddAccessGroupMembersResponse,
  ConstructedTransactionResponse,
  CreateAccessGroupRequest,
  CreateAccessGroupResponse,
  RequestOptions,
  TxRequestWithOptionalFeesAndExtraData,
} from '../backend-types';
import { PartialWithRequiredFields } from '../data';
import {
  AccessGroupMemberRecord,
  TransactionExtraData,
  TransactionMetadataAccessGroup,
  TransactionMetadataAccessGroupMembers,
  bs58PublicKeyToCompressedBytes,
  encodeUTF8ToBytes,
} from '../identity';
import { guardTxPermission } from '../identity/permissions-utils';
import {
  constructBalanceModelTx,
  convertExtraData,
  getTxWithFeeNanos,
  handleSignAndSubmit,
  sumTransactionFees,
} from '../internal';
import { ConstructedAndSubmittedTx, TxRequestOptions } from '../types';

const buildAccessGroupMetadata = (params: CreateAccessGroupRequestParams) => {
  const metadata = new TransactionMetadataAccessGroup();
  metadata.accessGroupPublicKey = bs58PublicKeyToCompressedBytes(
    params.AccessGroupPublicKeyBase58Check
  );
  metadata.accessGroupOwnerPublicKey = bs58PublicKeyToCompressedBytes(
    params.AccessGroupOwnerPublicKeyBase58Check
  );
  metadata.accessGroupOperationType = 2;
  metadata.accessGroupKeyName = encodeUTF8ToBytes(params.AccessGroupKeyName);
  return metadata;
};

export const constructCreateAccessGroupTransaction = (
  params: CreateAccessGroupRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.AccessGroupOwnerPublicKeyBase58Check,
    buildAccessGroupMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/access-groups-api#create-access-group
 */
export type CreateAccessGroupRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      CreateAccessGroupRequest,
      | 'AccessGroupOwnerPublicKeyBase58Check'
      | 'AccessGroupKeyName'
      | 'AccessGroupPublicKeyBase58Check'
    >
  >;
export const createAccessGroup = async (
  params: CreateAccessGroupRequestParams,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<CreateAccessGroupResponse>> => {
  const txWithFee = getTxWithFeeNanos(
    params.AccessGroupOwnerPublicKeyBase58Check,
    buildAccessGroupMetadata(params),
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
      // NOTE: This is more permissive than we actually need it to be, but I
      // couldn't get it to work when specifying the AccessGroupKeyName and
      // AccessGroupOwnerPublicKeyBase58Check. If anyone complains, we can
      // revisit it, but this is not a terribly sensitive permission to grant.
      AccessGroupLimitMap: [
        {
          AccessGroupOwnerPublicKeyBase58Check: '',
          ScopeType: 'Any',
          AccessGroupKeyName: '',
          OperationType: 'Any',
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
      AccessGroupMemberLimitMap: [
        {
          AccessGroupOwnerPublicKeyBase58Check: '',
          ScopeType: 'Any',
          AccessGroupKeyName: '',
          OperationType: 'Any',
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
    });
  }

  return handleSignAndSubmit('api/v0/create-access-group', params, {
    ...options,
    constructionFunction: constructCreateAccessGroupTransaction,
  });
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/access-groups-api#update-access-group
 */
export type UpdateAccessGroupRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      CreateAccessGroupRequest,
      | 'AccessGroupOwnerPublicKeyBase58Check'
      | 'AccessGroupKeyName'
      | 'AccessGroupPublicKeyBase58Check'
    >
  >;
export const updateAccessGroup = (
  params: UpdateAccessGroupRequestParams,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<CreateAccessGroupResponse>> => {
  return handleSignAndSubmit('api/v0/update-access-group', params, {
    ...options,
    constructionFunction: constructUpdateAccessGroupTransaction,
  });
};

export const constructUpdateAccessGroupTransaction = (
  params: UpdateAccessGroupRequestParams
): Promise<ConstructedTransactionResponse> => {
  const metadata = new TransactionMetadataAccessGroup();
  metadata.accessGroupPublicKey = bs58PublicKeyToCompressedBytes(
    params.AccessGroupPublicKeyBase58Check
  );
  metadata.accessGroupOwnerPublicKey = bs58PublicKeyToCompressedBytes(
    params.AccessGroupOwnerPublicKeyBase58Check
  );
  metadata.accessGroupOperationType = 3;
  metadata.accessGroupKeyName = encodeUTF8ToBytes(params.AccessGroupKeyName);
  return constructBalanceModelTx(
    params.AccessGroupOwnerPublicKeyBase58Check,
    metadata,
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/access-groups-api#add-access-group-members
 */
export const addAccessGroupMembers = async (
  params: TxRequestWithOptionalFeesAndExtraData<AddAccessGroupMembersRequest>,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<AddAccessGroupMembersResponse>> => {
  const txWithFee = getTxWithFeeNanos(
    params.AccessGroupOwnerPublicKeyBase58Check,
    buildAddAccessGroupMemberMetadata(params),
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
      // NOTE: This is more permissive than we actually need it to be, but I
      // couldn't get it to work when specifying the AccessGroupKeyName and
      // AccessGroupOwnerPublicKeyBase58Check. If anyone complains, we can
      // revisit it, but this is not a terribly sensitive permission to grant.
      AccessGroupLimitMap: [
        {
          AccessGroupOwnerPublicKeyBase58Check: '',
          ScopeType: 'Any',
          AccessGroupKeyName: '',
          OperationType: 'Any',
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
      AccessGroupMemberLimitMap: [
        {
          AccessGroupOwnerPublicKeyBase58Check: '',
          ScopeType: 'Any',
          AccessGroupKeyName: '',
          OperationType: 'Any',
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
    });
  }

  return handleSignAndSubmit('api/v0/add-access-group-members', params, {
    ...options,
    constructionFunction: constructAddAccessGroupMembersTransaction,
  });
};

const buildAddAccessGroupMemberMetadata = (
  params: TxRequestWithOptionalFeesAndExtraData<AddAccessGroupMembersRequest>
) => {
  const metadata = new TransactionMetadataAccessGroupMembers();
  metadata.accessGroupOwnerPublicKey = bs58PublicKeyToCompressedBytes(
    params.AccessGroupOwnerPublicKeyBase58Check
  );
  metadata.accessGroupMemberOperationType = 2;
  metadata.accessGroupKeyName = encodeUTF8ToBytes(params.AccessGroupKeyName);
  metadata.accessGroupMembersList = params.AccessGroupMemberList.map(
    (member) => {
      const newAccessGroupMember = new AccessGroupMemberRecord();
      newAccessGroupMember.accessGroupMemberPublicKey =
        bs58PublicKeyToCompressedBytes(
          member.AccessGroupMemberPublicKeyBase58Check
        );
      newAccessGroupMember.accessGroupMemberKeyName = encodeUTF8ToBytes(
        member.AccessGroupMemberKeyName
      );
      newAccessGroupMember.encryptedKey = encodeUTF8ToBytes(
        member.EncryptedKey
      );
      newAccessGroupMember.extraData = convertExtraData(member.ExtraData);
      return newAccessGroupMember;
    }
  );
  return metadata;
};

export const constructAddAccessGroupMembersTransaction = (
  params: TxRequestWithOptionalFeesAndExtraData<AddAccessGroupMembersRequest>
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.AccessGroupOwnerPublicKeyBase58Check,
    buildAddAccessGroupMemberMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/access-groups-api#remove-access-group-members
 */
export const removeAccessGroupMembers = async (
  params: TxRequestWithOptionalFeesAndExtraData<AddAccessGroupMembersRequest>,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<AddAccessGroupMembersResponse>> => {
  const txWithFee = getTxWithFeeNanos(
    params.AccessGroupOwnerPublicKeyBase58Check,
    buildRemoveAccessGroupMemberMetadata(params),
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
      // NOTE: This is more permissive than we actually need it to be, but I
      // couldn't get it to work when specifying the AccessGroupKeyName and
      // AccessGroupOwnerPublicKeyBase58Check. If anyone complains, we can
      // revisit it, but this is not a terribly sensitive permission to grant.
      AccessGroupLimitMap: [
        {
          AccessGroupOwnerPublicKeyBase58Check: '',
          ScopeType: 'Any',
          AccessGroupKeyName: '',
          OperationType: 'Any',
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
      AccessGroupMemberLimitMap: [
        {
          AccessGroupOwnerPublicKeyBase58Check: '',
          ScopeType: 'Any',
          AccessGroupKeyName: '',
          OperationType: 'Any',
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
    });
  }
  return handleSignAndSubmit('api/v0/remove-access-group-members', params, {
    ...options,
    constructionFunction: constructRemoveAccessGroupMembersTransaction,
  });
};

const buildRemoveAccessGroupMemberMetadata = (
  params: TxRequestWithOptionalFeesAndExtraData<AddAccessGroupMembersRequest>
) => {
  const metadata = new TransactionMetadataAccessGroupMembers();
  metadata.accessGroupOwnerPublicKey = bs58PublicKeyToCompressedBytes(
    params.AccessGroupOwnerPublicKeyBase58Check
  );
  metadata.accessGroupMemberOperationType = 3;
  metadata.accessGroupKeyName = encodeUTF8ToBytes(params.AccessGroupKeyName);
  metadata.accessGroupMembersList = params.AccessGroupMemberList.map(
    (member) => {
      const newAccessGroupMember = new AccessGroupMemberRecord();
      newAccessGroupMember.accessGroupMemberPublicKey =
        bs58PublicKeyToCompressedBytes(
          member.AccessGroupMemberPublicKeyBase58Check
        );
      newAccessGroupMember.accessGroupMemberKeyName = encodeUTF8ToBytes(
        params.AccessGroupKeyName
      );
      newAccessGroupMember.encryptedKey = new Uint8Array(0);
      newAccessGroupMember.extraData = new TransactionExtraData();
      return newAccessGroupMember;
    }
  );
  return metadata;
};
export const constructRemoveAccessGroupMembersTransaction = (
  params: TxRequestWithOptionalFeesAndExtraData<AddAccessGroupMembersRequest>
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.AccessGroupOwnerPublicKeyBase58Check,
    buildRemoveAccessGroupMemberMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/access-groups-api#update-access-group-members
 */
export const updateAccessGroupMembers = async (
  params: TxRequestWithOptionalFeesAndExtraData<AddAccessGroupMembersRequest>,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<AddAccessGroupMembersResponse>> => {
  const txWithFee = getTxWithFeeNanos(
    params.AccessGroupOwnerPublicKeyBase58Check,
    buildUpdateAccessGroupMembersMetadata(params),
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
      // NOTE: This is more permissive than we actually need it to be, but I
      // couldn't get it to work when specifying the AccessGroupKeyName and
      // AccessGroupOwnerPublicKeyBase58Check. If anyone complains, we can
      // revisit it, but this is not a terribly sensitive permission to grant.
      AccessGroupLimitMap: [
        {
          AccessGroupOwnerPublicKeyBase58Check: '',
          ScopeType: 'Any',
          AccessGroupKeyName: '',
          OperationType: 'Any',
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
      AccessGroupMemberLimitMap: [
        {
          AccessGroupOwnerPublicKeyBase58Check: '',
          ScopeType: 'Any',
          AccessGroupKeyName: '',
          OperationType: 'Any',
          OpCount: options?.txLimitCount ?? 1,
        },
      ],
    });
  }

  return handleSignAndSubmit('api/v0/update-access-group-members', params, {
    ...options,
    constructionFunction: constructUpdateAccessGroupMembersTransaction,
  });
};

const buildUpdateAccessGroupMembersMetadata = (
  params: TxRequestWithOptionalFeesAndExtraData<AddAccessGroupMembersRequest>
) => {
  const metadata = new TransactionMetadataAccessGroupMembers();
  metadata.accessGroupOwnerPublicKey = bs58PublicKeyToCompressedBytes(
    params.AccessGroupOwnerPublicKeyBase58Check
  );
  metadata.accessGroupMemberOperationType = 4;
  metadata.accessGroupKeyName = encodeUTF8ToBytes(params.AccessGroupKeyName);
  metadata.accessGroupMembersList = params.AccessGroupMemberList.map(
    (member) => {
      const newAccessGroupMember = new AccessGroupMemberRecord();
      newAccessGroupMember.accessGroupMemberPublicKey =
        bs58PublicKeyToCompressedBytes(
          member.AccessGroupMemberPublicKeyBase58Check
        );
      newAccessGroupMember.accessGroupMemberKeyName = encodeUTF8ToBytes(
        member.AccessGroupMemberKeyName
      );
      newAccessGroupMember.encryptedKey = encodeUTF8ToBytes(
        member.EncryptedKey
      );
      newAccessGroupMember.extraData = convertExtraData(member.ExtraData);
      return newAccessGroupMember;
    }
  );
  return metadata;
};

export const constructUpdateAccessGroupMembersTransaction = (
  params: TxRequestWithOptionalFeesAndExtraData<AddAccessGroupMembersRequest>
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.AccessGroupOwnerPublicKeyBase58Check,
    buildUpdateAccessGroupMembersMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};
