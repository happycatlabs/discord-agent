import { describe, expect, test } from "bun:test";
import { toImageOutput, toNewsOutput } from "../search";

describe("search tool output", () => {
	test("news results use the shared result shape", () => {
		expect(
			toNewsOutput([
				{ title: "T", url: "https://www.example.com/a", description: "D", age: "2 hours ago" },
				{ title: "no url" },
			]),
		).toEqual({
			success: true,
			results: [
				{
					title: "T",
					url: "https://www.example.com/a",
					description: "D",
					source: "example.com",
					sourceKind: "news",
					provider: "brave_news",
					publishDate: "2 hours ago",
				},
			],
		});
	});

	test("image results use the shared result shape", () => {
		const out = toImageOutput([
			{ title: "Cat", url: "https://img.test/cat.png", source: "cats.test" },
		]);
		expect(out).toEqual({
			success: true,
			results: [
				{
					title: "Cat",
					url: "https://img.test/cat.png",
					source: "cats.test",
					sourceKind: "image",
					provider: "brave_images",
				},
			],
		});
	});

	test("provider errors pass through as failures", () => {
		expect(toNewsOutput({ success: false, error: "nope" })).toEqual({
			success: false,
			error: "nope",
		});
		expect(toImageOutput({ success: false, error: "nope" })).toEqual({
			success: false,
			error: "nope",
		});
	});

	test("an empty result is a success with no results, not an error", () => {
		expect(toNewsOutput([])).toEqual({ success: true, results: [] });
	});
});
