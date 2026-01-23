import z from "zod";

export const projectIdSchema = z.string().brand<"ProjectId">();
export type ProjectId = z.infer<typeof projectIdSchema>;

export const shortCodeCodec = z
  .codec(z.string(), z.string().toUpperCase().uppercase(), {
    encode: (val) => val.toUpperCase(),
    decode: (val) => val.toUpperCase(),
  })
  .brand<"ProjectShortCode">();
export type ProjectShortCode = z.infer<typeof shortCodeCodec>;
