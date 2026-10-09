export const ENV_VARIABLES: {
  PUBLIC_POSTHOG_TOKEN?: string;
  IS_PRODUCTION: string;
} =
  // @ts-expect-error - the env variables are set in the build step
  ENV_DEFINED_IN_BUILD_STEP;
