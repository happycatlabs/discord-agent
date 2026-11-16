// Pure logic helpers for weekly resolution decisions.

export type WinningDirection = "over" | "under" | "push";

export const getWinningDirection = ({
	actualValue,
	lineValue,
}: {
	actualValue: number;
	lineValue: number;
}): WinningDirection => {
	if (actualValue > lineValue) return "over";
	if (actualValue < lineValue) return "under";
	return "push";
};

export const shouldSeedWeekResolution = ({
	historyCount,
	unresolvedCount,
}: {
	historyCount: number;
	unresolvedCount: number;
}): boolean => {
	return historyCount > 0 && unresolvedCount === 0;
};
