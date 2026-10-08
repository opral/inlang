import { useAtom } from "jotai";
import Layout, { Grid } from "../../layout.tsx";
import {
	bundlesNestedAtom,
	unresolvedConflictsAtom,
	projectAtom,
	conflictingChangesAtom,
} from "../../state.ts";
import { useNavigate } from "react-router-dom";
import timeAgo from "../../helper/timeAgo.ts";
import {
	InlangPatternEditor,
	InlangVariant,
} from "../../components/SingleDiffBundle.tsx";
import { resolveConflictBySelecting, VariantRow } from "@inlang/sdk";
import { useEffect } from "react";

export default function Page() {
	const [project] = useAtom(projectAtom);
	const [unresolvedConflicts] = useAtom(unresolvedConflictsAtom);
	const [bundlesNested] = useAtom(bundlesNestedAtom);
	const [conflictingChanges] = useAtom(conflictingChangesAtom);

	const navigate = useNavigate();

	useEffect(() => {
		// close dialog after commit
		if (unresolvedConflicts.length === 0) {
			navigate("/");
		}
	});

	return (
		<Layout>
			<div className="bg-white border-b border-zinc-200">
				<Grid>
					<div className="py-6 flex justify-between items-center">
						<h2 className="text-[20px]">Conflicts</h2>
					</div>
				</Grid>
			</div>
			<Grid>
				<div className="mt-8 bg-white border-zinc-200 border rounded-lg divide-y divide-zinc-200 py-[4px]">
					{unresolvedConflicts.length > 0 &&
						unresolvedConflicts.map((conflict) => {
							const change = conflictingChanges.find(
								(change) => change.id === conflict.change_id
							)!;
							const conflictingChange = conflictingChanges.find(
								(change) => change.id === conflict.conflicting_change_id
							)!;

							const bundleId = bundlesNested.find((bundle) =>
								bundle.messages.filter((message) =>
									message.variants.find((variant) => variant.id === conflict.change_id)
								)
							)?.id;
							return (
								<div key={conflict.change_id + Math.random()} className="">
									<div className="flex gap-3 items-center">
										<div className="w-5 h-5 flex items-center justify-center rounded-full ml-4">
											<svg
												width="22"
												height="22"
												viewBox="0 0 22 22"
												fill="none"
												xmlns="http://www.w3.org/2000/svg"
											>
												<path
													d="M18.8813 10.0868C18.8447 9.92328 18.7688 9.77118 18.6603 9.64361C18.5517 9.51604 18.4137 9.41683 18.2582 9.35456L13.8599 7.59542L14.77 1.52738C14.8034 1.30948 14.7661 1.08661 14.6636 0.891459C14.5611 0.69631 14.3987 0.53915 14.2003 0.443033C14.0019 0.346916 13.778 0.3169 13.5613 0.357387C13.3446 0.397875 13.1466 0.506735 12.9963 0.668001L3.37127 10.9805C3.25686 11.103 3.17404 11.2516 3.12999 11.4133C3.08594 11.5751 3.08198 11.7451 3.11847 11.9087C3.15495 12.0724 3.23077 12.2246 3.33936 12.3523C3.44795 12.48 3.58603 12.5794 3.74166 12.6417L8.13994 14.4008L7.22986 20.4714C7.19645 20.6893 7.23375 20.9122 7.33628 21.1074C7.43881 21.3025 7.60117 21.4597 7.79956 21.5558C7.99794 21.6519 8.22191 21.6819 8.4386 21.6414C8.6553 21.6009 8.85331 21.4921 9.00361 21.3308L18.6286 11.0183C18.7435 10.8954 18.8266 10.7463 18.8707 10.5839C18.9147 10.4215 18.9183 10.2509 18.8813 10.0868ZM9.76244 17.492L10.3013 13.9024C10.3357 13.6726 10.2915 13.438 10.176 13.2365C10.0604 13.0349 9.88016 12.8784 9.66447 12.7921L5.90728 11.289L12.2374 4.50683L11.6986 8.09644C11.6642 8.32618 11.7083 8.56082 11.8239 8.76234C11.9395 8.96386 12.1197 9.12046 12.3354 9.20675L16.0926 10.7098L9.76244 17.492Z"
													fill="currentColor"
												/>
											</svg>
										</div>
										<div className="flex-1 flex gap-2 items-center justify-between pr-4 py-3 rounded h-[46px]">
											<div className="flex gap-2 items-center">
												<p className="text-zinc-950 text-sm! font-semibold">
													VariantRow changed
												</p>
												<p className="text-sm! text-zinc-600">{`bundle_id: ${bundleId}`}</p>
											</div>
											<p className="text-sm!">{timeAgo(change?.created_at)}</p>
										</div>
									</div>

									{change && conflictingChange && (
										<div className="flex items-end px-4 pb-[8px] pb-[16px]">
											<div className="flex-1">
												<p className="text-zinc-500 py-2 px-1">{`By ${change.author}, ${timeAgo(
													change.created_at
												)}`}</p>
												<div className="relative border border-zinc-300 rounded-lg overflow-hidden">
													<InlangVariant
														variant={change.value as VariantRow}
														className="pointer-events-none conflict-variant"
														// @ts-expect-error - noHistory is not a valid prop
														noHistory={true}
													>
														<InlangPatternEditor
															slot="pattern-editor"
															variant={change.value as VariantRow}
															className={"conflict-pattern"}
														></InlangPatternEditor>
													</InlangVariant>
													<div
														className="absolute top-[50%] -translate-y-[50%] right-2 bg-zinc-700 hover:bg-black cursor-pointer text-zinc-100 rounded-md flex justify-center items-center px-3 h-[30px]"
														onClick={async () => {
															await resolveConflictBySelecting({
																lix: project!.lix,
																conflict,
																selectChangeId: change.id,
															});
														}}
													>
														Keep
													</div>
												</div>
											</div>
											<div className="w-[70px] h-[46px] relative flex items-center justify-center">
												<div className="relative z-1 h-10 w-10 bg-red-100 text-red-600 rounded-full flex justify-center items-center">
													<svg
														width="20"
														height="20"
														viewBox="0 0 22 22"
														fill="none"
														xmlns="http://www.w3.org/2000/svg"
													>
														<path
															d="M18.8813 10.0868C18.8447 9.92328 18.7688 9.77118 18.6603 9.64361C18.5517 9.51604 18.4137 9.41683 18.2582 9.35456L13.8599 7.59542L14.77 1.52738C14.8034 1.30948 14.7661 1.08661 14.6636 0.891459C14.5611 0.69631 14.3987 0.53915 14.2003 0.443033C14.0019 0.346916 13.778 0.3169 13.5613 0.357387C13.3446 0.397875 13.1466 0.506735 12.9963 0.668001L3.37127 10.9805C3.25686 11.103 3.17404 11.2516 3.12999 11.4133C3.08594 11.5751 3.08198 11.7451 3.11847 11.9087C3.15495 12.0724 3.23077 12.2246 3.33936 12.3523C3.44795 12.48 3.58603 12.5794 3.74166 12.6417L8.13994 14.4008L7.22986 20.4714C7.19645 20.6893 7.23375 20.9122 7.33628 21.1074C7.43881 21.3025 7.60117 21.4597 7.79956 21.5558C7.99794 21.6519 8.22191 21.6819 8.4386 21.6414C8.6553 21.6009 8.85331 21.4921 9.00361 21.3308L18.6286 11.0183C18.7435 10.8954 18.8266 10.7463 18.8707 10.5839C18.9147 10.4215 18.9183 10.2509 18.8813 10.0868ZM9.76244 17.492L10.3013 13.9024C10.3357 13.6726 10.2915 13.438 10.176 13.2365C10.0604 13.0349 9.88016 12.8784 9.66447 12.7921L5.90728 11.289L12.2374 4.50683L11.6986 8.09644C11.6642 8.32618 11.7083 8.56082 11.8239 8.76234C11.9395 8.96386 12.1197 9.12046 12.3354 9.20675L16.0926 10.7098L9.76244 17.492Z"
															fill="currentColor"
														/>
													</svg>
												</div>
												<div className="absolute border-t border-dashed border-zinc-400 w-full top-[50%]" />
											</div>
											<div className="flex-1">
												<p className="text-zinc-500 py-2 px-1">{`By ${conflictingChange.author}, ${timeAgo(
													conflictingChange.created_at
												)}`}</p>
												<div className="relative border border-zinc-300 rounded-lg overflow-hidden">
													<InlangVariant
														variant={conflictingChange.value as VariantRow}
														className={"pointer-events-none conflict-variant"}
														// @ts-expect-error - noHistory is not a valid prop
														noHistory={true}
													>
														<InlangPatternEditor
															slot="pattern-editor"
															variant={conflictingChange.value as VariantRow}
															className={"conflict-pattern"}
														></InlangPatternEditor>
													</InlangVariant>
													<div
														className="absolute top-[50%] -translate-y-[50%] right-2 bg-zinc-700 hover:bg-black cursor-pointer text-zinc-100 rounded-md flex justify-center items-center px-3 h-[30px]"
														onClick={async () => {
															await resolveConflictBySelecting({
																lix: project!.lix,
																conflict,
																selectChangeId: conflictingChange.id,
															});
														}}
													>
														Accept
													</div>
												</div>
											</div>
										</div>
									)}
								</div>
							);
						})}
				</div>
			</Grid>
		</Layout>
	);
}
