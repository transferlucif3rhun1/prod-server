import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";

export default [
  // Apply to all files
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    languageOptions: {
      globals: globals.browser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  
  // JavaScript base configuration
  js.configs.recommended,
  
  // TypeScript configuration
  ...tseslint.configs.recommended,
  
  // React configuration
  {
    ...pluginReact.configs.flat.recommended,
    settings: {
      react: {
        version: "detect", // Auto-detect React version
      },
    },
    rules: {
      // Disable prop-types since we use TypeScript
      "react/prop-types": "off",
      
      // Not needed with React 17+
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      
      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  
  // Ignore patterns
  {
    ignores: ["dist/**", "build/**", "node_modules/**"],
  },
];