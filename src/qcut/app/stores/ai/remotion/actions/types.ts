import type { RemotionStore } from "@qcut-app/lib/remotion/types";

export type SetFn = (
	partial:
		| Partial<RemotionStore>
		| ((state: RemotionStore) => Partial<RemotionStore>)
) => void;
export type GetFn = () => RemotionStore;
