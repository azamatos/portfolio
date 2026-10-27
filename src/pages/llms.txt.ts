import type { APIRoute } from "astro";
import { getProjects, projectsIntro } from "@/lib/projects";
import { SITE } from "@/site";

// Plain-text profile for AI assistants and crawlers (https://llmstxt.org).
export const GET: APIRoute = async () => {
  const resumeUrl = new URL(SITE.resume.url, SITE.url).href;
  const [projects, intro] = await Promise.all([getProjects(), projectsIntro()]);

  // One line each, from the same data as the pages, so it never drifts from them.
  const projectLines = projects.map((p) => {
    const page = new URL(p.path, SITE.url).href;
    const host = new URL(p.site).host;
    return `- [${p.name}](${page}): ${p.readme.headline} Status: ${p.statusText}. Site: [${host}](${p.site}). Source: [${p.repo}](${p.repoUrl}).`;
  });

  const body = `# ${SITE.name}

> ${SITE.role} (React, TypeScript, Node.js). ${SITE.availability}.

${SITE.summary}

## Projects

${intro.subtitle}

${projectLines.join("\n")}

## Links

- [Resume (PDF, ${SITE.resume.pages} pages)](${resumeUrl})
- [Email](mailto:${SITE.email})
- [GitHub](${SITE.links.github})
- [LinkedIn](${SITE.links.linkedin})
- [Telegram](${SITE.links.telegram})
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
