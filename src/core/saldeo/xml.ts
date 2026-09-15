// A small XML reader for SaldeoSMART's answers: elements, attributes, text, CDATA, comments and the five entities plus
// numeric references. No namespaces, no DTDs, no validation; the API sends none of those. Enough that this extension
// carries no XML dependency into three bundles.

export interface XmlNode {
    readonly name: string;
    readonly attrs: Readonly<Record<string, string>>;
    readonly children: readonly XmlNode[];
    readonly text: string;
}

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export const decodeEntities = (value: string): string =>
    value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
        if (body.startsWith("#x")) {
            return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
        }
        if (body.startsWith("#")) {
            return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
        }
        return ENTITIES[body] ?? whole;
    });

export const encodeXml = (value: string): string =>
    value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);

interface Open {
    readonly name: string;
    readonly attrs: Record<string, string>;
    readonly children: XmlNode[];
    text: string;
}

const ATTR = /([^\s=\/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const parseAttrs = (source: string): Record<string, string> => {
    const attrs: Record<string, string> = {};
    for (const match of source.matchAll(ATTR)) {
        attrs[match[1] ?? ""] = decodeEntities(match[2] ?? match[3] ?? "");
    }
    return attrs;
};

// Throws on a document that does not close what it opened; a truncated answer must not read as an empty one.
export const parseXml = (source: string): XmlNode => {
    const stack: Open[] = [{ name: "", attrs: {}, children: [], text: "" }];
    let at = 0;
    const top = (): Open => stack[stack.length - 1] as Open;
    while (at < source.length) {
        const lt = source.indexOf("<", at);
        if (lt < 0) {
            top().text += decodeEntities(source.slice(at));
            break;
        }
        if (lt > at) {
            top().text += decodeEntities(source.slice(at, lt));
        }
        if (source.startsWith("<!--", lt)) {
            const end = source.indexOf("-->", lt + 4);
            if (end < 0) {
                throw new Error("xml: unterminated comment");
            }
            at = end + 3;
            continue;
        }
        if (source.startsWith("<![CDATA[", lt)) {
            const end = source.indexOf("]]>", lt + 9);
            if (end < 0) {
                throw new Error("xml: unterminated CDATA");
            }
            top().text += source.slice(lt + 9, end);
            at = end + 3;
            continue;
        }
        if (source.startsWith("<?", lt) || source.startsWith("<!", lt)) {
            const end = source.indexOf(">", lt);
            if (end < 0) {
                throw new Error("xml: unterminated declaration");
            }
            at = end + 1;
            continue;
        }
        const end = source.indexOf(">", lt);
        if (end < 0) {
            throw new Error("xml: unterminated tag");
        }
        const body = source.slice(lt + 1, end).trim();
        at = end + 1;
        if (body.startsWith("/")) {
            const name = body.slice(1).trim();
            const open = stack.pop();
            if (open === undefined || stack.length === 0 || open.name !== name) {
                throw new Error(`xml: unexpected closing tag </${name}>`);
            }
            top().children.push({ name: open.name, attrs: open.attrs, children: open.children, text: open.text });
            continue;
        }
        const selfClosing = body.endsWith("/");
        const inner = selfClosing ? body.slice(0, -1) : body;
        const space = inner.search(/\s/);
        const name = space < 0 ? inner : inner.slice(0, space);
        const attrs = space < 0 ? {} : parseAttrs(inner.slice(space));
        if (selfClosing) {
            top().children.push({ name, attrs, children: [], text: "" });
        } else {
            stack.push({ name, attrs, children: [], text: "" });
        }
    }
    if (stack.length !== 1) {
        throw new Error(`xml: <${top().name}> is never closed`);
    }
    const root = stack[0] as Open;
    const first = root.children[0];
    if (first === undefined) {
        throw new Error("xml: no root element");
    }
    return first;
};

export const child = (node: XmlNode | undefined, name: string): XmlNode | undefined => node?.children.find((entry) => entry.name === name);

export const children = (node: XmlNode | undefined, name: string): readonly XmlNode[] =>
    node === undefined ? [] : node.children.filter((entry) => entry.name === name);

// A child's trimmed text, or undefined when the element is absent or empty; "" is never an answer.
export const text = (node: XmlNode | undefined, name: string): string | undefined => {
    const value = child(node, name)?.text.trim();
    return value === undefined || value === "" ? undefined : value;
};

// Follows a path of element names; undefined the moment one is missing.
export const at = (node: XmlNode | undefined, ...path: readonly string[]): XmlNode | undefined =>
    path.reduce<XmlNode | undefined>((current, name) => child(current, name), node);
