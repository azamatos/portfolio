import type { APIRoute } from "astro";
import { SITE } from "@/site";

// Plain-text profile for AI assistants and crawlers (https://llmstxt.org).
export const GET: APIRoute = () => {
  const resumeUrl = new URL(SITE.resume.url, SITE.url).href;

  const body = `# ${SITE.name}

> ${SITE.role} (React, TypeScript, Node.js). ${SITE.availability}.

${SITE.summary}

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
