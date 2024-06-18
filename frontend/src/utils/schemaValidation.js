import { z } from "zod";

export default function generateSchema(pipeline) {
  const schemaFields = {};
  for (const [key, value] of Object.entries(pipeline)) {
    if (value == null) {
      schemaFields[key] = z.any().optional();
    } else if (typeof value === "object" && !Array.isArray(value)) {
      schemaFields[key] = generateSchema(value);
    } else if (key === "value") {
      schemaFields[key] = z.any().refine((val) => val.replace(/['"]+/g, '').trim().length !== 0, {message: "The input value of this block must contain at least 1 character(s)"})
    }
    else {
      schemaFields[key] = z.any().optional();
    }
  }
  return z.object(schemaFields);
}
