// eslint.config.mjs
import js from '@eslint/js';
import * as tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: [path.join(__dirname, 'tsconfig.eslint.json')],
        tsconfigRootDir: __dirname
      }
    }
  },
  prettier
);
