import { useSyncExternalStore } from 'react';

export function usePlatformStore(controller) {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
}
