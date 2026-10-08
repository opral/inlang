/* eslint-disable @typescript-eslint/no-explicit-any */
import { Change, isInSimulatedCurrentBranch, VariantRow } from "@inlang/sdk";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { projectAtom } from "../state.ts";
import timeAgo from "../helper/timeAgo.ts";
import { InlangPatternEditor, InlangVariant } from "./SingleDiffBundle.tsx";

const HistoryEntry = ({ commit }: { commit: any }) => {
	const [isOpen, setIsOpen] = useState(false);
	const [project] = useAtom(projectAtom);
	const [changeHistory, setChangeHistory] = useState(
		[] as { current: Change; previous: Change | null }[]
	);

	const getCommitRelatedChanges = async () => {
		const changes = await project?.lix.db
			.selectFrom("change")
			.selectAll()
			.where("commit_id", "=", commit.id)
			.execute();

		if (changes) {
			const history = [];
			for (const change of changes) {
				const previousChange = await project?.lix.db
					.selectFrom("change")
					.selectAll()
					.where("change.type", "=", "variant")
					.where((eb) => eb.ref("value", "->>").key("id"), "=", change.value?.id)
					.where("change.created_at", "<", change.created_at)
					.innerJoin("commit", "commit.id", "change.commit_id")
					// TODO remove after branching concept on lix
					// https://linear.app/opral/issue/LIX-126/branching
					.where(isInSimulatedCurrentBranch)
					.orderBy("commit.created_at", "desc")
					.executeTakeFirst();

				history.push({ current: change, previous: previousChange });
			}
			setChangeHistory(history as { current: Change; previous: Change | null }[]);
		}
	};

	useEffect(() => {
		if (isOpen) {
			getCommitRelatedChanges();
			const interval = setInterval(async () => {
				await getCommitRelatedChanges();
			}, 1000);
			return () => clearInterval(interval);
		}
	}, [isOpen]);

	return (
		<div
			className="flex flex-col cursor-pointer group"
			onClick={() => setIsOpen(!isOpen)}
		>
			{/* <pre>{JSON.stringify(changeHistory, null, 2)}</pre> */}
			<div className="flex gap-3 items-center">
				<div className="w-5 h-5 bg-zinc-100 flex items-center justify-center rounded-full ml-4">
					<div className="w-2 h-2 bg-zinc-700 rounded-full"></div>
				</div>
				<div className="flex-1 flex gap-2 items-center justify-between py-3 rounded h-[46px]">
					<div className="flex gap-2 items-center">
						<p className="text-zinc-950 text-sm! font-semibold">By {commit.author}</p>
						<p className="text-sm! text-zinc-600">{commit.description}</p>
					</div>
					<p className="text-sm!">{timeAgo(commit.created_at)}</p>
				</div>
				{isOpen ? (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						className="h-5 w-5 text-zinc-600 mr-4 group-hover:text-[var(--sl-color-primary-500)]"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M5 15l7-7 7 7"
						/>
					</svg>
				) : (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						className="h-5 w-5 text-zinc-600 mr-4 group-hover:text-[var(--sl-color-primary-500)]"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				)}
			</div>
			{isOpen && (
				<div className="p-4">
					{changeHistory
						.filter(({ current }) => current.type === "variant") // only show variant changes
						.map(({ current, previous }, index) => (
							<div key={index}>
								<div className="flex gap-4 items-end px-4 pb-[8px] pb-[16px]">
									<div className="flex-1">
										<p className="text-zinc-500 py-2 px-1">
											<span className="font-semibold">Before</span>
											{` by ${previous?.author}, ${timeAgo(
												// @ts-expect-error - created_at is not nullable
												previous?.created_at
											)}`}
										</p>
										<div className="relative border border-zinc-300 overflow-hidden">
											{previous && previous.value && (
												<InlangVariant
													slot="variant"
													variant={previous.value as VariantRow}
													className="pointer-events-none"
													// @ts-expect-error - noHistory is not a valid prop
													noHistory={true}
												>
													<InlangPatternEditor
														slot="pattern-editor"
														variant={previous.value as VariantRow}
														className={"inlang-pattern-editor-old"}
													></InlangPatternEditor>
												</InlangVariant>
											)}
										</div>
									</div>
									<div className="flex-1">
										<p className="text-zinc-500 py-2 px-1">
											<span className="font-semibold">After</span>
											{` by ${current.author}, ${timeAgo(current.created_at)}`}
										</p>
										<div className="relative border border-zinc-300 overflow-hidden">
											{current && current.value && (
												<InlangVariant
													slot="variant"
													variant={current.value as VariantRow}
													className="pointer-events-none"
													// @ts-expect-error - noHistory is not a valid prop
													noHistory={true}
												>
													<InlangPatternEditor
														slot="pattern-editor"
														variant={current.value as VariantRow}
														className={"inlang-pattern-editor-neu"}
													></InlangPatternEditor>
												</InlangVariant>
											)}
										</div>
									</div>
								</div>
							</div>
						))}
				</div>
			)}
		</div>
	);
};

export default HistoryEntry;
