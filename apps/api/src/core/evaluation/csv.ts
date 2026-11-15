export function parseCsv(text: string): string[][] {
    const characters = [...text];
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    let skipNext = false;

    for (const [position, character] of characters.entries()) {
        const next = characters[position + 1];

        if (skipNext) {
            skipNext = false;
        } else if (quoted) {
            if (character !== '"') {
                cell += character;
            } else if (next === '"') {
                cell += '"';
                skipNext = true;
            } else {
                quoted = false;
            }
        } else {
            switch (character) {
                case '"':
                    quoted = true;
                    break;
                case ",":
                    row.push(cell);
                    cell = "";
                    break;
                case "\r":
                case "\n":
                    skipNext = character === "\r" && next === "\n";
                    rows.push([...row, cell]);
                    row = [];
                    cell = "";
                    break;
                default:
                    cell += character;
            }
        }
    }

    return cell === "" && row.length === 0 ? rows : [...rows, [...row, cell]];
}

export function parseCsvRecords(text: string): Record<string, string>[] {
    const [header = [], ...rows] = parseCsv(text);

    return rows.map((row) => Object.fromEntries(header.map((name, column) => [name, row[column] ?? ""])));
}
