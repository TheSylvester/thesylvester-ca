declare module "*.mdx" {
  import type { MDXContent } from "mdx/types";

  export const article: unknown;
  const Content: MDXContent;
  export default Content;
}
