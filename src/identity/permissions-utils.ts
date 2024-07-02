import { TransactionSpendingLimitResponse } from '../backend-types/index.js';
import { TransactionSpendingLimitResponseOptions } from './types.js';

export function compareTransactionSpendingLimits(
  expectedPermissions: TransactionSpendingLimitResponseOptions,
  actualPermissions: TransactionSpendingLimitResponse
): boolean {
  let hasAllPermissions = true;

  // if the key is unlimited then we don't need to check anything else
  if (actualPermissions?.IsUnlimited) {
    return hasAllPermissions;
  }

  walkObj(expectedPermissions, (expectedVal, path) => {
    // If the actual permissions are configured with any of the special "allow
    // anything" mappings then we rewrite the lookup path for any explicit
    // mapping to match on the "allow any" mapping. In some cases, simply
    // compare the OpCounts and return early if their can be only 1 mapping.
    switch (path?.[0]) {
      case 'AccessGroupLimitMap':
        if (
          actualPermissions?.AccessGroupLimitMap?.find((map) => {
            return (
              map.ScopeType === 'Any' &&
              map.AccessGroupKeyName === '' &&
              map.OperationType === 'Any' &&
              map.OpCount >=
                normalizeCount(
                  expectedPermissions?.AccessGroupLimitMap?.[Number(path[1])]
                    ?.OpCount
                )
            );
          })
        ) {
          return;
        }
        break;
      case 'AccessGroupMemberLimitMap':
        if (
          actualPermissions?.AccessGroupMemberLimitMap?.find((map) => {
            return (
              map.ScopeType === 'Any' &&
              map.AccessGroupKeyName === '' &&
              map.OperationType === 'Any' &&
              map.OpCount >=
                normalizeCount(
                  expectedPermissions?.AccessGroupMemberLimitMap?.[
                    Number(path[1])
                  ]?.OpCount
                )
            );
          })
        ) {
          return;
        }
        break;
      case 'AssociationLimitMap':
        if (
          actualPermissions?.AssociationLimitMap?.find((map) => {
            return (
              map.AssociationClass ===
                expectedPermissions?.AssociationLimitMap?.[Number(path[1])]
                  ?.AssociationClass &&
              map.AppScopeType === 'Any' &&
              map.AssociationType === '' &&
              map.AssociationOperation === 'Any' &&
              map.OpCount >=
                normalizeCount(
                  expectedPermissions?.AssociationLimitMap?.[Number(path[1])]
                    ?.OpCount
                )
            );
          })
        ) {
          return;
        }
        break;
      case 'CreatorCoinOperationLimitMap':
        if (actualPermissions?.CreatorCoinOperationLimitMap?.['']) {
          path =
            typeof actualPermissions?.CreatorCoinOperationLimitMap['']?.any ===
            'number'
              ? ['CreatorCoinOperationLimitMap', '', 'any']
              : ['CreatorCoinOperationLimitMap', '', path[path.length - 1]];
        }
        break;
      case 'NFTOperationLimitMap':
        if (actualPermissions?.NFTOperationLimitMap?.['']?.[0]) {
          path =
            typeof actualPermissions?.NFTOperationLimitMap?.['']?.[0]?.any ===
            'number'
              ? ['NFTOperationLimitMap', '', '0', 'any']
              : ['NFTOperationLimitMap', '', '0', path[path.length - 1]];
        }
        break;
      // TODO: support for making sure a derived key has these limits...
      // @jacksondean - this is a little more annoying since
      // stake and unstake limits don't have an op count, but rather a deso limit.
      case 'StakeLimitMap':
        if (
          actualPermissions?.StakeLimitMap?.find((map) => {
            return (
              map.ValidatorPublicKeyBase58Check === '' &&
              expectedPermissions?.StakeLimitMap?.[Number(path[1])]
                ?.StakeLimit &&
              parseInt(map.StakeLimit, 16) >=
                parseInt(
                  expectedPermissions?.StakeLimitMap?.[Number(path[1])]
                    ?.StakeLimit,
                  16
                )
            );
          })
        ) {
          return;
        }
        break;
      case 'UnstakeLimitMap':
        if (
          actualPermissions?.UnstakeLimitMap?.find((map) => {
            return (
              map.ValidatorPublicKeyBase58Check === '' &&
              expectedPermissions?.UnstakeLimitMap?.[Number(path[1])]
                ?.UnstakeLimit &&
              parseInt(map.UnstakeLimit, 16) >=
                parseInt(
                  expectedPermissions?.UnstakeLimitMap?.[Number(path[1])]
                    ?.UnstakeLimit,
                  16
                )
            );
          })
        ) {
          return;
        }
        break;
      case 'UnlockStakeLimitMap':
        if (
          actualPermissions?.UnlockStakeLimitMap?.find((map) => {
            return (
              map.ValidatorPublicKeyBase58Check === '' &&
              map.OpCount >=
                normalizeCount(
                  expectedPermissions?.UnlockStakeLimitMap?.[Number(path[1])]
                    ?.OpCount
                )
            );
          })
        ) {
          return;
        }
        break;
      case 'LockupLimitMap':
        if (
          actualPermissions?.LockupLimitMap?.find((map) => {
            return (
              map.ProfilePublicKeyBase58Check === '' &&
              map.OpCount >=
                normalizeCount(
                  expectedPermissions?.LockupLimitMap?.[Number(path[1])]
                    ?.OpCount
                )
            );
          })
        ) {
          return;
        }
        break;
    }

    const actualVal = getDeepValue(actualPermissions, path);

    if (
      typeof actualVal === 'undefined' ||
      (typeof actualVal === 'number' &&
        actualVal < normalizeCount(expectedVal)) ||
      (typeof actualVal === 'string' && actualVal !== expectedVal)
    ) {
      hasAllPermissions = false;
    }
  });

  return hasAllPermissions;
}

