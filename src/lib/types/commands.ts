export interface Command {
	data: any;
	execute: (...args: any[]) => any;
}
