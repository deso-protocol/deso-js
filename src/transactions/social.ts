import { hexToBytes } from '@noble/hashes/utils';
import { utils as ecUtils } from '@noble/secp256k1';
import {
  ConstructedTransactionResponse,
  CreateFollowTxnStatelessRequest,
  CreateFollowTxnStatelessResponse,
  CreateLikeStatelessRequest,
  CreateLikeStatelessResponse,
  DeSoBodySchema,
  DiamondLevelString,
  SendDiamondsRequest,
  SendDiamondsResponse,
  SendNewMessageRequest,
  SendNewMessageResponse,
  SubmitPostRequest,
  SubmitPostResponse,
  TransactionFee,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from '../backend-types';
import { PartialWithRequiredFields, checkPartyAccessGroups } from '../data';
import {
  TransactionExtraDataKV,
  TransactionMetadataBasicTransfer,
  TransactionMetadataFollow,
  TransactionMetadataLike,
  TransactionMetadataNewMessage,
  TransactionMetadataSubmitPost,
  TransactionMetadataUpdateProfile,
  bs58PublicKeyToCompressedBytes,
  encodeUTF8ToBytes,
  identity,
  uvarint64ToBuf,
} from '../identity';
import { DIAMOND_LEVEL_MAP } from '../identity/constants';
import { guardTxPermission } from '../identity/permissions-utils';
import {
  constructBalanceModelTx,
  getTxWithFeeNanos,
  handleSignAndSubmit,
  sumTransactionFees,
} from '../internal';
import {
  ConstructedAndSubmittedTx,
  TxRequestOptions,
  TypeWithOptionalFeesAndExtraData,
} from '../types';

const buildUpdateProfileMetadata = (
  params: TypeWithOptionalFeesAndExtraData<UpdateProfileRequest>
) => {
  const metadata = new TransactionMetadataUpdateProfile();
  // TODO: this is broken.
  metadata.profilePublicKey =
    params.UpdaterPublicKeyBase58Check !== params.ProfilePublicKeyBase58Check
      ? bs58PublicKeyToCompressedBytes(params.ProfilePublicKeyBase58Check)
      : new Uint8Array(0);
  metadata.newUsername = encodeUTF8ToBytes(params.NewUsername);
  metadata.newDescription = encodeUTF8ToBytes(params.NewDescription);
  // TODO: we probably need something to handle the profile pic compression here.
  metadata.newProfilePic = encodeUTF8ToBytes(params.NewProfilePic);
  metadata.newCreatorBasisPoints = params.NewCreatorBasisPoints;
  metadata.newStakeMultipleBasisPoints = params.NewStakeMultipleBasisPoints;
  metadata.isHidden = params.IsHidden;

  return metadata;
};

export const constructUpdateProfileTransaction = (
  params: TypeWithOptionalFeesAndExtraData<UpdateProfileRequest>
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.UpdaterPublicKeyBase58Check,
    buildUpdateProfileMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/social-transactions-api#update-profile
 */
export const updateProfile = async (
  params: TypeWithOptionalFeesAndExtraData<UpdateProfileRequest>,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    UpdateProfileResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.UpdaterPublicKeyBase58Check,
    buildUpdateProfileMetadata(params),
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
        UPDATE_PROFILE:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
            ?.UPDATE_PROFILE ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/update-profile', params, {
    ...options,
    constructionFunction: constructUpdateProfileTransaction,
  });
};

const buildSubmitPostMetadata = (params: SubmitPostRequestParams) => {
  const metadata = new TransactionMetadataSubmitPost();
  const BodyObjCopy: Partial<DeSoBodySchema> = {};
  Object.keys(params.BodyObj).forEach((k) => {
    const key = k as keyof DeSoBodySchema;
    const value = params.BodyObj[key] as string & string[];
    if (!value) return;
    if (Array.isArray(value) && value.length > 0) {
      BodyObjCopy[key] = value;
    } else {
      BodyObjCopy[key] = value;
    }
  });
  metadata.body = encodeUTF8ToBytes(JSON.stringify(BodyObjCopy));
  metadata.creatorBasisPoints = 1000;
  metadata.stakeMultipleBasisPoints = 12500;
  metadata.timestampNanos = Math.ceil(
    1e6 * (globalThis.performance.timeOrigin + globalThis.performance.now())
  );
  metadata.isHidden = !!params.IsHidden;
  metadata.parentStakeId = hexToBytes(params.ParentStakeID || '');
  metadata.postHashToModify = hexToBytes(params.PostHashHexToModify || '');

  return metadata;
};

