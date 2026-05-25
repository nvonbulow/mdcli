import { chmod, readFile } from "node:fs/promises"
import { build } from "esbuild"

const outputFile = "dist/cli.cjs"

const stripEntryShebang = {
  name: "strip-entry-shebang",
  setup(build) {
    build.onLoad({ filter: /src\/cli\.ts$/ }, async (args) => ({
      contents: (await readFile(args.path, "utf8")).replace(/^#!.*\n/, ""),
      loader: "ts"
    }))
  }
}

await build({
  entryPoints: ["src/cli.ts"],
  outfile: outputFile,
  platform: "node",
  format: "cjs",
  bundle: true,
  target: "node24",
  sourcemap: false,
  minify: false,
  banner: {
    js: "#!/usr/bin/env node"
  },
  plugins: [stripEntryShebang]
})

await chmod(outputFile, 0o755)
