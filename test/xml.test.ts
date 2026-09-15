import assert from "node:assert/strict";
import { test } from "node:test";
import { at, child, children, decodeEntities, encodeXml, parseXml, text } from "../src/core/saldeo/xml.ts";

test("parses elements, attributes, text, CDATA, comments and entities", () => {
    const root = parseXml(`<?xml version="1.0" encoding="UTF-8"?>
<!-- a comment <with> brackets -->
<RESPONSE xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <STATUS>OK</STATUS>
  <NAME a="1" b='two'>Kowalski &amp; S-ka &#x141;&#243;d&#378;</NAME>
  <RAW><![CDATA[<not a tag>]]></RAW>
  <EMPTY/>
  <PARAMETERS xsi:nil="true"/>
</RESPONSE>`);
    assert.equal(root.name, "RESPONSE");
    assert.equal(text(root, "STATUS"), "OK");
    assert.equal(text(root, "NAME"), "Kowalski & S-ka Łódź");
    assert.deepEqual(child(root, "NAME")?.attrs, { a: "1", b: "two" });
    assert.equal(text(root, "RAW"), "<not a tag>");
    assert.equal(text(root, "EMPTY"), undefined);
    assert.equal(child(root, "PARAMETERS")?.attrs["xsi:nil"], "true");
});

test("children, at and text walk the tree without throwing on absence", () => {
    const root = parseXml(`<A><B><C>1</C><C>2</C></B></A>`);
    assert.deepEqual(
        children(at(root, "B"), "C").map((node) => node.text),
        ["1", "2"],
    );
    assert.equal(at(root, "B", "D", "E"), undefined);
    assert.equal(text(at(root, "X"), "Y"), undefined);
});

test("a truncated document is an error, never an empty answer", () => {
    assert.throws(() => parseXml(`<RESPONSE><STATUS>OK</STATUS>`), /never closed/);
    assert.throws(() => parseXml(`<A></B>`), /unexpected closing tag/);
    assert.throws(() => parseXml(``), /no root/);
});

test("encodeXml and decodeEntities round-trip the five entities", () => {
    const raw = `a<b>&"c'`;
    assert.equal(decodeEntities(encodeXml(raw)), raw);
});
