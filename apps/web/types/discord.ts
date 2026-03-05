export type DiscordUser = {
  id: string;
  username: string;
  avatar: string | null;
};

export type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

export type DiscordGuildChannel = {
  id: string;
  guild_id: string;
  name: string;
  type: number;
  position: number;
};
