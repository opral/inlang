import { BundleNested } from "@inlang/sdk";
export const demoBundles: BundleNested[] = [
	{
		id: "even_hour_mule_drum",
		declarations: [
			{
				type: "input-variable",
				name: "numTodos",
			},
		],
		messages: [
			{
				id: "c2684c3d-3e14-47e4-96b7-8d33579bb7e9",
				bundle_id: "even_hour_mule_drum",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "6a860f96-0cf3-477c-80ad-7893d8fde852",
						message_id: "c2684c3d-3e14-47e4-96b7-8d33579bb7e9",
						matches: [],
						pattern: [
							{
								type: "text",
								value: "My Awesome Todo App",
							},
						],
					},
				],
			},
			{
				id: "31223268-c026-4345-a876-7131bbee6b7b",
				bundle_id: "even_hour_mule_drum",
				locale: "de",
				selectors: [],
				variants: [
					{
						id: "17cf9bc2-1a3c-4494-beae-e42dbcaac763",
						message_id: "31223268-c026-4345-a876-7131bbee6b7b",
						matches: [],
						pattern: [
							{
								type: "text",
								value: "Meine tolle Todo App",
							},
						],
					},
				],
			},
		],
	},
	{
		id: "knotty_next_opossum_link",
		declarations: [
			{
				type: "input-variable",
				name: "numTodos",
			},
		],
		messages: [
			{
				id: "9ea0640c-ebf7-4672-a0a6-f0eeed5c1f1a",
				bundle_id: "knotty_next_opossum_link",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "bec40dd6-85c3-4ad2-b226-027f8afac9f4",
						message_id: "9ea0640c-ebf7-4672-a0a6-f0eeed5c1f1a",
						matches: [],
						pattern: [
							{
								type: "text",
								value:
									"This is a simple todo app that showcases Inlang in a real world application.",
							},
						],
					},
				],
			},
		],
	},
	{
		id: "trite_lime_tapir_surge",
		declarations: [
			{
				type: "input-variable",
				name: "numTodos",
			},
		],
		messages: [
			{
				id: "c7d17bd4-a379-4649-802c-b875ffc0e3ca",
				bundle_id: "trite_lime_tapir_surge",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "5bb02876-8eaa-4454-88fa-e19008785ea3",
						message_id: "c7d17bd4-a379-4649-802c-b875ffc0e3ca",
						matches: [],
						pattern: [
							{
								type: "text",
								value: "Today {{date}}",
							},
						],
					},
				],
			},
			{
				id: "4c8c6915-a3a4-450e-93a4-ee049c553968",
				bundle_id: "trite_lime_tapir_surge",
				locale: "de",
				selectors: [],
				variants: [
					{
						id: "543110f3-25da-421c-9da5-fc814a61f41e",
						message_id: "4c8c6915-a3a4-450e-93a4-ee049c553968",
						matches: [],
						pattern: [
							{
								type: "text",
								value: "Heute, {{date}}",
							},
						],
					},
				],
			},
		],
	},
	{
		id: "sour_caring_kitten_lend",
		declarations: [
			{
				type: "input-variable",
				name: "numTodos",
			},
		],
		messages: [
			{
				id: "ddf9be5e-9dcb-4829-afb8-e9d12c64295c",
				bundle_id: "sour_caring_kitten_lend",
				locale: "en",
				selectors: [
					{
						type: "variable-reference",
						name: "numTodos",
					},
				],
				variants: [
					{
						message_id: "ddf9be5e-9dcb-4829-afb8-e9d12c64295c",
						id: "1458e8e3-c2e2-409c-949c-b4b214f4d094",
						matches: [
							{
								type: "literal-match",
								key: "numTodos",
								value: "one",
							},
						],
						pattern: [
							{
								type: "expression",
								arg: {
									type: "variable-reference",
									name: "numTodos",
								},
							},
							{
								type: "text",
								value: " task",
							},
						],
					},
					{
						message_id: "ddf9be5e-9dcb-4829-afb8-e9d12c64295c",
						id: "f0890476-ef1d-460f-8b17-bff2613c3fcb",
						matches: [
							{
								type: "literal-match",
								key: "numTodos",
								value: "other",
							},
						],
						pattern: [
							{
								type: "expression",
								arg: {
									type: "variable-reference",
									name: "numTodos",
								},
							},
							{
								type: "text",
								value: " tasks",
							},
						],
					},
				],
			},
			{
				id: "9802b8fe-70fb-4689-9ac6-7de0c9f3e01a",
				bundle_id: "sour_caring_kitten_lend",
				locale: "de",
				selectors: [
					{
						type: "variable-reference",
						name: "numTodos",
					},
				],
				variants: [
					{
						message_id: "9802b8fe-70fb-4689-9ac6-7de0c9f3e01a",
						id: "fc8c80af-0e34-47bf-bf49-7540bfa67531",
						matches: [
							{
								type: "literal-match",
								key: "numTodos",
								value: "one",
							},
						],
						pattern: [
							{
								type: "text",
								value: "Eine Aufgabe",
							},
						],
					},
					{
						message_id: "9802b8fe-70fb-4689-9ac6-7de0c9f3e01a",
						id: "a63a9762-a86d-4c50-9cef-2dd1e91da424",
						matches: [
							{
								type: "literal-match",
								key: "numTodos",
								value: "other",
							},
						],
						pattern: [
							{
								type: "expression",
								arg: {
									type: "variable-reference",
									name: "numTodos",
								},
							},
							{
								type: "text",
								value: " Aufgaben",
							},
						],
					},
				],
			},
		],
	},
	{
		id: "born_mean_beetle_pull",
		declarations: [
			{
				type: "input-variable",
				name: "numTodos",
			},
		],
		messages: [
			{
				id: "c6bfd5d0-035b-4917-853a-a3545ff6b309",
				bundle_id: "born_mean_beetle_pull",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "65374620-8677-429a-8bc3-67bd5b3d4fc6",
						message_id: "c6bfd5d0-035b-4917-853a-a3545ff6b309",
						matches: [],
						pattern: [
							{
								type: "text",
								value: "Mark as done",
							},
						],
					},
				],
			},
			{
				id: "45ef2505-2888-45f5-83bb-1dc25fe8c328",
				bundle_id: "born_mean_beetle_pull",
				locale: "de",
				selectors: [],
				variants: [
					{
						id: "a4f46c99-040b-4262-937c-671c1712558c",
						message_id: "45ef2505-2888-45f5-83bb-1dc25fe8c328",
						matches: [],
						pattern: [
							{
								type: "text",
								value: "Als erledigt markiert",
							},
						],
					},
				],
			},
		],
	},
	{
		id: "sound_aqua_tern_exhale",
		declarations: [
			{
				type: "input-variable",
				name: "numTodos",
			},
		],
		messages: [
			{
				id: "b9437d65-9b2e-4a36-b2c4-cb78c43e0fc6",
				bundle_id: "sound_aqua_tern_exhale",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "2a878a9a-79e2-45c0-917d-5739d0ff432c",
						message_id: "b9437d65-9b2e-4a36-b2c4-cb78c43e0fc6",
						matches: [],
						pattern: [
							{
								type: "text",
								value: "Mark as incomplete",
							},
						],
					},
				],
			},
			{
				id: "d56d332d-b171-445b-a176-03059e43ef0c",
				bundle_id: "sound_aqua_tern_exhale",
				locale: "de",
				selectors: [],
				variants: [
					{
						id: "58946078-e0d8-413a-a6a5-ad8cbed7ab3e",
						message_id: "d56d332d-b171-445b-a176-03059e43ef0c",
						matches: [],
						pattern: [
							{
								type: "text",
								value: "Als unvollständig Aldwin",
							},
						],
					},
				],
			},
		],
	},
	{
		id: "lime_minor_emu_exhale",
		declarations: [
			{
				type: "input-variable",
				name: "numTodos",
			},
		],
		messages: [
			{
				id: "c3770a58-96fe-459b-a2be-036c2372ed14",
				bundle_id: "lime_minor_emu_exhale",
				locale: "en",
				selectors: [],
				variants: [
					{
						id: "32b1a201-90ae-4d74-b3dc-b7386e698cf3",
						message_id: "c3770a58-96fe-459b-a2be-036c2372ed14",
						matches: [],
						pattern: [
							{
								type: "text",
								value: "Delete",
							},
						],
					},
				],
			},
			{
				id: "3c379c7f-fc7b-4645-85c6-691005e20206",
				bundle_id: "lime_minor_emu_exhale",
				locale: "de",
				selectors: [],
				variants: [
					{
						id: "1985408c-e157-4f11-aaf3-27531bd53008",
						message_id: "3c379c7f-fc7b-4645-85c6-691005e20206",
						matches: [],
						pattern: [
							{
								type: "text",
								value: "Löschen",
							},
						],
					},
				],
			},
		],
	},
];
