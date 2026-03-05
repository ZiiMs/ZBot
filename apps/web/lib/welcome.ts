export const DEFAULT_WELCOME_TEMPLATE = "Welcome {mention} to **{server}**!";

export type WelcomePreviewContext = {
  user: string;
  server: string;
  mention: string;
};

export type WelcomePreviewResult = {
  content: string;
  usedVariables: string[];
  unknownPlaceholders: string[];
};

export function renderWelcomeTemplate(
  template: string,
  context: WelcomePreviewContext
): WelcomePreviewResult {
  const usedVariables = new Set<string>();
  const unknownPlaceholders = new Set<string>();
  let content = "";

  let i = 0;
  while (i < template.length) {
    if (template[i] === "{") {
      const closeIndex = template.indexOf("}", i + 1);
      if (closeIndex !== -1) {
        const token = template.slice(i + 1, closeIndex);
        if (token.length === 0) {
          content += "{}";
        } else if (token === "user") {
          content += context.user;
          usedVariables.add("user");
        } else if (token === "server") {
          content += context.server;
          usedVariables.add("server");
        } else if (token === "mention") {
          content += context.mention;
          usedVariables.add("mention");
        } else {
          content += `{${token}}`;
          unknownPlaceholders.add(token);
        }

        i = closeIndex + 1;
        continue;
      }
    }

    content += template[i];
    i += 1;
  }

  return {
    content,
    usedVariables: Array.from(usedVariables).sort(),
    unknownPlaceholders: Array.from(unknownPlaceholders).sort()
  };
}
