import { useMutation } from '@tanstack/react-query';

import { spawnSandbox, type ResourceClass, type SpawnResponse } from '../api/sandbox-client';

interface Vars {
  qcutAuthToken: string;
  resource_class?: ResourceClass;
}

export function useSpawnSandbox() {
  return useMutation<SpawnResponse, Error, Vars>({
    mutationFn: ({ qcutAuthToken, resource_class }) => spawnSandbox(qcutAuthToken, resource_class),
  });
}
