import type { StorybookConfig } from "@storybook/react-vite";
import type { PluginOption } from "vite";

function withoutReactRouterPlugin(
  plugins: PluginOption[] = [],
): PluginOption[] {
  return plugins.flat().filter((plugin) => {
    if (!plugin || typeof plugin !== "object" || !("name" in plugin)) {
      return true;
    }

    return !plugin.name.startsWith("react-router");
  });
}

const config: StorybookConfig = {
  stories: ["../app/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding",
    "@storybook/addon-mcp",
  ],
  framework: "@storybook/react-vite",
  async viteFinal(config) {
    return {
      ...config,
      plugins: withoutReactRouterPlugin(config.plugins),
    };
  },
};
export default config;
