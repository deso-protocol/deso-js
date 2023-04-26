import type { Config } from "jest";

const config: Config = {
  transform: {
    "^.+\\.[tj]sx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
  moduleFileExtensions: ["ts", "js", "html"],
  setupFilesAfterEnv: ["<rootDir>/src/setup-jest.ts"],
  testEnvironment: "jsdom",
};

export default config;
