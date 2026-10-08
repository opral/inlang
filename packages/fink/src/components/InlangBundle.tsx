/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createComponent } from "@lit/react";

import {
	ChangeEventDetail,
	InlangBundleAction,
	InlangBundle as LitInlangBundle,
} from "@inlang/editor-component";
import { InlangMessage as LitInlangMessage } from "@inlang/editor-component";
import { InlangVariant as LitInlangVariant } from "@inlang/editor-component";
import { InlangPatternEditor as LitInlangPatternEditor } from "@inlang/editor-component";
import { InlangAddSelector as LitInlangAddSelector } from "@inlang/editor-component";

import React, { useState } from "react";
import { useAtom } from "jotai";
import {
	filteredLocalesAtom,
	groupedPendingChangesAtom,
	projectAtom,
	settingsAtom,
} from "../state.ts";
import { BundleNested, MessageRow, ProjectSettings, uuidv4, VariantRow } from "@inlang/sdk";
import {
	SlDialog,
	SlDropdown,
	SlMenu,
	SlMenuItem,
	SlTooltip,
} from "@shoelace-style/shoelace/dist/react";
import clsx from "clsx";
import VariantHistory from "./VariantHistory.tsx";
import { deleteBundleNested } from "../helper/deleteBundleNested.ts";

const ReactInlangBundle = createComponent({
	tagName: "inlang-bundle",
	elementClass: LitInlangBundle,
	react: React,
	events: {
		change: "change",
	},
});

const ReactInlangBundleAction = createComponent({
	tagName: "inlang-bundle-action",
	elementClass: InlangBundleAction,
	react: React,
});

const ReactInlangMessage = createComponent({
	tagName: "inlang-message",
	elementClass: LitInlangMessage,
	react: React,
});

const ReactInlangVariant = createComponent({
	tagName: "inlang-variant",
	elementClass: LitInlangVariant,
	react: React,
});

const ReactInlangPatternEditor = createComponent({
	tagName: "inlang-pattern-editor",
	elementClass: LitInlangPatternEditor,
	react: React,
	events: {
		onPatternEditorFocus: "pattern-editor-focus",
		onPatternEditorBlur: "pattern-editor-blur",
	},
});

const ReactInlangAddSelector = createComponent({
	tagName: "inlang-add-selector",
	elementClass: LitInlangAddSelector,
	react: React,
	events: {
		change: "change",
		onSubmit: "submit",
	},
});

