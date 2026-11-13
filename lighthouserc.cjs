// Lighthouse CI (the Lighthouse step in .github/workflows/ci.yml) on the built site: the home page, every project's
// page (one per folder in dist/projects/, so a new project is checked too and a hidden one isn't) and the 404 page.
// Accessibility, best practices and SEO must be 100; the 404 page skips SEO, since it's kept out of search on purpose.

const { readdirSync } = require("node:fs");
const { join } = require("node:path");

const projects = readdirSync(join(__dirname, "dist/projects"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => `http://localhost/projects/${entry.name}/`);

const scores = (seo) => ({
  "categories:performance": ["warn", { minScore: 0.95 }],
  "categories:accessibility": ["error", { minScore: 1 }],
  "categories:best-practices": ["error", { minScore: 1 }],
  ...(seo && { "categories:seo": ["error", { minScore: 1 }] }),
});

module.exports = {
  ci: {
    collect: {
      staticDistDir: "./dist",
      url: ["http://localhost/", ...projects, "http://localhost/404.html"],
      numberOfRuns: 3,
    },
    assert: {
      assertMatrix: [
        { matchingUrlPattern: "^(?!.*404)", assertions: scores(true) },
        { matchingUrlPattern: "404", assertions: scores(false) },
      ],
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
