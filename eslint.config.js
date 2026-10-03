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
// The shell modules a page may use: links and URL state, the unsaved-draft guard, stored preferences, the install
// offer, and the About and keyboard shortcuts dialogs that Settings opens too. Everything else in the shell is the
// shell's own.
const shellForFeatures = ['./route.ts', './routes.ts', './draft.ts', './preferences.ts', './install.ts', './About.tsx', './shortcuts.ts'];
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
// G8: pages never ask which engine is running; src/api/engines turns engine knowledge into neutral data and reasons.
const engineBlind = 'Engine-specific behaviour belongs in src/api/engines; ask the adapter instead of the engine name.';
const engineRead =
  ":matches(MemberExpression[property.name=/^(name|id)$/][object.property.name=/^(engine|api)$/], MemberExpression[property.name='id'][object.name='engine'])";
const compared = 'BinaryExpression[operator=/^[!=]==?$/]';
const engineChecks = [
  {selector: `${compared} > ${engineRead}, ${compared} > ChainExpression > ${engineRead}`, message: engineBlind},
  {selector: `SwitchStatement > ${engineRead}.discriminant, SwitchStatement > ChainExpression.discriminant > ${engineRead}`, message: engineBlind},
  {selector: `${compared} > Literal[value=/^(honk|dae.honk-native)$/], SwitchCase > Literal.test[value=/^(honk|dae.honk-native)$/]`, message: engineBlind}
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
    files: ['src/**/*.{ts,tsx}', 'mock/**/*.ts'],
    languageOptions: {globals: globals.browser}
  },
  {
    files: ['tools/*.mjs', '*.config.{ts,js}', 'e2e/**/*.ts'],
    languageOptions: {globals: globals.node}
  },
  {
    ...reactHooks.configs.flat.recommended,
    files: ['src/**/*.{ts,tsx}', 'mock/**/*.ts']
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    files: ['src/**/*.tsx']
  },
  {
    // G1 layers and G2 cycles. Dynamic imports are left out of cycles: the lazy page loaders in registry.ts close them all.
    files: ['src/**/*.{ts,tsx}', 'mock/**/*.ts'],
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
            {target: './src/ui', from: ['./src/features', './src/store', './src/shell', './mock'], message: 'src/ui takes data as props.'},
            {
              target: './src/ui',
              from: './src/api',
              except: ['./diagnostics.ts', './error.ts', './model.ts', './serverClock.ts', './types.ts'],
              message: 'src/ui takes data as props; from src/api it may use only the error model, the types and the server clock.'
            },
            {target: './src/store', from: ['./src/features', './src/shell', './src/ui']},
            {target: ['./src/api', './src/dae', './src/i18n', './mock'], from: ['./src/features', './src/shell', './src/store', './src/ui']},
            {
              target: ['./src/dae', './src/features', './src/i18n', './src/shell', './src/store', './src/ui'],
              from: './src/api/engines',
              except: ['./index.ts'],
              message: 'Import the engines adapter through src/api/engines, not its modules.'
            },
            ...features.map(f => ({
              target: `./src/features/${f}`,
              from: './src/features',
              except: [`./${f}`, './shared'],
              message: 'Share through src/features/shared or a lower layer.'
            })),
            {
              target: './src/features',
              from: './src/shell',
              except: shellForFeatures,
              message: 'From src/shell, features use only route, routes, draft, preferences, install, About and shortcuts.'
            },
            {
              target: './src/shell',
              from: './src/features',
              except: ['./shared', ...features.flatMap(f => [`./${f}/nav.ts`, `./${f}/widgets.ts`])],
              message: 'The shell reaches pages through registry.ts, navigation through nav.ts and dashboard modules through widgets.ts.'
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
    files: ['src/**/*.{ts,tsx}', 'mock/**/*.ts'],
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
            {name: 'react-aria', allowTypeImports: true, message: `A React Aria primitive ${kit}`}
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
    // G8 on top of the rules above; tests may name an engine.
    files: ['src/{features,shell,store}/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.*'],
    rules: {'no-restricted-syntax': ['error', ...outsideUi, ...engineChecks]}
  },
  {
    // Inside the kit, colour literals and heavy libraries stay in their homes.
    files: ['src/ui/**/*.{ts,tsx}'],
    ignores: ['src/ui/charts/**', 'src/ui/code/**', 'src/**/*.test.*'],
    rules: {'no-restricted-syntax': ['error', ...outsideUi.slice(2)]}
  },
  {
    // Single-consumer collection compositions; one moves into src/ui when a second consumer appears.
    files: ['src/features/flows/Tree.tsx', 'src/features/policies/NodeGrid.tsx', 'src/shell/search/SearchDialog.tsx'],
    rules: {'@typescript-eslint/no-restricted-imports': 'off'}
  },
  {
    // Routers serve doona over plain HTTP on the LAN, where these exist only in secure contexts.
    files: ['src/**/*.{ts,tsx}', 'mock/**/*.ts'],
    ignores: ['src/api/hash.ts', 'src/**/*.test.*', 'mock/**/*.test.*'],
    rules: {
      'no-restricted-properties': [
        'error',
        {object: 'crypto', property: 'randomUUID', message: 'Use uuid() from src/api/hash.ts.'},
        {object: 'crypto', property: 'subtle', message: 'Use sha256() from src/api/hash.ts.'}
      ]
    }
  },
  prettier
];
