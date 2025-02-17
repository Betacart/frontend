// Tasks to generate entry HTML

import fs from "fs-extra";
import gulp from "gulp";
import { minify } from "html-minifier-terser";
import template from "lodash.template";
import path from "path";
import {
  htmlMinifierOptions,
  terserOptions,
} from "../../homeassistant-frontend/build-scripts/bundle.cjs";
import env from "./env.cjs";
import paths from "./paths.cjs";

const renderTemplate = (templateFile, data = {}) => {
  const compiled = template(fs.readFileSync(templateFile, { encoding: "utf-8" }));
  return compiled({
    ...data,
    useRollup: env.useRollup(),
    useWDS: env.useWDS(),
    // Resolve any child/nested templates relative to the parent and pass the same data
    renderTemplate: (childTemplate) =>
      renderTemplate(path.resolve(path.dirname(templateFile), childTemplate), data),
  });
};

const WRAP_TAGS = { ".js": "script", ".css": "style" };

const minifyHtml = (content, ext) => {
  const wrapTag = WRAP_TAGS[ext] || "";
  const begTag = wrapTag && `<${wrapTag}>`;
  const endTag = wrapTag && `</${wrapTag}>`;
  return minify(begTag + content + endTag, {
    ...htmlMinifierOptions,
    conservativeCollapse: false,
    minifyJS: terserOptions({
      latestBuild: false, // Shared scripts should be ES5
      isTestBuild: true, // Don't need source maps
    }),
  }).then((wrapped) => (wrapTag ? wrapped.slice(begTag.length, -endTag.length) : wrapped));
};

// Function to generate a dev task for each project's configuration
// Note Currently WDS paths are hard-coded to only work for app
const genPagesDevTask =
  (pageEntries, inputRoot, outputRoot, useWDS = false, inputSub = "src/html") =>
  async () => {
    for (const [page, entries] of Object.entries(pageEntries)) {
      const content = renderTemplate(path.resolve(inputRoot, inputSub, `${page}.template`), {
        latestEntryJS: entries.map(
          (entry) => `${paths.app_publicPath}/frontend_latest/${entry}.js`
        ),
        es5EntryJS: entries.map((entry) => `${paths.app_publicPath}/frontend_es5/${entry}.js`),
      });
      fs.outputFileSync(path.resolve(outputRoot, page), content);
    }
  };

// Same as previous but for production builds
// (includes minification and hashed file names from manifest)
const genPagesProdTask =
  (pageEntries, inputRoot, outputRoot, outputLatest, outputES5, inputSub = "src/html") =>
  async () => {
    const latestManifest = fs.readJsonSync(path.resolve(outputLatest, "manifest.json"));
    const es5Manifest = outputES5 ? fs.readJsonSync(path.resolve(outputES5, "manifest.json")) : {};
    const minifiedHTML = [];
    for (const [page, entries] of Object.entries(pageEntries)) {
      const content = renderTemplate(path.resolve(inputRoot, inputSub, `${page}.template`), {
        latestEntryJS: entries.map((entry) => latestManifest[`${entry}.js`]),
        es5EntryJS: entries.map((entry) => es5Manifest[`${entry}.js`]),
        latestCustomPanelJS: latestManifest["custom-panel.js"],
        es5CustomPanelJS: es5Manifest["custom-panel.js"],
      });
      minifiedHTML.push(
        minifyHtml(content, path.extname(page)).then((minified) =>
          fs.outputFileSync(path.resolve(outputRoot, page), minified)
        )
      );
    }
    await Promise.all(minifiedHTML);
  };

// Map HTML pages to their required entrypoints
const APP_PAGE_ENTRIES = { "entrypoint.js": ["entrypoint"] };

gulp.task(
  "gen-pages-app-dev",
  genPagesDevTask(APP_PAGE_ENTRIES, paths.root_dir, paths.app_output_root)
);

gulp.task(
  "gen-pages-app-prod",
  genPagesProdTask(
    APP_PAGE_ENTRIES,
    paths.root_dir,
    paths.app_output_root,
    paths.app_output_latest,
    paths.app_output_es5
  )
);
