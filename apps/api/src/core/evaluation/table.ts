export function markdownTable(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
    return [
        `| ${headers.join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...rows.map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");
}
