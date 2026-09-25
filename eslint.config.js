import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';
import {readdirSync} from 'node:fs';

const features = readdirSync('src/features', {withFileTypes: true})
  .filter(d => d.isDirectory() && d.name !== 'shared')
  .map(d => d.name);
const heavy = '^(recharts|d3-|victory|@codemirror/|@lezer/|codemirror)';
const kit = 'belongs to src/ui; use or extend the kit component.';
// G4, G7 and G5 share no-restricted-syntax, so their selectors live in one list; the kit keeps the last two.
const outsideUi = [
  {selector: 'JSXOpeningElement[name.name=/^(button|select|input|textarea)$/]', message: `A native control ${kit}`},
  {
    selector: 'JSXAttribute[name.name="className"] > Literal[value=/(^|\\s)(rp-(card|empty|alert|btn)|quiet|sm)(\\s|$)/]',
    message: `This kit class ${kit}`
  },
  {selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|oklch)\\(/]', message: 'Colours come from tokens.'},
  {selector: `ImportExpression[source.value=/${heavy.replaceAll('/', '\\/')}/]`, message: 'Chart and editor libraries live in src/ui/charts and src/ui/code.'}
];

export default [
  {
    ignores: ['dist/**', 'contract/**', 'src/api/types.ts', 'src/fonts.css', 'src/fonts-sc.css', 'node_modules/**', 'test-results/**']
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {ignoreRestSiblings: true, argsIgnorePattern: '^_'}]
    }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {globals: globals.browser}
  },
  {
    files: ['tools/*.mjs', '*.config.{ts,js}', 'e2e/**/*.ts'],
    languageOptions: {globals: globals.node}
  },
  {
    ...reactHooks.configs.flat.recommended,
    files: ['src/**/*.{ts,tsx}']
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    files: ['src/**/*.tsx']
  },
  {
    // G1 layers and G2 cycles. Dynamic imports are left out of cycles: the lazy page loaders in registry.ts close them all.
    files: ['src/**/*.{ts,tsx}'],
    plugins: {'import-x': importX},
    settings: {
      'import-x/resolver-next': [importX.createNodeResolver({extensions: ['.ts', '.tsx', '.js']})],
      'import-x/extensions': ['.ts', '.tsx', '.js']
    },
    rules: {
      'import-x/no-cycle': ['error', {ignoreExternal: true, allowUnsafeDynamicCyclicDependency: true}],
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {target: './src/ui', from: ['./src/features', './src/store', './src/shell'], message: 'src/ui takes data as props.'},
            {target: './src/store', from: ['./src/features', './src/shell', './src/ui']},
            {target: ['./src/api', './src/dae', './src/i18n'], from: ['./src/features', './src/shell', './src/store', './src/ui']},
            ...features.map(f => ({
              target: `./src/features/${f}`,
              from: './src/features',
              except: [`./${f}`, './shared'],
              message: 'Share through src/features/shared or a lower layer.'
            })),
            {
              target: './src/shell',
              from: './src/features',
              except: ['./shared', ...features.map(f => `./${f}/nav.ts`)],
              message: 'The shell reaches pages through registry.ts and navigation through features/*/nav.ts.'
            }
          ]
        }
      ]
    }
  },
  // The lazy page loaders are the shell's one way into the pages.
  {files: ['src/shell/registry.ts'], rules: {'import-x/no-restricted-paths': 'off'}},
  {
    // G3 raw React Aria, G4 native controls and kit classes, G5 heavy libraries, G7 colour literals
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-aria-components',
              allowTypeImports: true,
              allowImportNames: ['useFilter', 'useDragAndDrop', 'isTextDropItem', 'I18nProvider', 'RouterProvider'],
              message: `A React Aria component ${kit}`
            },
            {name: 'react-aria', allowTypeImports: true, allowImportNames: ['VisuallyHidden'], message: `A React Aria primitive ${kit}`}
          ],
          patterns: [
            {group: ['react-aria/private/**'], message: 'Private React Aria paths break on upgrade.'},
            {regex: heavy, message: 'Chart and editor libraries live in src/ui/charts and src/ui/code.'}
          ]
        }
      ],
      'no-restricted-syntax': ['error', ...outsideUi]
    }
  },
  {
    // Inside the kit, colour literals and heavy libraries stay in their homes.
    files: ['src/ui/**/*.{ts,tsx}'],
    ignores: ['src/ui/charts/**', 'src/ui/code/**', 'src/**/*.test.*'],
    rules: {'no-restricted-syntax': ['error', ...outsideUi.slice(2)]}
  },
  {
    // Single-consumer collection compositions; one moves into src/ui when a second consumer appears.
    files: [
      'src/features/policies/arrange/Arrange.tsx',
      'src/features/rules/flows/Tree.tsx',
      'src/features/activity/{NodeMenu,NodeSearch}.tsx',
      'src/shell/search/SearchDialog.tsx'
    ],
    rules: {'@typescript-eslint/no-restricted-imports': 'off'}
  },
  {
    // Raw compositions whose kit move would change the page, so they wait on a design call.
    files: [
      'src/features/activity/ModeSwitch.tsx', // a kit ContextualHelp would be a new trigger and popover
      'src/features/policies/Nodes.tsx' // a kit TileGrid would change the grid's keyboard interaction
    ],
    rules: {'@typescript-eslint/no-restricted-imports': 'off'}
  },
  prettier
];
