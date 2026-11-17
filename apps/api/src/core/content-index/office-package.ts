import { MAX_RESOURCE_BYTES } from "../uploads/resource-formats.ts";
import { UnreadableResourceError } from "./errors.ts";
import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";

export interface XmlElement {
    readonly tag: string;
    readonly attributes: Readonly<Record<string, string>>;
    readonly children: readonly XmlElement[];
    readonly text: string;
}

type RawXmlNode = Record<string, unknown>;

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const TEXT_NODE = "#text";
const ATTRIBUTES_KEY = ":@";
const ATTRIBUTE_PREFIX = "@_";

const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: ATTRIBUTE_PREFIX,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    textNodeName: TEXT_NODE,
});

/** Encrypted Office files are OLE compound files rather than ZIP packages. */
function isEncryptedPackage(data: Uint8Array): boolean {
    return OLE_SIGNATURE.every((byte, index) => data[index] === byte);
}

/** Inflates only the wanted parts and refuses packages whose wanted parts expand beyond the upload cap. */
export function readPackageParts(data: Uint8Array, wanted: (name: string) => boolean): Map<string, Uint8Array> {
    if (isEncryptedPackage(data)) {
        throw new UnreadableResourceError("protected");
    }

    let remainingBytes = MAX_RESOURCE_BYTES;

    try {
        const parts = unzipSync(data, {
            filter: ({ name, originalSize }) => {
                if (!wanted(name)) {
                    return false;
                }

                remainingBytes -= originalSize;

                if (remainingBytes < 0) {
                    throw new RangeError("Package parts are too large.");
                }

                return true;
            },
        });

        return new Map(Object.entries(parts));
    } catch (error) {
        throw new UnreadableResourceError("corrupt", error);
    }
}

export function parseXmlPart(parts: ReadonlyMap<string, Uint8Array>, name: string): XmlElement {
    const bytes = parts.get(name);

    if (!bytes) {
        throw new UnreadableResourceError("corrupt");
    }

    try {
        const nodes = parser.parse(bytes) as RawXmlNode[];
        const root = nodes.map((node) => toElement(node)).find((element) => !element.tag.startsWith("?") && element.tag !== TEXT_NODE);

        if (!root) {
            throw new Error("Empty XML part.");
        }

        return root;
    } catch (error) {
        throw new UnreadableResourceError("corrupt", error);
    }
}

function toElement(node: RawXmlNode): XmlElement {
    const tag = Object.keys(node).find((key) => key !== ATTRIBUTES_KEY) ?? "";
    const raw = node[ATTRIBUTES_KEY] as Record<string, string> | undefined;
    const attributes = Object.fromEntries(Object.entries(raw ?? {}).map(([key, value]) => [key.slice(ATTRIBUTE_PREFIX.length), value]));

    if (tag === TEXT_NODE) {
        return { tag: TEXT_NODE, attributes, children: [], text: String(node[TEXT_NODE]) };
    }

    const children = Array.isArray(node[tag]) ? (node[tag] as RawXmlNode[]).map((child) => toElement(child)) : [];

    return { tag, attributes, children, text: "" };
}

export function childNamed(element: XmlElement, tag: string): XmlElement | undefined {
    return element.children.find((child) => child.tag === tag);
}

export function descendantsNamed(element: XmlElement, tag: string): XmlElement[] {
    return element.children
        .filter((child) => child.tag !== "mc:Fallback")
        .flatMap((child) => (child.tag === tag ? [child] : descendantsNamed(child, tag)));
}

/** Text nodes inside the wanted tag, skipping the duplicate fallback copy of `mc:AlternateContent`. */
export function textWithin(element: XmlElement, textTag: string, separators: Readonly<Record<string, string>> = {}): string {
    if (element.tag === "mc:Fallback") {
        return "";
    }

    if (element.tag in separators) {
        return separators[element.tag]!;
    }

    if (element.tag === textTag) {
        return element.children.map((child) => child.text).join("");
    }

    return element.children.map((child) => textWithin(child, textTag, separators)).join("");
}
