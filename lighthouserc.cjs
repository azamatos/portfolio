// Lighthouse CI (the Lighthouse step in .github/workflows/ci.yml) on the built site: the home page, every project's
// page (one per src/content/projects/<id>.yaml, so a new project is checked too) and the 404 page. Accessibility, best
// practices and SEO must be 100; the 404 page skips SEO, since it's kept out of search on purpose.

const { readdirSync } = require("node:fs");
const { join } = require("node:path");

const projects = readdirSync(join(__dirname, "src/content/projects"))
  .filter((file) => file.endsWith(".yaml"))
  .map(
    (file) => `http://localhost/projects/${file.slice(0, -".yaml".length)}/`,
  );

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