const InlangBundle = (props: {
	bundle: BundleNested;
	setShowHistory: (variantId: string) => void;
}) => {
	const [project] = useAtom(projectAtom);
	const [groupedPendingChanges] = useAtom(groupedPendingChangesAtom);
	const [settings] = useAtom(settingsAtom);
	const [filteredLocales] = useAtom(filteredLocalesAtom);

	const [patternEditorFocused, setPatternEditorFocused] = useState<string | undefined>(
		undefined
	);
	const [patternEditorHovered, setPatternEditorHovered] = useState<string | undefined>(
		undefined
	);

	const handleChangeEvent = (e: Event) => {
		const change = (e as CustomEvent).detail as ChangeEventDetail;
		if (change.newData) {
			project?.db
				.insertInto(change.entity)
				.values({
					...change.newData,
					// @ts-expect-error - we need to remove the nesting
					messages: undefined,
					variants: undefined,
				})
				.onConflict((oc) =>
					oc.column("id").doUpdateSet({
						...change.newData,
						// @ts-expect-error - we need to remove the nesting
						messages: undefined,
						variants: undefined,
					})
				)
				.execute();
		} else {
			project?.db.deleteFrom(change.entity).where("id", "=", change.entityId).execute();
		}
	};

	const visibleLocales = () => {
		if (filteredLocales.length === 0) {
			return settings.locales; // nothing selected -> show all languages
		} else {
			return settings?.locales.filter(
				(locale) => filteredLocales.includes(locale) || locale === settings.baseLocale
			); // show only selected languages + base language
		}
	};

	return (
		<>
			{props.bundle && (
				<div className="relative">
					<ReactInlangBundle bundle={props.bundle} change={handleChangeEvent}>
						<ReactInlangBundleAction
							slot="bundle-action"
							actionTitle="Delete"
							onClick={() => deleteBundleNested(project!.db, props.bundle.id)}
						/>
						{visibleLocales().map((locale: ProjectSettings["locales"][number]) => {
							const message = props.bundle.messages.find(
								(message) => message.locale === locale
							);
							if (message) {
								return (
									<ReactInlangMessage
										slot="message"
										key={message.id}
										message={message}
										variants={message.variants}
										settings={settings}
									>
										{message.variants.map((variant) => {
											const change = groupedPendingChanges.find(
												// eslint-disable-next-line @typescript-eslint/ban-ts-comment
												// @ts-ignore
												(change) => (change.value as VariantRow).id === variant.id
											);

											return (
												<ReactInlangVariant
													slot="variant"
													key={variant.id}
													variant={variant}
													onMouseEnter={() =>
														setTimeout(() => {
															setPatternEditorHovered(variant.id);
														}, 1)
													}
													onMouseLeave={() => setPatternEditorHovered(undefined)}
													className={clsx(
														(variant.id === patternEditorFocused ||
															variant.id === patternEditorHovered) &&
															"relative z-20"
													)}
												>
													<ReactInlangPatternEditor
														slot="pattern-editor"
														variant={variant}
														onPatternEditorFocus={() =>
															setTimeout(() => {
																setPatternEditorFocused(variant.id);
															}, 1)
														}
														onPatternEditorBlur={() => setPatternEditorFocused(undefined)}
													/>
													{(variant.id === patternEditorFocused ||
														variant.id === patternEditorHovered) && (
														<SlTooltip content="Show history" slot="variant-action">
															<div
																className="animate-blendIn px-3 flex items-center h-8 text-[14px]! rounded text-zinc-400 hover:bg-zinc-100 cursor-pointer"
																onClick={() => props.setShowHistory(variant.id)}
															>
																{change ? (
																	<p>By You, draft</p>
																) : (
																	<VariantHistory variantId={variant.id} />
																)}
															</div>
														</SlTooltip>
													)}

													{(variant.id === patternEditorFocused ||
														variant.id === patternEditorHovered) && (
														<SlDropdown
															slot="variant-action"
															className="relative z-10 animate-blendIn"
															distance={4}
														>
															<div
																slot="trigger"
																className="px-2 h-8 border border-zinc-300 bg-white rounded text-zinc-600 flex items-center justify-center hover:bg-zinc-100 hover:border-zinc-400 cursor-pointer"
															>
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	width="20"
																	height="20"
																	viewBox="0 0 24 24"
																	className="-mx-[2px]"
																>
																	<path
																		fill="currentColor"
																		d="M7 12a2 2 0 1 1-4 0a2 2 0 0 1 4 0m7 0a2 2 0 1 1-4 0a2 2 0 0 1 4 0m7 0a2 2 0 1 1-4 0a2 2 0 0 1 4 0"
																	/>
																</svg>
															</div>
															<SlMenu className="border border-zinc-300 rounded-md">
																<SlMenuItem
																	onClick={() => props.setShowHistory(variant.id)}
																>
																	History
																</SlMenuItem>
																{message.variants && message.variants.length > 1 && (
																	<SlMenuItem
																		onClick={() => {
																			project?.db
																				.deleteFrom("inlang_variant")
																				.where("id", "=", variant.id)
																				.execute();
																		}}
																	>
																		Delete
																	</SlMenuItem>
																)}
																<SlMenuItem
																	onClick={() => {
																		const dialog = document.getElementById(
																			`selector-button-dialog-${props.bundle.id}`
																			// @ts-expect-error
																		) as SlDialog;
																		if (dialog) {
																			const child = dialog
																				.children[0] as LitInlangAddSelector;
																			if (child) {
																				child.message = message;
																				child.variants = message.variants;
																			}
																			setTimeout(() => {
																				dialog.show();
																			});
																		}
																	}}
																>
																	Add Selector
																</SlMenuItem>
															</SlMenu>
														</SlDropdown>
													)}

													{change &&
														variant.id !== patternEditorFocused &&
														variant.id !== patternEditorHovered && (
															<div slot="variant-action" className="pl-2">
																<div className="w-2.5 h-2.5 rounded-full bg-blue-400"></div>
															</div>
														)}
												</ReactInlangVariant>
											);
										})}
										<div
											slot="selector-button"
											className="px-2 h-8 mt-[6px] ml-[1px] border border-zinc-300 bg-white rounded text-zinc-600 flex items-center justify-center hover:bg-zinc-100 hover:border-zinc-400 cursor-pointer"
											onClick={() => {
												const dialog = document.getElementById(
													`selector-button-dialog-${props.bundle.id}`
													// @ts-expect-error
												) as SlDialog;
												if (dialog) {
													const child = dialog.children[0] as LitInlangAddSelector;
													if (child) {
														child.message = message;
														child.variants = message.variants;
													}
													setTimeout(() => {
														dialog.show();
													});
												}
											}}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="20"
												height="20"
												viewBox="0 0 24 24"
												className="-mx-[3px]"
											>
												<path
													fill="currentColor"
													d="M19 12.998h-6v6h-2v-6H5v-2h6v-6h2v6h6z"
												/>
											</svg>
										</div>
										;
									</ReactInlangMessage>
								);
							} else {
								const message: MessageRow = {
									id: uuidv4(),
									selectors: [],
									locale,
									bundle_id: props.bundle.id,
								};
								return (
									<ReactInlangMessage
										slot="message"
										message={message}
										settings={settings}
										key={`${props.bundle.id}-${locale}-empty`}
									>
										<p
											className="min-h-[44px] bg-white hover:bg-zinc-50 flex items-center px-2 text-[14px] text-zinc-500 hover:text-zinc-950 gap-[4px] cursor-pointer w-full"
											slot="variant"
											onClick={async () => {
												if (project) {
													await project.db
														.insertInto("inlang_message")
														.values(message)
														.execute();

													await project.db
														.insertInto("inlang_variant")
														.values({
															message_id: message.id!,
														})
														.execute();
												}
											}}
										>
											<svg viewBox="0 0 24 24" width="18" height="18" className="w-5 h-5">
												<path
													fill="currentColor"
													d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2z"
												></path>
											</svg>
											{`Add ${locale}`}
										</p>
									</ReactInlangMessage>
								);
							}
						})}
					</ReactInlangBundle>
					<SlDialog
						id={`selector-button-dialog-${props.bundle.id}`}
						className="add-selector-dialog"
						label="Add selector"
					>
						<ReactInlangAddSelector
							change={handleChangeEvent}
							onSubmit={() => {
								const dialog = document.getElementById(
									`selector-button-dialog-${props.bundle.id}`
									// @ts-expect-error
								) as SlDialog;
								dialog.hide();
							}}
							bundle={props.bundle}
							// message={message}
							// variants={message?.variants}
						/>
					</SlDialog>
				</div>
			)}
		</>
	);
};

export default InlangBundle;
