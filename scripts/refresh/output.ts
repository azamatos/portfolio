// Writes src/data/collected/<id>.json: keys in the schema's order (values and shots in the config's), formatted as
// Prettier would. It's written on every run, since `refreshedAt` is the day the pages print as "checked".

import { writeFile } from "node:fs/promises";
import { format } from "prettier";
import {
  collectedSchema,
  type Collected,
} from "../../src/lib/projects/schema.ts";
import { COLLECTED_DIR } from "./config.ts";

export async function writeCollected(
  id: string,
  data: Collected,
): Promise<void> {
  // Parsing checks the file and puts every object's keys in the schema's order; records keep the order they came in.
  const valid = collectedSchema.parse(data);
  const text = await format(JSON.stringify(valid), { parser: "json" });
  await writeFile(new URL(`${id}.json`, COLLECTED_DIR), text);
}
