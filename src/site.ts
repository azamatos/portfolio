// Everything the pages say about Azamat lives here, so copy changes happen in one place.
// Keep it in sync with the resume.
export const SITE = {
  url: "https://azamatos.com",
  name: "Azamat Jorayev",
  role: "Senior Full-Stack Engineer",
  title: "Azamat Jorayev — Senior Full-Stack Engineer",
  description:
    "Azamat Jorayev, senior full-stack engineer: 8+ years in React, TypeScript, and Node.js, from the database to the UI. Download the resume or get in touch.",
  shareDescription:
    "Senior full-stack engineer: 8+ years in React, TypeScript, and Node.js, from the database to the UI.",
  // The hero types these one after another ("I'm a …"). The first one is what search engines,
  // screen readers, and visitors without JavaScript or with reduced motion get.
  roles: [
    "senior full-stack engineer.",
    "frontend engineer.",
    "web developer.",
    "mobile developer.",
    "software engineer.",
  ],
  availability:
    "Open to senior frontend and full-stack roles · relocating to the EU",
  summary:
    "8+ years with React, TypeScript, and Node.js, owning features end to end, from the PostgreSQL data model and API to a polished UI. I led the frontend of Belet Video (100k+ active users) and was the sole developer of RocketPrep (10k+ users).",
  email: "hi@azamatos.com",
  resume: {
    // The full-stack, with-photo variant. Replace the file in public/ when the resume changes.
    url: "/Azamat_Jorayev_Resume.pdf",
    pages: 2,
  },
  links: {
    github: "https://github.com/azamatos",
    linkedin: "https://linkedin.com/in/igwt",
    telegram: "https://t.me/eldzhernone",
  },
} as const;
