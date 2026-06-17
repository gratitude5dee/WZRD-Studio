import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { postzQueryKeys, postzService } from "@/services/postzService";
import type { PostzGroup, PostzPost, PostzPostGroupCreateInput, PostzChannel, PostzPerChannelValidation } from "@/types/postz";

export const POSTZ_QUERY_KEYS = {
  all: ["postz"] as const,
  channels: () => postzQueryKeys.channels,
  postWindows: () => ["postz", "posts", "window"] as const,
  window: (from: string, to: string) => postzQueryKeys.postsWindow(from, to),
  groups: () => ["postz", "posts", "group"] as const,
  group: (groupId: string) => postzQueryKeys.postGroup(groupId),
};

export function usePostzChannels() {
  return useQuery({
    queryKey: POSTZ_QUERY_KEYS.channels(),
    queryFn: () => postzService.listChannels(),
    staleTime: 10_000,
  });
}

export function useSeedPostzChannels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => postzService.seedChannels(),
    onSuccess: (channels: PostzChannel[]) => {
      queryClient.setQueryData(POSTZ_QUERY_KEYS.channels(), channels);
      toast.success("Demo channels created");
    },
    onError: (error: Error) => {
      toast.error("Unable to seed channels", { description: error.message });
    },
  });
}

export function usePostzPostsWindow(input: { from: string; to: string; state?: string | null }) {
  return useQuery({
    queryKey: POSTZ_QUERY_KEYS.window(input.from, input.to),
    queryFn: () => postzService.listPostsWindow({ from: input.from, to: input.to, state: input.state ?? null }),
    staleTime: 5_000,
  });
}

export function usePostzGroup(groupId: string | null) {
  return useQuery({
    queryKey: groupId ? POSTZ_QUERY_KEYS.group(groupId) : POSTZ_QUERY_KEYS.groups(),
    queryFn: () => {
      if (!groupId) throw new Error("groupId is required");
      return postzService.getGroup({ group_id: groupId });
    },
    enabled: Boolean(groupId),
  });
}

export function useCreatePostzGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (group: PostzPostGroupCreateInput) => postzService.createGroup({ group }),
    onSuccess: (group: PostzGroup) => {
      toast.success("Post saved");
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.postWindows() });
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.groups() });
      queryClient.setQueryData(POSTZ_QUERY_KEYS.group(group.group_id), group);
    },
    onError: (error: Error) => {
      toast.error("Unable to save post", { description: error.message });
    },
  });
}

export function useUpdatePostzGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { group_id: string; group: PostzPostGroupCreateInput }) => postzService.updateGroup(input),
    onSuccess: (group: PostzGroup) => {
      toast.success("Post updated");
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.postWindows() });
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.groups() });
      queryClient.setQueryData(POSTZ_QUERY_KEYS.group(group.group_id), group);
    },
    onError: (error: Error) => {
      toast.error("Unable to update post", { description: error.message });
    },
  });
}

export function useReschedulePostzGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { group_id: string; publish_date: string }) => postzService.updateGroupDate(input),
    onSuccess: () => {
      toast.success("Rescheduled");
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.postWindows() });
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.groups() });
    },
    onError: (error: Error) => {
      toast.error("Unable to reschedule", { description: error.message });
    },
  });
}

export function useDeletePostzGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: string) => postzService.deleteGroup({ group_id: groupId }),
    onSuccess: () => {
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.postWindows() });
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.groups() });
    },
    onError: (error: Error) => {
      toast.error("Unable to delete", { description: error.message });
    },
  });
}

export function useValidatePostzGroup() {
  return useMutation({
    mutationFn: (group: PostzPostGroupCreateInput) => postzService.validateGroup({ group }),
  });
}

export function useFindPostzSlot() {
  return useMutation({
    mutationFn: (channelId: string | null) => postzService.findSlot({ channel_id: channelId }),
    onError: (error: Error) => {
      toast.error("Unable to find recommended slot", { description: error.message });
    },
  });
}