const buildSubmitPostConsensusKVs = (params: SubmitPostRequestParams) => {
  const extraDataKVs: TransactionExtraDataKV[] = [];

  if (params.RepostedPostHashHex) {
    extraDataKVs.push(
      new TransactionExtraDataKV(
        encodeUTF8ToBytes('RecloutedPostHash'),
        hexToBytes(params.RepostedPostHashHex)
      )
    );
    extraDataKVs.push(
      new TransactionExtraDataKV(
        encodeUTF8ToBytes('IsQuotedReclout'),
        Uint8Array.from([
          !params.BodyObj.Body &&
          !params.BodyObj.ImageURLs?.length &&
          !params.BodyObj.VideoURLs?.length
            ? 0
            : 1,
        ])
      )
    );
  }

  return extraDataKVs;
};

export const constructSubmitPost = (
  params: SubmitPostRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.UpdaterPublicKeyBase58Check,
    buildSubmitPostMetadata(params),
    {
      ExtraData: params.ExtraData,
      ConsensusExtraDataKVs: buildSubmitPostConsensusKVs(params),
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/social-transactions-api#submit-post
 */
export type SubmitPostRequestParams = TypeWithOptionalFeesAndExtraData<
  PartialWithRequiredFields<
    SubmitPostRequest,
    'UpdaterPublicKeyBase58Check' | 'BodyObj'
  >
>;
export const submitPost = async (
  params: SubmitPostRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<SubmitPostResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.UpdaterPublicKeyBase58Check,
    buildSubmitPostMetadata(params),
    {
      ExtraData: params.ExtraData,
      ConsensusExtraDataKVs: buildSubmitPostConsensusKVs(params),
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees),
      TransactionCountLimitMap: {
        SUBMIT_POST:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
            ?.SUBMIT_POST ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/submit-post', params, {
    ...options,
    constructionFunction: constructSubmitPost,
  });
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/social-transactions-api#follow
 */
export type CreateFollowTxnRequestParams = TypeWithOptionalFeesAndExtraData<
  PartialWithRequiredFields<
    CreateFollowTxnStatelessRequest,
    'FollowedPublicKeyBase58Check' | 'FollowerPublicKeyBase58Check'
  >
>;

export const updateFollowingStatus = async (
  params: CreateFollowTxnRequestParams,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<CreateFollowTxnStatelessResponse>> => {
  const txWithFee = getTxWithFeeNanos(
    params.FollowerPublicKeyBase58Check,
    buildFollowMetadata(params),
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
        FOLLOW:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
            ?.FOLLOW ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/create-follow-txn-stateless', params, {
    ...options,
    constructionFunction: constructFollowTransaction,
  });
};

const buildFollowMetadata = (params: CreateFollowTxnRequestParams) => {
  const metadata = new TransactionMetadataFollow();
  metadata.followedPublicKey = bs58PublicKeyToCompressedBytes(
    params.FollowedPublicKeyBase58Check
  );
  metadata.isUnfollow = !!params.IsUnfollow;
  return metadata;
};

export const constructFollowTransaction = (
  params: CreateFollowTxnRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.FollowerPublicKeyBase58Check,
    buildFollowMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/social-transactions-api#send-diamonds
 */
export const sendDiamonds = async (
  params: TypeWithOptionalFeesAndExtraData<SendDiamondsRequest>,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<SendDiamondsResponse>> => {
  const txWithFee = getTxWithFeeNanos(
    params.SenderPublicKeyBase58Check,
    new TransactionMetadataBasicTransfer(),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
      ConsensusExtraDataKVs: buildSendDiamondsConsensusKVs(params),
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        txWithFee.feeNanos +
        sumTransactionFees(params.TransactionFees) +
        DIAMOND_LEVEL_MAP[params.DiamondLevel.toString() as DiamondLevelString],
      TransactionCountLimitMap: {
        BASIC_TRANSFER:
          identity.transactionSpendingLimitOptions.TransactionCountLimitMap
            ?.BASIC_TRANSFER ??
          options?.txLimitCount ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/send-diamonds', params, options);
};

export const buildSendDiamondsConsensusKVs = (
  params: TypeWithOptionalFeesAndExtraData<SendDiamondsRequest>
) => {
  const consensusExtraDataKVs: TransactionExtraDataKV[] = [];
  const diamondLevelKV = new TransactionExtraDataKV();
  diamondLevelKV.key = encodeUTF8ToBytes('DiamondLevel');
  diamondLevelKV.value = uvarint64ToBuf(params.DiamondLevel);
  consensusExtraDataKVs.push(diamondLevelKV);
  const diamondPostHashKV = new TransactionExtraDataKV();
  diamondPostHashKV.key = encodeUTF8ToBytes('DiamondPostHash');
  diamondPostHashKV.value = hexToBytes(params.DiamondPostHashHex);

  consensusExtraDataKVs.push(diamondPostHashKV);

  return consensusExtraDataKVs;
};

// This one is a bit annoying since we should really look up how many diamonds you've already given on this post and only send the diff.
export const constructDiamondTransaction = (
  params: TypeWithOptionalFeesAndExtraData<SendDiamondsRequest>
): Promise<ConstructedTransactionResponse> => {
  return Promise.reject('Local construction for diamonds not supported yet.');
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/social-transactions-api#like
 */

export type CreateLikeTransactionParams = TypeWithOptionalFeesAndExtraData<
  PartialWithRequiredFields<
    CreateLikeStatelessRequest,
    'LikedPostHashHex' | 'ReaderPublicKeyBase58Check'
  >
>;
export const updateLikeStatus = async (
  params: CreateLikeTransactionParams,
  options?: TxRequestOptions
): Promise<ConstructedAndSubmittedTx<CreateLikeStatelessResponse>> => {
  const txWithFee = getTxWithFeeNanos(
    params.ReaderPublicKeyBase58Check,
    buildLikeMetadata(params),
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
        LIKE:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions.TransactionCountLimitMap
            ?.LIKE ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/create-like-stateless', params, {
    ...options,
    constructionFunction: constructLikeTransaction,
  });
};

const buildLikeMetadata = (params: CreateLikeTransactionParams) => {
  const metadata = new TransactionMetadataLike();
  metadata.likedPostHash = hexToBytes(params.LikedPostHashHex);
  metadata.isUnlike = !!params.IsUnlike;
  return metadata;
};

export const constructLikeTransaction = (
  params: CreateLikeTransactionParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.ReaderPublicKeyBase58Check,
    buildLikeMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

enum NewMessageType {
  DM = 0,
  Group = 1,
}

enum NewMessageOperation {
  Create = 0,
  Update = 1,
}

interface NewMessageTxOptions {
  type: NewMessageType;
  operation: NewMessageOperation;
  timestampNanos?: number;
}

/**
 * https://docs.deso.org/deso-backend/construct-transactions/social-transactions-api#send-direct-message
 * TODO: for DM should we fill in the messaging group name as a convenience? For DM it is currently always 'default-key'
 */
type SendNewMessageParams = TypeWithOptionalFeesAndExtraData<
  Omit<SendNewMessageRequest, 'TimestampNanosString'>
>;
export const sendDMMessage = async (
  params: SendNewMessageParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    SendNewMessageResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.SenderAccessGroupOwnerPublicKeyBase58Check,
    buildNewMessageMetadata(params, {
      type: NewMessageType.DM,
      operation: NewMessageOperation.Create,
    }),
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
        NEW_MESSAGE:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
            ?.NEW_MESSAGE ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/send-dm-message', params, {
    ...options,
    constructionFunction: constructSendDMTransaction,
  });
};

const buildNewMessageMetadata = (
  params: SendNewMessageParams,
  {
    type,
    operation,
    timestampNanos = Math.ceil(
      1e6 * (globalThis.performance.timeOrigin + globalThis.performance.now())
    ),
  }: NewMessageTxOptions
) => {
  const metadata = new TransactionMetadataNewMessage();
  metadata.encryptedText = encodeUTF8ToBytes(params.EncryptedMessageText);
  metadata.newMessageOperation = operation;
  metadata.newMessageType = type;
  metadata.recipientAccessGroupKeyname = encodeUTF8ToBytes(
    params.RecipientAccessGroupKeyName
  );
  metadata.recipientAccessGroupOwnerPublicKey = bs58PublicKeyToCompressedBytes(
    params.RecipientAccessGroupOwnerPublicKeyBase58Check
  );
  metadata.recipientAccessGroupPublicKey = bs58PublicKeyToCompressedBytes(
    params.RecipientAccessGroupPublicKeyBase58Check
  );
  metadata.senderAccessGroupKeyName = encodeUTF8ToBytes(
    params.SenderAccessGroupKeyName
  );
  metadata.senderAccessGroupOwnerPublicKey = bs58PublicKeyToCompressedBytes(
    params.SenderAccessGroupOwnerPublicKeyBase58Check
  );
  metadata.senderAccessGroupPublicKey = bs58PublicKeyToCompressedBytes(
    params.SenderAccessGroupPublicKeyBase58Check
  );
  metadata.timestampNanos = timestampNanos;

  return metadata;
};

export const constructSendDMTransaction = (
  params: SendNewMessageParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.SenderAccessGroupOwnerPublicKeyBase58Check,
    buildNewMessageMetadata(params, {
      type: NewMessageType.DM,
      operation: NewMessageOperation.Create,
    }),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/social-transactions-api#send-direct-message
 */
export const updateDMMessage = async (
  params: TypeWithOptionalFeesAndExtraData<SendNewMessageRequest>,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    SendNewMessageResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.SenderAccessGroupOwnerPublicKeyBase58Check,
    buildNewMessageMetadata(params, {
      type: NewMessageType.DM,
      operation: NewMessageOperation.Update,
      timestampNanos: parseInt(params.TimestampNanosString),
    }),
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
        NEW_MESSAGE:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
            ?.NEW_MESSAGE ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/update-dm-message', params, {
    ...options,
    constructionFunction: constructUpdateDMTransaction,
  });
};

export const constructUpdateDMTransaction = (
  params: TypeWithOptionalFeesAndExtraData<SendNewMessageRequest>
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.SenderAccessGroupOwnerPublicKeyBase58Check,
    buildNewMessageMetadata(params, {
      type: NewMessageType.DM,
      operation: NewMessageOperation.Update,
      timestampNanos: parseInt(params.TimestampNanosString),
    }),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/social-transactions-api#send-group-chat-message
 */
export const sendGroupChatMessage = async (
  params: SendNewMessageParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    SendNewMessageResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.SenderAccessGroupOwnerPublicKeyBase58Check,
    buildNewMessageMetadata(params, {
      type: NewMessageType.Group,
      operation: NewMessageOperation.Create,
    }),
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
        NEW_MESSAGE:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
            ?.NEW_MESSAGE ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/send-group-chat-message', params, {
    ...options,
    constructionFunction: constructSendGroupChatMessageTransaction,
  });
};

export const constructSendGroupChatMessageTransaction = (
  params: SendNewMessageParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.SenderAccessGroupOwnerPublicKeyBase58Check,
    buildNewMessageMetadata(params, {
      type: NewMessageType.Group,
      operation: NewMessageOperation.Create,
    }),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * Convenience function to send a message to a group chat or DM that handles
 * encryption and access group party check. AccessGroup is optional, and if not
 * provided we make the assumption that this is a direct message and use the
 * user's default messaging group. You may also pass an optional
 * sendMessageUnencrypted flag to force the message to be sent unencrypted.
 */
interface SendMessageParams {
  SenderPublicKeyBase58Check: string;
  RecipientPublicKeyBase58Check: string;
  Message: string;
  AccessGroup?: string;
  ExtraData?: { [key: string]: string };
  MinFeeRateNanosPerKB?: number;
  TransactionFees?: TransactionFee[];
}
export const sendMessage = async (
  params: SendMessageParams,
  options?: TxRequestOptions & { sendMessageUnencrypted?: boolean }
) => {
  if (!params.AccessGroup) {
    params.AccessGroup = 'default-key';
  }

  const txWithFee = getTxWithFeeNanos(
    params.SenderPublicKeyBase58Check,
    buildNewMessageMetadata(
      {
        // NOTE: some of these fields we don't *actually* know without making an
        // api call to get them, but for the purpose of estimating the fees, we
        // can just use dummy values.
        SenderAccessGroupOwnerPublicKeyBase58Check:
          params.SenderPublicKeyBase58Check,
        SenderAccessGroupPublicKeyBase58Check:
          params.SenderPublicKeyBase58Check,
        SenderAccessGroupKeyName: params.AccessGroup,
        RecipientAccessGroupOwnerPublicKeyBase58Check:
          params.RecipientPublicKeyBase58Check,
        RecipientAccessGroupPublicKeyBase58Check:
          params.RecipientPublicKeyBase58Check,
        RecipientAccessGroupKeyName: params.AccessGroup,
        // NOTE: We are calculating the fee in order to determine whether or not
        // we should prompt the user to re-approve the derived key used for
        // signing transactions. We *must* do this before executing any async
        // code, otherwise popup blockers will generally block the popup.
        // Encrypting the message is an async operation, so we must use the
        // plain text message for the fee calculation which is not exactly
        // right, but it should be close. We may need to revisit this, however,
        // and include a buffer in the fee calculation.
        EncryptedMessageText: params.Message,

        MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
        TransactionFees: params.TransactionFees,
        ExtraData: params.ExtraData,
      },
      {
        type: NewMessageType.Group,
        operation: NewMessageOperation.Create,
      }
    ),
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
        NEW_MESSAGE:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
            ?.NEW_MESSAGE ??
          1,
      },
    });
  }

  const {
    SenderAccessGroupPublicKeyBase58Check,
    SenderAccessGroupKeyName,
    RecipientAccessGroupPublicKeyBase58Check,
    RecipientAccessGroupKeyName,
  } = await checkPartyAccessGroups({
    SenderPublicKeyBase58Check: params.SenderPublicKeyBase58Check,
    SenderAccessGroupKeyName: 'default-key',
    RecipientPublicKeyBase58Check: params.RecipientPublicKeyBase58Check,
    RecipientAccessGroupKeyName: params.AccessGroup,
  });

  if (!SenderAccessGroupKeyName) {
    throw new Error('Sender does not have default messaging group');
  }

  const EncryptedMessageText = options?.sendMessageUnencrypted
    ? hexEncodePlainText(params.Message)
    : await identity.encryptMessage(
        RecipientAccessGroupPublicKeyBase58Check,
        params.Message
      );

  if (!EncryptedMessageText) {
    throw new Error('Failed to encrypt message');
  }

  const sendMessageRequestParams = {
    SenderAccessGroupOwnerPublicKeyBase58Check:
      params.SenderPublicKeyBase58Check,
    SenderAccessGroupPublicKeyBase58Check,
    SenderAccessGroupKeyName,
    RecipientAccessGroupOwnerPublicKeyBase58Check:
      params.RecipientPublicKeyBase58Check,
    RecipientAccessGroupPublicKeyBase58Check,
    RecipientAccessGroupKeyName,
    EncryptedMessageText,
    ExtraData: params.ExtraData,
    MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
  };

  return params.AccessGroup === 'default-key'
    ? sendDMMessage(sendMessageRequestParams, options)
    : sendGroupChatMessage(sendMessageRequestParams, options);
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/social-transactions-api#send-group-chat-message
 */
export const updateGroupChatMessage = async (
  params: TypeWithOptionalFeesAndExtraData<SendNewMessageRequest>,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    SendNewMessageResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.SenderAccessGroupOwnerPublicKeyBase58Check,
    buildNewMessageMetadata(params, {
      type: NewMessageType.Group,
      operation: NewMessageOperation.Update,
      timestampNanos: parseInt(params.TimestampNanosString),
    }),
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
        NEW_MESSAGE:
          options?.txLimitCount ??
          identity.transactionSpendingLimitOptions?.TransactionCountLimitMap
            ?.NEW_MESSAGE ??
          1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/update-group-chat-message', params, {
    ...options,
    constructionFunction: constructUpdateGroupChatMessageTransaction,
  });
};

export const constructUpdateGroupChatMessageTransaction = (
  params: TypeWithOptionalFeesAndExtraData<SendNewMessageRequest>
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.SenderAccessGroupOwnerPublicKeyBase58Check,

    buildNewMessageMetadata(params, {
      type: NewMessageType.Group,
      operation: NewMessageOperation.Update,
      timestampNanos: parseInt(params.TimestampNanosString),
    }),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * @private
 * internal helper function to convert a string to hex
 * @param plainText
 * @returns hex encoded string
 */
function hexEncodePlainText(plainText: string) {
  const textEncoder = new TextEncoder();
  const bytes = textEncoder.encode(plainText);
  return ecUtils.bytesToHex(new Uint8Array(bytes));
}
