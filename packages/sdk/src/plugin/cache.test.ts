import { test, expect, vi } from "vitest";
import { withCache } from "./cache.js";
import { openLix } from "@lix-js/sdk";

test("it should be network-first", async () => {
	const mockLoader = vi
		.fn()
		.mockResolvedValueOnce("module content 1")
		.mockResolvedValueOnce("module content 2");

	const mockModulePath = "https://mock.com/module.js";

	const lix = await openLix();

	const result1 = await withCache(mockLoader, lix)(mockModulePath);

	expect(mockLoader).toHaveBeenCalledTimes(1);
	expect(result1).toBe("module content 1");

	const cachedPlugins = (
		await lix.execute(
			"SELECT content FROM lix_file WHERE path LIKE '/cache/plugins/%'"
		)
	).rows;

	expect(cachedPlugins.length).toBe(1);

	const parsed = new TextDecoder().decode(
		cachedPlugins[0]!.value("content").asBytes()
	);

	expect(parsed).toBe("module content 1");

	const result2 = await withCache(mockLoader, lix)(mockModulePath);

	expect(mockLoader).toHaveBeenCalledTimes(2);
	expect(result2).toBe("module content 2");

	const cachedPlugins2 = (
		await lix.execute(
			"SELECT content FROM lix_file WHERE path LIKE '/cache/plugins/%'"
		)
	).rows;

	expect(cachedPlugins2.length).toBe(1);

	const parsed2 = new TextDecoder().decode(
		cachedPlugins2[0]!.value("content").asBytes()
	);

	expect(parsed2).toBe("module content 2");
});

test("it should throw the error from the loader if the cache does not exist", async () => {
	const mockLoader = vi.fn().mockRejectedValueOnce(new Error("Network error"));

	const mockModulePath = "https://mock.com/module.js";

	const lix = await openLix();

	await expect(
		async () => await withCache(mockLoader, lix)(mockModulePath)
	).rejects.toThrowError("Network error");
});

test("it should fallback to the cache if the loader fails", async () => {
	const mockLoader = vi.fn().mockRejectedValueOnce(new Error("Network error"));

	const mockModulePath = "https://mock.com/module.js";
	const mockModuleCachePath = "/cache/plugins/31i1etp0l413h";

	const lix = await openLix();

	await lix.execute("INSERT INTO lix_file (path, content) VALUES ($1, $2)", [
		mockModuleCachePath,
		new TextEncoder().encode("cached module content"),
	]);

	const result = await withCache(mockLoader, lix)(mockModulePath);
	expect(result).toBe("cached module content");
});
