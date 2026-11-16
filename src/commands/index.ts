import { FEATURE_BETTING, FEATURE_CASINO, FEATURE_LEVELING } from "../lib/constants/flags";
import type { Command } from "../lib/types/commands";
import { bettingAdmin } from "./admin/betting";
import { serverConfig } from "./admin/config";
import { economyAdmin } from "./admin/economy";
import { levelsAdmin } from "./admin/levels";
import { bet } from "./betting/bet";
import { bets } from "./betting/bets";
import { lines } from "./betting/lines";
import { odds } from "./betting/odds";
import { balance } from "./economy/balance";
import { blackjack } from "./economy/blackjack";
import { coinflip } from "./economy/coinflip";
import { daily } from "./economy/daily";
import { leaderboard } from "./economy/leaderboard";
import { level } from "./economy/level";
import { profile } from "./economy/profile";
import { slots } from "./economy/slots";
import img from "./img";
import { knowledge } from "./knowledge/scan";
import { deployCommands } from "./utility/bot/deployCommands";
import { ignore } from "./utility/bot/ignore";
import { resumeLogging } from "./utility/bot/resume";
import { initBotInServer } from "./utility/database/init";
import { purge } from "./utility/message/purge";
import { reactionRoles } from "./utility/server/reactionRoles";
import { setLogChannel } from "./utility/server/setLogChannel";
import { avatar } from "./utility/user/avatar";
import { banner } from "./utility/user/banner";

export const commands: Command[] = [
	avatar,
	banner,
	// server,
	// user,
	// clearDatabase,
	// poll,
	purge,
	deployCommands,
	initBotInServer,
	setLogChannel,
	ignore,
	resumeLogging,
	img,
	knowledge,
	reactionRoles,
	// Economy
	...(FEATURE_LEVELING ? [balance, level, profile, leaderboard, daily] : []),
	// Gambling
	...(FEATURE_CASINO ? [coinflip, slots, blackjack] : []),
	// Betting
	...(FEATURE_BETTING ? [bet, bets, lines, odds] : []),
	// Admin
	serverConfig,
	economyAdmin,
	...(FEATURE_LEVELING ? [levelsAdmin] : []),
	...(FEATURE_BETTING ? [bettingAdmin] : []),
];
