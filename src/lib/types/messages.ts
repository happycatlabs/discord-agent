export interface StoredMessage {
	id: string;
	content: string;
	server: string;
	channel: string;
	createdAt: Date;
	author: any;
	attachments?: {
		name: string;
		url: string;
	}[];
}
