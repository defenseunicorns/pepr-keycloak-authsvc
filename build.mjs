/* eslint-disable no-undef */

import { analyzeMetafile, build } from "esbuild";

async function builder() {
  try {
    // Build the CLI
    const cli = await build({
      bundle: true,
      entryPoints: ["capabilities/index.ts"],
      format: "cjs",
      legalComments: "eof",
      metafile: true,
      outfile: "dist/index.js",
      packages: "external",
      platform: "node",
    });

    console.log(await analyzeMetafile(cli.metafile));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

builder();
