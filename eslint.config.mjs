import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Supabase CLI scratch space. `supabase start` writes generated runtime
      // files here (start-secrets/ alone accounted for 154 of 182 lint errors).
      // It is gitignored via supabase/.gitignore, but ESLint's flat config does
      // not read nested .gitignore files.
      "supabase/.temp/**",
      "supabase/.branches/**",
      // Migration baselines are dumped SQL, not TypeScript, but keep the whole
      // directory out so a future .sql-adjacent tool cannot trip the linter.
      "supabase/migrations/**",
      // Test and coverage output.
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    rules: {
      // Pre-existing debt, deliberately not a build failure.
      //
      // `next/typescript` has always flagged these, but next.config.ts sets
      // `eslint.ignoreDuringBuilds: true` and nothing ran `npm run lint`, so
      // the 23 existing `any` sites were never surfaced. Turning the CI lint
      // gate on made all of them errors at once, across 20 files that the
      // change introducing the gate never touched.
      //
      // Failing the build on them would have forced an unrelated 20-file
      // refactor into an unrelated PR. Warning keeps them visible on every
      // lint run — and every other rule newly enforced — without that.
      //
      // Pay this down separately, then raise it back to "error".
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default eslintConfig;
