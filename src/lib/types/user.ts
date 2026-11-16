export type User = {
	tag: string;
	id: string;
	databaseID?: string;
	username: string;
	displayName: string;
	globalName: string;
	discriminator: string;
	avatar: string;
	isBot: boolean;
	createdAt: string;
	servers?: string[];
};
