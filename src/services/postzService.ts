import { supabase } from "@/integrations/supabase/client";
import {
  type PostzChannel,
  type PostzGroup,
  type PostzPerChannelValidation,
  type PostzPost,
  type PostzPostGroupCreateInput,
} from "@/types/postz";

type InvokeBody =
  | { action: "list"; from: string; to: string; state?: string | null }
  | { action: "get"; id: string }
  | { action: "get-group"; group_id: string }
  | { action: "create"; group: PostzPostGroupCreateInput }
  | { action: "update"; group_id: string; group: PostzPostGroupCreateInput }
  | { action: "update-date"; id?: string; group_id?: string; publish_date: string }
  | { action: "delete"; group_id: string }
  | { action: "duplicate"; group_id: string }
  | { action: "validate"; group: PostzPostGroupCreateInput }
  | { action: "find-slot"; channel_id?: string | null }
  | { action: "post-now"; group_id: string };

async function invokePostzPosts<T>(body: InvokeBody): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke("postz-posts", {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Postz returned an empty response.");
  }

  return data as T;
}

async function invokePostzChannels<T>(body: { action: "list" | "seed" }): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke("postz-channels", {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Postz returned an empty response.");
  }

  return data as T;
}

export const postzQueryKeys = {
  channels: ["postz", "channels"] as const,
  postsWindow: (from: string, to: string) => ["postz", "posts", "window", from, to] as const,
  postGroup: (groupId: string) => ["postz", "posts", "group", groupId] as const,
} as const;

export const postzService = {
  // Channels (Phase 2: seeded + read-only; Phase 3: real OAuth providers)
  async listChannels(): Promise<PostzChannel[]> {
    const res = await invokePostzChannels<{ channels: PostzChannel[] }>({ action: "list" });
    return res.channels;
  },

  async seedChannels(): Promise<PostzChannel[]> {
    const res = await invokePostzChannels<{ channels: PostzChannel[] }>({ action: "seed" });
    return res.channels;
  },

  // Posts
  async listPostsWindow(input: { from: string; to: string; state?: string | null }): Promise<PostzPost[]> {
    const res = await invokePostzPosts<{ posts: PostzPost[] }>({
      action: "list",
      from: input.from,
      to: input.to,
      state: input.state ?? null,
    });
    return res.posts;
  },

  async getPost(input: { id: string }): Promise<PostzPost> {
    const res = await invokePostzPosts<{ post: PostzPost }>({ action: "get", id: input.id });
    return res.post;
  },


  async updateGroup(input: { group_id: string; group: PostzPostGroupCreateInput }): Promise<PostzGroup> {
    return invokePostzPosts<PostzGroup>({ action: "update", group_id: input.group_id, group: input.group });
  },

  async getGroup(input: { group_id: string }): Promise<PostzGroup> {
    const res = await invokePostzPosts<PostzGroup>({ action: "get-group", group_id: input.group_id });
    return res;
  },

  async createGroup(input: { group: PostzPostGroupCreateInput }): Promise<PostzGroup> {
    return invokePostzPosts<PostzGroup>({ action: "create", group: input.group });
  },

  async updateGroupDate(input: { id?: string; group_id?: string; publish_date: string }): Promise<{ success: boolean }> {
    return invokePostzPosts<{ success: boolean }>({
      action: "update-date",
      id: input.id,
      group_id: input.group_id,
      publish_date: input.publish_date,
    });
  },

  async deleteGroup(input: { group_id: string }): Promise<{ success: boolean }> {
    return invokePostzPosts<{ success: boolean }>({ action: "delete", group_id: input.group_id });
  },

  async validateGroup(input: { group: PostzPostGroupCreateInput }): Promise<{ per_channel: PostzPerChannelValidation[] }> {
    return invokePostzPosts<{ per_channel: PostzPerChannelValidation[] }>({ action: "validate", group: input.group });
  },

  async findSlot(input: { channel_id?: string | null }): Promise<{ publish_date: string }> {
    return invokePostzPosts<{ publish_date: string }>({ action: "find-slot", channel_id: input.channel_id ?? null });
  },
};
