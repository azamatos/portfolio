import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { collectedSchema, projectSchema } from "@/lib/projects/schema";

export const collections = {
  /** One YAML file per project, written by hand. The file name is the id: /projects/<id>. */
  projects: defineCollection({
    loader: glob({ pattern: "*.yaml", base: "./src/content/projects" }),
    schema: projectSchema,
  }),
  /**
   * What the refresh command collected for each project (values and shots), one JSON file per project. Not
   * _site.json, the site's own (BaseLayout reads it).
   */
  collected: defineCollection({
    loader: glob({
      pattern: ["*.json", "!_*.json"],
      base: "./src/data/collected",
    }),
    schema: collectedSchema,
  }),
};
