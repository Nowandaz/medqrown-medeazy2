import React from "react";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FormattedDemoText } from "./formatted-demo-text";

test("renders approved emphasis without interpreting untrusted HTML", () => {
  const markup = renderToStaticMarkup(
    <FormattedDemoText text={"The **radial artery** runs here.\n<script>alert(1)</script>"} />
  );
  assert.match(markup, /<strong>radial artery<\/strong>/);
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
});