export function buildTransactionSpendingLimitResponse(
  spendingLimitOptions: Partial<TransactionSpendingLimitResponseOptions>
): TransactionSpendingLimitResponse {
  if (spendingLimitOptions.IsUnlimited) {
    return {
      IsUnlimited: true,
    };
  }

  if (spendingLimitOptions.GlobalDESOLimit?.toString() === 'UNLIMITED') {
    throw new Error(
      'GlobalDESOLimit cannot be unlimited. You must specify a specific limit, or set the IsUnlimited flag to true.'
    );
  }

  const result: TransactionSpendingLimitResponse = {};

  walkObj(
    spendingLimitOptions,
    (val, path) => {
      setDeepValue(result, path, val === 'UNLIMITED' ? 1e9 : val);
    },
    []
  );

  if (result.StakeLimitMap) {
    result.StakeLimitMap = Object.values(result.StakeLimitMap);
  }

  if (result.UnstakeLimitMap) {
    result.UnstakeLimitMap = Object.values(result.UnstakeLimitMap);
  }

  if (result.UnlockStakeLimitMap) {
    result.UnlockStakeLimitMap = Object.values(result.UnlockStakeLimitMap);
  }

  if (result.AccessGroupLimitMap) {
    result.AccessGroupLimitMap = Object.values(result.AccessGroupLimitMap);
  }

  if (result.AccessGroupMemberLimitMap) {
    result.AccessGroupMemberLimitMap = Object.values(
      result.AccessGroupMemberLimitMap
    );
  }
  if (result.AssociationLimitMap) {
    result.AssociationLimitMap = Object.values(result.AssociationLimitMap);
    // Validate each association limit object
    result.AssociationLimitMap.forEach((associationLimitItem) => {
      if (
        associationLimitItem.AppPublicKeyBase58Check &&
        associationLimitItem.AppScopeType === 'Any'
      ) {
        throw new Error(
          `AppPublicKeyBase58Check must be set to undefined or an empty string if AppScopeType is Any. You provided ${associationLimitItem.AppPublicKeyBase58Check}`
        );
      }
      if (
        !/^(?:BC1|tBC).+/.test(associationLimitItem.AppPublicKeyBase58Check) &&
        associationLimitItem.AppScopeType === 'Scoped'
      ) {
        throw new Error(
          `AppPublicKeyBase58Check must be set to a valid public key if AppScopeType is Scoped. You provided: ${associationLimitItem.AppPublicKeyBase58Check}`
        );
      }
    });
  }
  // TODO: support for new PoS Spending limits maps.

  result.TransactionCountLimitMap = result.TransactionCountLimitMap ?? {};

  if (
    typeof result.TransactionCountLimitMap['AUTHORIZE_DERIVED_KEY'] ===
    'undefined'
  ) {
    result.TransactionCountLimitMap = {
      ...result.TransactionCountLimitMap,
      AUTHORIZE_DERIVED_KEY: 1,
    };
  } else if (result.TransactionCountLimitMap['AUTHORIZE_DERIVED_KEY'] < 0) {
    delete result.TransactionCountLimitMap['AUTHORIZE_DERIVED_KEY'];
  }

  return result;
}

function walkObj(
  node: any,
  callback: (val: any, path: string[]) => void,
  path: string[] = []
) {
  if (typeof node === 'object' && node !== null) {
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i++) {
      walkObj(node[keys[i]], callback, path.concat(keys[i]));
    }
  } else {
    callback(node, path);
  }
}

function getDeepValue(obj: any, path: string[]): any {
  const currKey = path[0];

  if (
    obj === null ||
    typeof obj !== 'object' ||
    typeof obj[currKey] === 'undefined'
  ) {
    return;
  }

  if (path.length === 1) {
    return obj[currKey];
  } else {
    return getDeepValue(obj[currKey], path.slice(1));
  }
}

function setDeepValue(obj: any, path: string[], value: any) {
  const currKey = path[0];
  if (typeof obj[currKey] === 'undefined') {
    obj[currKey] = {};
  }

  if (path.length === 1) {
    obj[currKey] = value;
  } else {
    setDeepValue(obj[currKey], path.slice(1), value);
  }
}

function normalizeCount(count?: number | 'UNLIMITED') {
  // NOTE: If checking for unlimited, we just check if it's greater than 1
  // because there is no good way to know if the original value was 'UNLIMITED'
  // or some other numeric.  As long as the value is greater than 1, we just let
  // it pass as 'UNLIMITED.' In the end this shouldn't matter since we fail the
  // check if there are no more transactions left to spend.
  return count === 'UNLIMITED' || count === 1e9 ? 1 : count ?? 0;
}
